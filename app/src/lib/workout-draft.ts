import type { UnmarkBand } from "@/lib/analytics";
import type { Exercise, ExerciseLog, Program, Session, Unit } from "@/lib/domain/types";
import { getExercise, unitOf } from "@/lib/domain/exercises";
import { uid } from "@/lib/domain/ids";
import { isPainSuggestion, lastPerformance, suggestFromHistory, type LoadSuggestion, type SuggestionKind } from "@/lib/domain/progression";
import { restFromDraft, type RestTimer } from "@/lib/domain/rest";
import { setCounts } from "@/lib/domain/session-checks";
import { assignLinks } from "@/lib/domain/session-flow";
import { iniciarTempo, tempoFromDraft, type TempoAtivo } from "@/lib/domain/session-time";

/**
 * Rascunho do treino em andamento (um por usuário, guardado no aparelho).
 * A tela de treino grava a cada alteração; "Hoje" lê para oferecer a retomada.
 */
export const draftKey = (userId: string) => `sr:draft:${userId}`;

/**
 * O rascunho como fica gravado em sr:draft:{userId}. Campos novos entram sempre opcionais: um rascunho gravado por uma
 * versão anterior do app continua abrindo.
 */
export interface WorkoutDraft {
  session: Session;
  /** Sugestão de carga por registro (uid). `kind` pode ser "retorno" (volta após pausa); rascunhos antigos nunca têm. */
  suggestions: Record<string, LoadSuggestion>;
  /** Descanso configurado por registro (uid), em segundos. */
  restSec: Record<string, number>;
  /** Descanso em andamento: sobrevive a recarregar a página ou o iOS fechar o app. Ausente em rascunhos antigos. */
  rest?: RestTimer;
  /**
   * Grupos de bi-set/tri-set/supersérie fixados no início do treino: uid do registro → id do grupo
   * ("<dia>:<índice do 1º membro>"). Só no aparelho: não vai para o histórico nem para o personal. Ausente em
   * rascunhos de antes da U1d (a tela usa a heurística de sempre). Nunca é podado: guarda também quem saiu.
   */
  links?: Record<string, string>;
  /**
   * Exercício que estava aberto na tela (uid do registro): a retomada (recarregar, o iOS fechar o app) volta nele.
   * Ausente em rascunhos antigos e com todos os exercícios fechados (abre o 1º com série pendente).
   */
  openUid?: string;
  /**
   * Relógio do treino (rodada 3, R3-4): última atividade, tempo ativo e pausas longas acumulados, para o `activeMin` da
   * sessão sobreviver a recarregar a página. Ausente em rascunhos antigos: o treino salvo fica sem `activeMin` (vale a
   * regra da duração registrada, nunca um número inventado).
   */
  tempo?: TempoAtivo;
  /**
   * Quando a pessoa tocou em "Continuar aquele treino" (rodada 3, R3-10). Um rascunho retomado não volta a perguntar
   * pela regra das 6 h ao recarregar (sem sinal, a tela recarregava pela cópia do service worker e perguntava de novo,
   * em laço). Ausente em rascunhos antigos e nos que nunca precisaram da pergunta.
   */
  resumedAt?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * Lê um rascunho gravado. Tolerante a rascunhos antigos (sem `rest`, sem `suggestions`/`restSec`) e a dados
 * corrompidos: devolve null se não houver uma sessão utilizável, e descarta só as partes inválidas.
 */
export function parseDraft(raw: string | null | undefined): WorkoutDraft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || !isRecord(data.session)) return null;
  const session = data.session as unknown as Session;
  if (typeof session.startedAt !== "string" || !Array.isArray(session.exercises)) return null;
  if (!session.exercises.every((e) => isRecord(e) && typeof e.uid === "string" && Array.isArray(e.sets))) return null;

  const suggestions: Record<string, LoadSuggestion> = {};
  if (isRecord(data.suggestions))
    for (const [k, v] of Object.entries(data.suggestions)) {
      if (!isRecord(v) || typeof v.text !== "string" || typeof v.kind !== "string") continue;
      const loadKg = typeof v.loadKg === "number" && Number.isFinite(v.loadKg) ? v.loadKg : null;
      // Sugestão com dor (R3-7) nunca tem carga, mesmo num rascunho alterado à mão.
      suggestions[k] = v.kind === "dor" ? { kind: "dor", loadKg: null, text: v.text } : { kind: v.kind as Exclude<SuggestionKind, "dor">, loadKg, text: v.text };
    }
  const restSec: Record<string, number> = {};
  if (isRecord(data.restSec)) for (const [k, v] of Object.entries(data.restSec)) if (typeof v === "number" && Number.isFinite(v) && v >= 0) restSec[k] = v;
  const rest = restFromDraft(data.rest);
  const links = parseLinks(data.links);
  const out: WorkoutDraft = { session, suggestions, restSec };
  if (rest) out.rest = rest;
  if (links) out.links = links;
  if (typeof data.openUid === "string" && data.openUid) out.openUid = data.openUid;
  const tempo = tempoFromDraft(data.tempo);
  if (tempo) out.tempo = tempo;
  if (typeof data.resumedAt === "string" && Number.isFinite(Date.parse(data.resumedAt))) out.resumedAt = data.resumedAt;
  return out;
}

/** Até quanto tempo depois do início (ou da retomada) o rascunho do mesmo treino reabre direto, sem perguntar. */
export const RASCUNHO_FRESCO_MS = 6 * 3_600_000;

/**
 * O que fazer com o rascunho gravado ao abrir /sessao (a regra que a tela já tinha, agora pura e com a retomada):
 *  - "retomar": é o mesmo treino (ficha e dia do endereço) e foi começado, ou retomado, há menos de RASCUNHO_FRESCO_MS;
 *  - "perguntar": outro treino, ou um antigo, com série feita ou preenchida (nada some sem a pessoa escolher);
 *  - "novo": sem trabalho para proteger: abre o treino pedido.
 * `resumedAt` (R3-10) conta como novo início para a regra das 6 h: depois de "Continuar aquele treino", recarregar
 * (inclusive sem sinal) continua no treino em vez de perguntar de novo.
 */
export function decidirRascunho(parsed: WorkoutDraft, alvo: { programId: string | null; dayKey: string | null }, nowMs: number): "retomar" | "perguntar" | "novo" {
  const s = parsed.session;
  const sameDay = (s.programId ?? null) === alvo.programId && (s.dayKey ?? null) === (alvo.dayKey ?? s.dayKey ?? null);
  const desde = Date.parse(parsed.resumedAt ?? s.startedAt);
  const fresh = Number.isFinite(desde) && nowMs - desde < RASCUNHO_FRESCO_MS;
  if (sameDay && fresh) return "retomar";
  return draftHasWork(s) ? "perguntar" : "novo";
}

/** O rascunho com a retomada registrada agora ("Continuar aquele treino"). */
export function marcarRetomado(draft: WorkoutDraft, now: Date = new Date()): WorkoutDraft {
  return { ...draft, resumedAt: now.toISOString() };
}

/**
 * Exercício a abrir ao retomar um rascunho: o que estava aberto (`openUid`), se ainda está no treino; senão o 1º com
 * série pendente (a regra de sempre); senão o 1º exercício; sem exercícios, null.
 */
export function resumeOpenUid(session: Pick<Session, "exercises">, openUid?: string): string | null {
  const all = session.exercises;
  if (openUid && all.some((e) => e.uid === openUid)) return openUid;
  return all.find((e) => e.sets.some((s) => !s.done))?.uid ?? all[0]?.uid ?? null;
}

/** `links` do rascunho: só pares string → string; ausente ou sem formato de mapa → undefined (rascunho antigo). */
function parseLinks(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === "string" && v) out[k] = v;
  return out;
}

/** Prescrição padrão de um exercício adicionado (ou trocado para outra unidade) na hora, conforme a unidade. */
export function defaultPlan(e: Pick<Exercise, "id" | "compound">): { sets: number; repsMin: number; repsMax: number; restSec: number } {
  const unit = unitOf(e.id);
  if (unit === "min") return { sets: 1, repsMin: 15, repsMax: 15, restSec: 0 };
  if (unit === "seg") return { sets: 3, repsMin: 30, repsMax: 45, restSec: 45 };
  return { sets: 3, repsMin: 8, repsMax: 12, restSec: e.compound ? 120 : 75 };
}

/**
 * Rascunho novo para o dia `dayKey` da ficha (ou treino livre, sem ficha): séries vazias com a carga sugerida, o
 * descanso de cada exercício e os grupos de bi-set fixados agora (`links`), para uma remoção no meio do treino
 * desfazer o grupo em vez de juntar o exercício que sobrou com outro.
 */
export function buildDraft(userId: string, program: Program | null, dayKey: string | null, history: Session[]): WorkoutDraft {
  const day = program?.days.find((d) => d.key === dayKey) ?? null;
  const suggestions: Record<string, LoadSuggestion> = {};
  const restSec: Record<string, number> = {};
  const exercises: ExerciseLog[] = (day?.exercises ?? []).map((p) => {
    const unit = unitOf(p.exerciseId, p.unit);
    // Com a data do último registro (retorno após pausa) e os anteriores (trava contra erro de digitação).
    const sug = suggestFromHistory(history, p, p.exerciseId);
    const logUid = uid();
    if (keepsSuggestion(unit, sug)) suggestions[logUid] = sug;
    restSec[logUid] = p.restSec;
    const load = initialLoad(unit, getExercise(p.exerciseId)?.implement, sug, p.loadKg);
    return {
      uid: logUid,
      exerciseId: p.exerciseId,
      name: p.name,
      unit,
      planned: { sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax, loadKg: p.loadKg, restSec: p.restSec, technique: p.technique, notes: p.notes },
      sets: Array.from({ length: p.sets }, () => ({ loadKg: load, reps: null, done: false })),
    };
  });
  const startedAt = new Date().toISOString();
  return {
    session: {
      id: uid(),
      userId,
      programId: program?.id ?? null,
      programName: program?.name,
      dayKey: day?.key,
      dayTitle: day?.title?.trim() || undefined,
      startedAt,
      exercises,
      volumeKg: 0,
      prs: [],
    },
    suggestions,
    restSec,
    links: assignLinks(day?.key ?? "livre", exercises),
    tempo: iniciarTempo(startedAt),
  };
}

/**
 * Sugestão guardada no rascunho: as de carga só em exercício por repetições (como sempre); a de dor (R3-7) em qualquer
 * unidade, porque o texto é de cuidado ("pare este exercício"), não de carga.
 */
function keepsSuggestion(unit: Unit, sug: LoadSuggestion): boolean {
  return unit === "reps" || isPainSuggestion(sug);
}

/**
 * Carga com que as séries do registro começam:
 *  - cardio em minutos: nenhuma;
 *  - dor marcada da última vez (R3-7): nenhuma, nem a da ficha (que é a última carga feita, espelhada no fim do treino):
 *    seria um "manter" automático. A última carga só aparece em "Última vez";
 *  - peso corporal, elástico e séries por tempo: a carga é opcional ("peso extra") e nunca começa com 0 kg;
 *  - o resto: a sugerida, senão a da ficha.
 */
export function initialLoad(unit: Unit, implement: Exercise["implement"] | undefined, sug: LoadSuggestion | null | undefined, plannedLoad: number | null | undefined): number | null {
  if (unit === "min" || isPainSuggestion(sug)) return null;
  const optionalLoad = unit !== "reps" || implement === "peso_corporal" || implement === "elastico";
  if (optionalLoad) return (unit === "reps" ? (sug?.loadKg ?? null) : null) || plannedLoad || null;
  return sug?.loadKg ?? plannedLoad ?? null;
}

/**
 * Registro de um exercício adicionado na hora ("Adicionar exercício"): prescrição padrão da unidade, sugestão de carga
 * (por repetições, ou a de dor em qualquer unidade) e séries com a carga sugerida, senão a primeira da última vez. Com
 * dor marcada da última vez, as séries começam vazias.
 */
export function addedLog(pick: Pick<Exercise, "id" | "name" | "compound">, history: Session[], logUid: string): { log: ExerciseLog; suggestion: LoadSuggestion | null; restSec: number } {
  const unit = unitOf(pick.id);
  const planned = defaultPlan(pick);
  const sug = suggestFromHistory(history, planned, pick.id);
  const suggestion = keepsSuggestion(unit, sug) ? sug : null;
  const lastLoad = lastPerformance(history, pick.id)?.sets[0]?.loadKg ?? null;
  const load = unit !== "reps" || isPainSuggestion(sug) ? null : (sug.loadKg ?? lastLoad);
  return {
    log: { uid: logUid, exerciseId: pick.id, name: pick.name, unit, planned, sets: Array.from({ length: planned.sets }, () => ({ loadKg: load, reps: null, done: false })) },
    suggestion,
    restSec: planned.restSec,
  };
}

/**
 * Troca o exercício do registro `targetUid` só neste treino (aparelho ocupado). O `uid` continua (o grupo de bi-set e a
 * posição também). Mesma unidade: mantém o número de séries, a faixa e a técnica; outra unidade: prescrição padrão
 * (`defaultPlan`) com a técnica de antes. As séries recomeçam vazias, com a carga sugerida para o novo exercício. A
 * observação do personal para o exercício trocado é descartada (não vale para o substituto). A ficha não muda.
 * Devolve o mesmo rascunho se o registro não existir.
 */
export function swapInDraft(draft: WorkoutDraft, targetUid: string, pick: Pick<Exercise, "id" | "name" | "compound">, history: Session[]): WorkoutDraft {
  const cur = draft.session.exercises.find((x) => x.uid === targetUid);
  if (!cur) return draft;
  const unit = unitOf(pick.id);
  const sameUnit = (cur.unit ?? "reps") === unit;
  const planned = sameUnit && cur.planned ? { ...cur.planned, loadKg: null, notes: undefined } : { ...defaultPlan(pick), technique: cur.planned?.technique };
  const found = suggestFromHistory(history, planned, pick.id);
  const sug = keepsSuggestion(unit, found) ? found : null;
  // Por tempo, a carga extra começa vazia (como sempre); com dor, sempre vazia (a sugestão de dor não tem carga).
  const load = unit === "reps" ? (sug?.loadKg ?? null) : null;
  const suggestions = { ...draft.suggestions };
  if (sug) suggestions[targetUid] = sug;
  else delete suggestions[targetUid];
  const length = Math.max(1, sameUnit ? cur.sets.length : planned.sets);
  return {
    ...draft,
    suggestions,
    session: {
      ...draft.session,
      exercises: draft.session.exercises.map((x) =>
        x.uid === targetUid ? { ...x, exerciseId: pick.id, name: pick.name, unit, planned, sets: Array.from({ length }, () => ({ loadKg: load, reps: null, done: false })) } : x,
      ),
    },
  };
}

/** Grava o rascunho com o descanso atual (null = sem descanso). Nunca lança (modo privado, cota cheia). */
export function saveDraft(userId: string, draft: WorkoutDraft, rest: RestTimer | null): void {
  try {
    // `rest: undefined` some do JSON: sem descanso, o campo não é gravado.
    localStorage.setItem(draftKey(userId), JSON.stringify({ ...draft, rest: rest ?? undefined }));
  } catch {
    /* sem armazenamento: o treino continua na tela */
  }
}

export interface DraftInfo {
  programId: string | null;
  dayKey?: string;
  dayTitle?: string;
  startedAt: string;
  done: number;
  total: number;
  /** Séries com reps digitadas e ainda sem ✓ (também são trabalho em andamento: nada pode sumir sem aviso). */
  filled: number;
  /** Endereço que reabre este treino. */
  href: string;
}

export function draftHref(session: Pick<Session, "programId" | "dayKey">): string {
  return session.programId && session.dayKey ? `/sessao?p=${session.programId}&d=${encodeURIComponent(session.dayKey)}` : "/sessao";
}

/** O rascunho tem trabalho que não pode ser sobrescrito sem aviso: série feita ou série preenchida sem ✓. */
export function draftHasWork(session: Pick<Session, "exercises">): boolean {
  const c = setCounts({ exercises: session.exercises.map((e) => ({ sets: e.sets ?? [] })) });
  return c.done + c.filledUnmarked > 0;
}

/** "3 de 21 séries feitas", "3 de 21 séries feitas e 1 preenchida sem marcar", "2 séries preenchidas sem marcar". */
export function draftProgressText(c: { done: number; total: number; filled: number }): string {
  const n = c.filled;
  if (!c.done) return n === 1 ? "1 série preenchida sem marcar" : `${n} séries preenchidas sem marcar`;
  const feitas = `${c.done} de ${c.total} séries feitas`;
  return n ? `${feitas} e ${n === 1 ? "1 preenchida" : `${n} preenchidas`} sem marcar` : feitas;
}

/** Resumo do treino em andamento, ou null se não houver nenhum com série feita ou preenchida. */
export function readDraftInfo(userId: string): DraftInfo | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const session = (JSON.parse(raw) as { session?: Session }).session;
    if (!session?.exercises) return null;
    const c = setCounts({ exercises: session.exercises.map((e) => ({ sets: e.sets ?? [] })) });
    if (!c.done && !c.filledUnmarked) return null;
    return {
      programId: session.programId ?? null,
      dayKey: session.dayKey,
      dayTitle: session.dayTitle,
      startedAt: session.startedAt,
      done: c.done,
      total: c.total,
      filled: c.filledUnmarked,
      href: draftHref(session),
    };
  } catch {
    return null;
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* modo privado */
  }
}

// ───────────────────────── Apoio da tela de treino (funções puras) ─────────────────────────

/** Faixa do atraso entre o fim do descanso e a próxima série (evento descanso_atraso; nunca o valor exato). */
export type RestDelayBand = "0-15s" | "15-60s" | "60s+";

export function restDelayBand(overSec: number): RestDelayBand {
  const s = Number.isFinite(overSec) ? Math.max(0, overSec) : 0;
  return s < 15 ? "0-15s" : s < 60 ? "15-60s" : "60s+";
}

/** Faixa do tempo entre marcar e desmarcar uma série (evento serie_desmarcada; nunca o valor exato). */
export function unmarkBand(sinceSec: number): UnmarkBand {
  const s = Number.isFinite(sinceSec) ? Math.max(0, sinceSec) : 0;
  return s <= 10 ? "ate_10s" : s <= 60 ? "10_60s" : "mais_60s";
}

/** Tipos de sugestão medidos no evento carga_sugerida_editada. */
export type SuggestionTipo = "aumentar" | "manter" | "reduzir" | "retorno";
const TIPOS: ReadonlySet<string> = new Set<SuggestionTipo>(["aumentar", "manter", "reduzir", "retorno"]);

/**
 * A carga pré-preenchida pela sugestão foi mudada nas séries feitas? Só para sugestões com carga (aumentar, manter,
 * reduzir, retorno) e exercícios com série feita; senão null. Nada de valores de carga sai daqui, só o tipo e o sim/não.
 */
export function suggestionEdit(log: Pick<ExerciseLog, "sets">, suggestion: Pick<LoadSuggestion, "kind" | "loadKg"> | undefined): { tipo: SuggestionTipo; editada: boolean } | null {
  if (!suggestion || suggestion.loadKg === null || !TIPOS.has(suggestion.kind)) return null;
  const done = log.sets.filter((s) => s.done && (s.reps ?? 0) > 0);
  if (!done.length) return null;
  return { tipo: suggestion.kind as SuggestionTipo, editada: done.some((s) => (s.loadKg ?? null) !== suggestion.loadKg) };
}

/** "62,5" → 62.5 (número escrito em pt-BR). NaN se não for número. */
export function parsePtNumber(text: string): number {
  return /^\d+(,\d+)?$/.test(text) ? Number(text.replace(",", ".")) : Number.NaN;
}

/** Casas decimais de um número escrito em pt-BR ("62,5" → 1). */
export function decimalsOf(text: string): number {
  const i = text.indexOf(",");
  return i < 0 ? 0 : text.length - i - 1;
}

/** Uma linha de "Desde o último Treino B" separada para a tela (nome truncável, detalhe sempre inteiro). */
export interface CompareLineParts {
  /** "Agachamento" (vazio se a linha não tiver "Nome: "). */
  name: string;
  /** "60 → 62,5 kg", "+1 rep com 40 kg". */
  detail: string;
  /** Quando o detalhe é "A → B": o número novo anima a partir do anterior. */
  arrow?: { head: string; fromText: string; from: number; toText: string; to: number; tail: string };
}

export function splitCompareLine(line: string): CompareLineParts {
  const cut = line.lastIndexOf(": ");
  const name = cut < 0 ? "" : line.slice(0, cut);
  const detail = cut < 0 ? line : line.slice(cut + 2);
  const m = /^(\D*?)(\d+(?:,\d+)?) → (\d+(?:,\d+)?)(.*)$/.exec(detail);
  if (!m) return { name, detail };
  const [, head = "", fromText = "", toText = "", tail = ""] = m;
  const from = parsePtNumber(fromText);
  const to = parsePtNumber(toText);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { name, detail };
  return { name, detail, arrow: { head, fromText, from, toText, to, tail } };
}

/** Saída suave (easeOutCubic) para os números que animam do valor anterior ao novo; t entre 0 e 1. */
export function tween(from: number, to: number, t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return from + (to - from) * (1 - (1 - p) ** 3);
}
