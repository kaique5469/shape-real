import type { FaixaMinutosAtivos } from "@/lib/analytics";
import { unitOf } from "./exercises";
import { completedSets } from "./progression";
import type { Session } from "./types";

/**
 * Rodada 3 (R3-4): tempo ativo e completude do treino. Leitores únicos: resumo, Histórico, página do aluno, relatório,
 * texto do link, Hoje e analytics passam por aqui, nunca por `finishedAt − startedAt` direto.
 *
 * Gravação (trilha S): o rascunho guarda um `TempoAtivo` (última atividade, tempo ativo e pausas acumulados). Cada
 * atividade (mudar o treino, voltar ao app) soma o intervalo desde a anterior quando ele tem até PAUSA_LONGA_MS; acima
 * disso é pausa e fica fora (com o aviso "Você ficou {X} fora"). No fim, `minutosAtivosAoFinalizar` dá o `activeMin`
 * da sessão; `plannedSets` é gravado antes do filtro de séries (`sessaoParaSalvar`, session-flow.ts).
 */

/** Sessão antiga, sem `activeMin`: a duração bruta (início ao fim) só aparece até este limite. */
export const MAX_MINUTOS_BRUTOS = 180;

/**
 * Minutos do treino para mostrar, ou null = não mostrar (nunca inventa):
 *  - com `activeMin` (sessão nova, inclusive corrigida no resumo): esse valor, arredondado;
 *  - sem `activeMin` (sessão antiga): a duração bruta, só se for de 1 a MAX_MINUTOS_BRUTOS min. Data ilegível, fim
 *    antes do início (relógio ou fuso mudado) ou acima do limite: null.
 */
export function activeMinutes(s: Pick<Session, "startedAt" | "finishedAt" | "activeMin">): number | null {
  if (typeof s.activeMin === "number" && Number.isFinite(s.activeMin)) {
    const min = Math.round(s.activeMin);
    return min > 0 ? min : null;
  }
  if (!s.finishedAt) return null;
  const bruto = Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60_000);
  return Number.isFinite(bruto) && bruto > 0 && bruto <= MAX_MINUTOS_BRUTOS ? bruto : null;
}

/** De onde vêm os minutos mostrados: ativos (gravados no fim), ajustados pela pessoa ou a duração registrada (antiga). */
export type TipoDuracao = "ativos" | "ajustado" | "registrada";

/** Minutos para mostrar e de onde vieram; null = não mostrar minutos (a sessão continua contando em treinos e séries). */
export function duracaoDoTreino(s: Pick<Session, "startedAt" | "finishedAt" | "activeMin" | "activeEdited">): { min: number; tipo: TipoDuracao } | null {
  const min = activeMinutes(s);
  if (min === null) return null;
  const ativo = typeof s.activeMin === "number" && Number.isFinite(s.activeMin);
  return { min, tipo: !ativo ? "registrada" : s.activeEdited === true ? "ajustado" : "ativos" };
}

/**
 * Texto curto dos minutos: "42 min ativos", "40 min ativos (ajustado)" ou, na sessão antiga, "55 min (início ao fim)"
 * (a duração registrada, nunca chamada de ativa). null sem minutos.
 */
export function duracaoTexto(d: { min: number; tipo: TipoDuracao } | null): string | null {
  if (!d) return null;
  if (d.tipo === "registrada") return `${d.min} min (início ao fim)`;
  return d.tipo === "ajustado" ? `${d.min} min ativos (ajustado)` : `${d.min} min ativos`;
}

/** Faixa aceita na correção dos minutos no resumo final. */
export const MIN_AJUSTE = 1;
export const MAX_AJUSTE = 300;

/**
 * Correção dos minutos no resumo final ("ajustado"). Inteiro de MIN_AJUSTE a MAX_AJUSTE: grava `activeMin` e
 * `activeEdited`. Fora disso (vazio, 0, negativo, fração, texto) devolve null: a tela mantém o valor de antes.
 */
export function ajustarMinutosAtivos<S extends Pick<Session, "activeMin" | "activeEdited">>(s: S, min: number): S | null {
  if (!Number.isInteger(min) || min < MIN_AJUSTE || min > MAX_AJUSTE) return null;
  return { ...s, activeMin: min, activeEdited: true };
}

// ───────────────────────── Completude ─────────────────────────

/**
 * Séries feitas e planejadas. `planejadas` só existe com `plannedSets` gravado no fim do treino (rodada 3); sem ele,
 * null e nunca "parcial" (não derivar de `sets.length` da sessão salva: os exercícios sem série feita já saíram).
 */
export function sessionCompleteness(s: Pick<Session, "exercises" | "plannedSets">): { feitas: number; planejadas: number | null } {
  let feitas = 0;
  for (const ex of s.exercises) feitas += completedSets(ex).length;
  const p = s.plannedSets;
  return { feitas, planejadas: typeof p === "number" && Number.isInteger(p) && p > 0 ? p : null };
}

/**
 * Limiar do rótulo "parcial" (DECISIONS, rodada 3): menos de metade das séries planejadas. O "{feitas} de {planejadas}"
 * aparece sempre que for menor; só o rótulo espera o limiar (23 de 24 não é "parcial").
 */
export const LIMIAR_PARCIAL = 0.5;

export interface Completude {
  feitas: number;
  planejadas: number | null;
  /** "1 de 24 séries" quando feitas < planejadas; null sem `plannedSets` ou com o treino inteiro. */
  texto: string | null;
  /** Abaixo de LIMIAR_PARCIAL das planejadas. Sempre false sem `plannedSets`. */
  parcial: boolean;
}

export function completude(s: Pick<Session, "exercises" | "plannedSets">): Completude {
  const { feitas, planejadas } = sessionCompleteness(s);
  if (planejadas === null || feitas >= planejadas) return { feitas, planejadas, texto: null, parcial: false };
  return { feitas, planejadas, texto: `${feitas} de ${planejadas} ${planejadas === 1 ? "série" : "séries"}`, parcial: feitas < planejadas * LIMIAR_PARCIAL };
}

/**
 * Faixa de minutos ATIVOS do `workout_completed.minutos_ativos` (nunca o bruto). null = sem minutos para mostrar.
 * < 15, 15 a < 30, 30 a < 45, 45 a < 60, 60 a 90, > 90.
 */
export function faixaMinutosAtivos(min: number | null): FaixaMinutosAtivos | null {
  if (min === null || !Number.isFinite(min) || min <= 0) return null;
  if (min < 15) return "<15";
  if (min < 30) return "15-30";
  if (min < 45) return "30-45";
  if (min < 60) return "45-60";
  if (min <= 90) return "60-90";
  return ">90";
}

// ───────────────────────── Relógio do rascunho ─────────────────────────

/**
 * Intervalo sem atividade a partir do qual o tempo vira pausa e sai do treino. Descanso normal, troca curta de app e
 * conversa no meio do treino ficam abaixo disso e contam inteiros.
 */
export const PAUSA_LONGA_MS = 30 * 60_000;

/** Relógio do treino gravado no rascunho (`WorkoutDraft.tempo`). Ausente em rascunhos de antes da rodada 3. */
export interface TempoAtivo {
  /** Última atividade registrada (ISO). */
  lastActivityAt: string;
  /** Tempo ativo acumulado até `lastActivityAt`, em ms. */
  activeMs: number;
  /** Pausas longas acumuladas (fora do treino), em ms. */
  pausedMs: number;
}

/** Relógio de um treino que começa agora (o início conta como a primeira atividade). */
export function iniciarTempo(startedAt: string): TempoAtivo {
  return { lastActivityAt: startedAt, activeMs: 0, pausedMs: 0 };
}

const isIso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const msOk = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** `tempo` lido do rascunho gravado; qualquer parte inválida → undefined (o treino abre sem minutos ativos). */
export function tempoFromDraft(value: unknown): TempoAtivo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (!isIso(v.lastActivityAt) || !msOk(v.activeMs) || !msOk(v.pausedMs)) return undefined;
  return { lastActivityAt: v.lastActivityAt, activeMs: v.activeMs, pausedMs: v.pausedMs };
}

/**
 * Uma atividade em `nowMs`. O intervalo desde a anterior:
 *  - até PAUSA_LONGA_MS: entra inteiro no tempo ativo;
 *  - acima: é pausa (`pausaMs` > 0, para o aviso), menos o que `justificadoMs` cobre (minutos de cardio que acabaram de
 *    ser marcados: a esteira de 40 min não é pausa). Se o que sobra fica até PAUSA_LONGA_MS, o intervalo todo conta;
 *  - negativo ou ilegível (relógio ou fuso mudado): não soma nada e recomeça a contar de agora. Nunca dá negativo.
 */
export function registrarAtividade(t: TempoAtivo, nowMs: number, justificadoMs = 0): { tempo: TempoAtivo; pausaMs: number } {
  if (!Number.isFinite(nowMs)) return { tempo: t, pausaMs: 0 };
  const now = new Date(nowMs).toISOString();
  const gap = nowMs - Date.parse(t.lastActivityAt);
  if (!Number.isFinite(gap) || gap < 0) return { tempo: { ...t, lastActivityAt: now }, pausaMs: 0 };
  const coberto = Math.min(gap, Math.max(0, Number.isFinite(justificadoMs) ? justificadoMs : 0));
  const resto = gap - coberto;
  if (resto <= PAUSA_LONGA_MS) return { tempo: { lastActivityAt: now, activeMs: t.activeMs + gap, pausedMs: t.pausedMs }, pausaMs: 0 };
  return { tempo: { lastActivityAt: now, activeMs: t.activeMs + coberto, pausedMs: t.pausedMs + resto }, pausaMs: resto };
}

/** Minutos ativos no toque em "Finalizar" (o intervalo desde a última atividade segue a mesma regra). */
export function minutosAtivosAoFinalizar(t: TempoAtivo, nowMs: number): number {
  return Math.round(registrarAtividade(t, nowMs).tempo.activeMs / 60_000);
}

/**
 * Minutos de cardio (séries contadas em minutos) que passaram a feitas entre dois estados do treino, em ms: justificam
 * um intervalo longo em `registrarAtividade`. Série é identificada pelo uid do registro e pela posição.
 */
export function cardioNovoMs(antes: Pick<Session, "exercises"> | null | undefined, depois: Pick<Session, "exercises">): number {
  let ms = 0;
  for (const ex of depois.exercises) {
    if (unitOf(ex.exerciseId, ex.unit) !== "min") continue;
    const prev = antes?.exercises.find((e) => e.uid === ex.uid);
    ex.sets.forEach((s, i) => {
      const was = prev?.sets[i];
      if (s.done && (s.reps ?? 0) > 0 && !(was?.done && (was.reps ?? 0) > 0)) ms += (s.reps ?? 0) * 60_000;
    });
  }
  return ms;
}

/** "45 min", "1 h 20 min", "8 h". */
function fmtFora(ms: number): string {
  const total = Math.max(1, Math.round(ms / 60_000));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Aviso da retomada depois de uma pausa longa (sem culpa; o tempo só não entra na conta). */
export function textoPausa(pausaMs: number): string | null {
  if (!Number.isFinite(pausaMs) || pausaMs <= PAUSA_LONGA_MS) return null;
  return `Você ficou ${fmtFora(pausaMs)} fora. Esse tempo não entra no treino.`;
}
