"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { reportError } from "@/lib/analytics";
import { calendarDaysSince, sessionsThisWeek, weeklyGoal } from "@/lib/domain/attention";
import { crefLabel } from "@/lib/domain/cref";
import { getExercise } from "@/lib/domain/exercises";
import { firstName, waLink, waPhone } from "@/lib/domain/format";
import { todayISO } from "@/lib/domain/ids";
import { RETURN_AFTER_DAYS, bestSet, completedSets, fmtMark, recordSetOf, volumeDaSessao, weekStart } from "@/lib/domain/progression";
import { revealAfterResize, scrollDeltaToReveal } from "@/lib/domain/session-flow";
import { completude } from "@/lib/domain/completude";
import type { ExerciseLog, Profile, Program, Session, SetLog } from "@/lib/domain/types";

/** Carrega dados assíncronos com estados de carregamento/erro e recarga manual. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fnRef.current());
    } catch (e) {
      reportError(e, "carregar");
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}

/** Próximo dia da ficha ativa, seguindo a rotação a partir do último treino registrado. */
export function nextDayKey(program: Program, sessions: Session[]): string {
  const last = sessions.filter((s) => s.programId === program.id && s.dayKey).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!last) return program.days[0]?.key ?? "A";
  const i = program.days.findIndex((d) => d.key === last.dayKey);
  return program.days[(i + 1) % program.days.length]?.key ?? program.days[0]!.key;
}

// ---- Campos no celular (U8a) -------------------------------------------------------

/**
 * Seleciona todo o texto do campo agora e de novo logo depois: o Safari do iPhone pode pôr o cursor no fim depois do
 * foco (o toque termina depois do `focus`), e aí "35" digitado sobre "30" viraria "3035". A seleção é refeita no
 * próximo tique e no 1º `mouseup` depois do foco (até 1 s; na hora, depois dos ouvintes do próprio campo, e de novo no
 * tique seguinte), só se o campo continua em foco e ninguém digitou nada.
 * Use em campos `inputMode` (texto): em `type="number"` o setSelectionRange lança.
 */
export function selectAllSoon(el: HTMLInputElement | HTMLTextAreaElement): void {
  const value = el.value;
  const again = () => {
    if (typeof document === "undefined" || document.activeElement !== el || el.value !== value) return;
    try {
      el.setSelectionRange(0, el.value.length);
    } catch {
      /* campo que não aceita seleção */
    }
  };
  try {
    el.select();
  } catch {
    /* idem */
  }
  setTimeout(again, 0);
  // No toque, o mouseup chega depois do foco e pode levar o cursor para o fim. Ouvido na janela (fase de bolha): roda
  // depois de quem ouve no próprio campo; o tique seguinte cobre o cursor posto pela ação padrão do navegador.
  const onUp = () => {
    window.removeEventListener("mouseup", onUp);
    again();
    setTimeout(again, 0);
  };
  window.addEventListener("mouseup", onUp);
  setTimeout(() => window.removeEventListener("mouseup", onUp), 1000);
}

/**
 * Teclado abrindo sobre a linha em foco (U8 §3.2b). Nos navegadores que encolhem a página quando o teclado abre, o
 * campo tocado pode ficar atrás do rodapé fixo; o `scroll-padding` só resolve a troca de campo com o teclado já
 * aberto. Aqui: no foco de um campo dentro de `main`, guarda a altura da janela; quando ela encolhe pelo menos
 * KEYBOARD_MIN_SHRINK e a pessoa não arrastou a tela, rola na hora (sem animação) o mínimo para a linha da série
 * (`li[data-set]`, com carga, reps e ✓) ou o próprio campo (anotação) caber entre o cabeçalho e o rodapé, com 8 px
 * de folga: a mesma área da rolagem depois do ✓ (scrollDeltaToReveal). Sem teclado que encolhe a página (Safari do
 * iPhone, Chrome com `resizes-visual`), não há `resize` e nada acontece.
 */
export function useKeepFocusedRowVisible(opts: {
  main: RefObject<HTMLElement | null>;
  header: RefObject<HTMLElement | null>;
  footer: RefObject<HTMLElement | null>;
  enabled: boolean;
}): void {
  const { main, header, footer, enabled } = opts;
  useEffect(() => {
    const root = main.current;
    if (!enabled || !root || typeof window === "undefined") return;
    let field: HTMLElement | null = null;
    let heightAtFocus = window.innerHeight;
    let dragged = false;
    let raf = 0;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
      field = t;
      heightAtFocus = window.innerHeight;
      dragged = false;
    };
    const onTouchMove = () => {
      dragged = true;
    };
    const reveal = () => {
      raf = 0;
      const el = field;
      const fieldFocused = Boolean(el && document.activeElement === el && root.contains(el));
      if (!el || !revealAfterResize({ heightAtFocus, height: window.innerHeight, fieldFocused, dragged })) return;
      const head = header.current?.getBoundingClientRect();
      const foot = footer.current?.getBoundingClientRect();
      const row = (el.closest("li[data-set]") ?? el).getBoundingClientRect();
      const delta = scrollDeltaToReveal({ top: row.top, bottom: row.bottom }, { top: (head?.bottom ?? 0) + 8, bottom: (foot?.top ?? window.innerHeight) - 8 });
      if (Math.abs(delta) >= 2) window.scrollBy({ top: delta, behavior: "instant" });
    };
    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(reveal);
    };
    root.addEventListener("focusin", onFocusIn);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [main, header, footer, enabled]);
}

/**
 * Barra fixa embaixo fora da sessão ("Salvar ajustes" da dieta, "Salvar ficha" do editor): enquanto ela tem conteúdo,
 * o `scroll-padding-bottom` da página desconta a distância da barra até o pé da tela (o menu inferior e a área
 * segura, lidos do `bottom` calculado dela) mais a altura da barra e 8 px de folga. Assim o foco do teclado (Tab, o
 * "próximo" do teclado) nunca para atrás da barra nem do menu (WCAG 2.4.11). Barra vazia ou desmontada: volta o
 * padrão do globals.css (menu + 8 px). Mesmo padrão da sessão (sessao/page.tsx, U8 §3.2a).
 */
export function useStickyBarScrollPadding(bar: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const el = bar.current;
    if (!enabled || !el || typeof window === "undefined") return;
    const css = document.documentElement.style;
    const apply = () => {
      const h = el.offsetHeight;
      const bottom = Number.parseFloat(getComputedStyle(el).bottom);
      if (!h || !Number.isFinite(bottom)) css.removeProperty("scroll-padding-bottom");
      else css.scrollPaddingBottom = `${Math.ceil(bottom + h + 8)}px`;
    };
    apply();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      css.removeProperty("scroll-padding-bottom");
    };
  }, [bar, enabled]);
}

export function relativeDay(iso: string | null, now = new Date()): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) return `há ${Math.floor(days / 7)} sem.`;
  return d.toLocaleDateString("pt-BR");
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  return new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("pt-BR", opts).replace(".", "");
}

export function fmtNum(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

// ---- Hoje -------------------------------------------------------------------------

/** "Sua semana" no Hoje: treinos de segunda a domingo contra a meta (ficha ativa ou perfil). */
export interface WeekGoal {
  done: number;
  /** null sem meta: o card continua como era (volume da semana). */
  goal: number | null;
  /** Meta batida: o Hoje diz só "Meta da semana batida", sem convite a treino extra. */
  met: boolean;
}

/** Mesma conta do "N de M na semana" de /alunos (sessionsThisWeek + weeklyGoal), para personal e aluno verem o mesmo número. */
export function weekGoal(sessions: readonly Pick<Session, "startedAt">[], programDaysPerWeek?: number | null, profileDaysPerWeek?: number | null, now = new Date()): WeekGoal {
  const done = sessionsThisWeek(sessions.map((s) => s.startedAt), now);
  const goal = weeklyGoal(programDaysPerWeek, profileDaysPerWeek);
  return { done, goal, met: goal !== null && done >= goal };
}

/**
 * Aviso de volta depois de pausa: último treino há RETURN_AFTER_DAYS dias (de calendário) ou mais — a mesma regra que
 * faz a sugestão de carga voltar com ~90% da última carga. O texto não promete "10%": no degrau real do aparelho (leg press
 * de 10 em 10 kg a 40 kg) a redução pode ser maior. null quando não há pausa (ou nenhum treino).
 */
export function returnNotice(sessions: readonly Pick<Session, "startedAt">[], now = new Date()): string | null {
  const aviso = avisoDePausa(sessions, now);
  return aviso?.tipo === "volta" ? aviso.texto : null;
}

// ---- Hoje: treino registrado, descanso e volta (rodada 3, R3-8) --------------------------------------------------

/**
 * Dias de calendário sem registro a partir dos quais o Hoje convida a retomar, sem culpa e dispensável. De
 * RETURN_AFTER_DAYS em diante vale o aviso de volta (cargas mais leves), que não muda.
 */
export const RETOMAR_APOS_DIAS = 7;

export const TEXTO_RETOMAR = "Faz alguns dias que você não registra. Quer retomar ou ajustar a rotina?";

/** Data legível: data ilegível (registro estragado) nunca vira "hoje" nem "há N dias". */
const temData = (s: Pick<Session, "startedAt">) => typeof s.startedAt === "string" && Number.isFinite(Date.parse(s.startedAt));
const maisRecentePrimeiro = (a: Pick<Session, "startedAt">, b: Pick<Session, "startedAt">) => Date.parse(b.startedAt) - Date.parse(a.startedAt);
/** "Treino B" ou "Treino livre". */
const nomeDoTreino = (s: Pick<Session, "dayKey">) => (s.dayKey ? `Treino ${s.dayKey}` : "Treino livre");
/** Mesmo dia do calendário no fuso do aparelho (um treino às 23h30 é de hoje, mesmo já sendo amanhã em UTC). */
const ehHoje = (s: Pick<Session, "startedAt">, now: Date) => todayISO(new Date(s.startedAt)) === todayISO(now);
/** Próximo dia da ficha ativa ("Treino C"), pela mesma rotação do card de próximo treino. null sem ficha com dias. */
function proximoDia(program: Program | null | undefined, sessions: readonly Session[]): string | null {
  return program && program.days.length ? `Treino ${nextDayKey(program, [...sessions])}` : null;
}

export type AvisoDePausa =
  /** 7 a 13 dias: convite sem culpa, dispensável. */
  | { tipo: "retomar"; dias: number; texto: string }
  /** 14 ou mais: o aviso de volta de sempre (as cargas sugeridas vêm mais leves). */
  | { tipo: "volta"; dias: number; texto: string };

/**
 * Pausa desde o último treino registrado (dias de calendário no fuso do aparelho). null sem treino, com treino há
 * menos de RETOMAR_APOS_DIAS dias ou com o último treino no futuro (relógio mudado: nunca inventa pausa).
 */
export function avisoDePausa(sessions: readonly Pick<Session, "startedAt">[], now = new Date()): AvisoDePausa | null {
  let last: string | null = null;
  for (const s of sessions) if (temData(s) && (!last || Date.parse(s.startedAt) > Date.parse(last))) last = s.startedAt;
  if (!last) return null;
  const dias = calendarDaysSince(last, now);
  if (dias >= RETURN_AFTER_DAYS) return { tipo: "volta", dias, texto: `Faz ${dias} dias desde o último treino. Hoje as cargas sugeridas vêm mais leves.` };
  if (dias >= RETOMAR_APOS_DIAS) return { tipo: "retomar", dias, texto: TEXTO_RETOMAR };
  return null;
}

/** Id do treino mais recente (pela data de início legível); null sem nenhum. */
export function ultimoTreinoId(sessions: readonly Pick<Session, "id" | "startedAt">[]): string | null {
  let last: Pick<Session, "id" | "startedAt"> | null = null;
  for (const s of sessions) if (temData(s) && (!last || Date.parse(s.startedAt) > Date.parse(last.startedAt))) last = s;
  return last?.id ?? null;
}

/**
 * "Dispensar" do convite de retomar (7 a 13 dias) vale para a pausa atual: guarda só o id do último treino (aleatório,
 * sem data nem conteúdo), por pessoa. Treino novo e outra pausa trazem o convite de volta. Conveniência deste
 * aparelho: fora de `sr:v1:*` e da cópia de segurança; sem armazenamento, o convite só volta a aparecer.
 */
const retomarKey = (userId: string) => `sr:hoje-retomar:${userId}`;

export function retomarDispensadoPara(userId: string): string | null {
  try {
    return localStorage.getItem(retomarKey(userId));
  } catch {
    return null;
  }
}

/** Grava o "Dispensar" do convite de retomar para o último treino de agora. false = não gravou (some só nesta tela). */
export function dispensarRetomar(userId: string, ultimoId: string): boolean {
  try {
    localStorage.setItem(retomarKey(userId), ultimoId);
    return true;
  } catch {
    return false;
  }
}

/** O convite de retomar aparece: pausa de 7 a 13 dias e não dispensado para o último treino de agora. */
export function mostraRetomar(aviso: AvisoDePausa | null, ultimoId: string | null, dispensadoPara: string | null): boolean {
  return aviso?.tipo === "retomar" && (ultimoId === null || dispensadoPara !== ultimoId);
}

/** Card "Treino de hoje registrado": o dia já está fechado, o próximo aparece só como secundário. */
export interface TreinoDeHoje {
  /** "Treino B registrado hoje", "Treino livre registrado hoje" ou "2 treinos registrados hoje". */
  titulo: string;
  /** "1 de 24 séries" só com `plannedSets` e menos séries feitas que as planejadas (R3-4); senão null, sem número. */
  completude: string | null;
  /** O título com a completude: "Treino B registrado hoje · 1 de 24 séries". */
  linha: string;
  /** "Próximo: Treino C" (secundário, sem empurrar outro treino hoje); null sem ficha ativa com dias. */
  proximo: string | null;
}

/**
 * Treino(s) registrado(s) hoje, no fuso do aparelho. null sem treino hoje (o Hoje fica como era). Não oferece
 * "Continuar" (a sessão já está salva; abrir /sessao de novo criaria outra sessão no mesmo dia).
 */
export function treinoDeHoje(sessions: readonly Session[], program: Program | null | undefined, now = new Date()): TreinoDeHoje | null {
  const deHoje = sessions.filter((s) => temData(s) && ehHoje(s, now)).sort(maisRecentePrimeiro);
  if (!deHoje.length) return null;
  const titulo = deHoje.length === 1 ? `${nomeDoTreino(deHoje[0]!)} registrado hoje` : `${deHoje.length} treinos registrados hoje`;
  const comp = deHoje.length === 1 ? completude(deHoje[0]!).texto : null;
  const prox = proximoDia(program, sessions);
  return { titulo, completude: comp, linha: comp ? `${titulo} · ${comp}` : titulo, proximo: prox ? `Próximo: ${prox}` : null };
}

/**
 * Último treino parcial (abaixo do limiar de "parcial" da R3-4, só com `plannedSets`): "Treino A ficou parcial (1 de
 * 24). Próximo: Treino B." null quando o último treino é de hoje (o card de hoje cobre), quando faz RETOMAR_APOS_DIAS
 * dias ou mais (o convite de retomar vale mais) ou quando não foi parcial. "Escolher dia" já permite repetir o A.
 */
export function ultimoTreinoParcial(sessions: readonly Session[], program: Program | null | undefined, now = new Date()): string | null {
  const ultimo = sessions.filter(temData).sort(maisRecentePrimeiro)[0];
  if (!ultimo || ehHoje(ultimo, now) || calendarDaysSince(ultimo.startedAt, now) >= RETOMAR_APOS_DIAS) return null;
  const c = completude(ultimo);
  if (!c.parcial || c.planejadas === null) return null;
  const prox = proximoDia(program, sessions);
  return `${nomeDoTreino(ultimo)} ficou parcial (${c.feitas} de ${c.planejadas}).${prox ? ` Próximo: ${prox}.` : ""}`;
}

/**
 * Volume da semana (segunda a domingo, fuso do aparelho) pela convenção única `volumeDaSessao` (R3-6 B): o
 * `volumeKg` gravado na sessão é só cache e pode vir de uma regra antiga (assistida contada, série por tempo).
 */
export function volumeDaSemana(sessions: readonly Session[], now = new Date()): number {
  const semana = weekStart(now.toISOString());
  let kg = 0;
  for (const s of sessions) if (temData(s) && weekStart(s.startedAt) === semana) kg += volumeDaSessao(s);
  return kg;
}

// ---- Painel do personal (/alunos) -------------------------------------------------------------------------------

/**
 * Cabeçalho e card da semana do painel (rodada 3, R3-15). No modo local o personal só tem os treinos que o aluno
 * mandou: o painel fala em "mandar treino", nunca em "treinou". Na nuvem, os textos de antes.
 */
export function textosDoPainel(local: boolean): { sub: string; semana: string } {
  return local
    ? { sub: "Quem mandou treino, quem está com a ficha vencendo e quem está sem notícias.", semana: "Mandaram treino na semana" }
    : { sub: "Quem treinou, quem está com a ficha vencendo e quem precisa de um empurrão.", semana: "Treinaram na semana" };
}

/** Personal de quem o aluno vê o Hoje: "Acompanhamento de Camila Duarte · CREF 012345-G/SP" e "Falar com Camila". */
export interface CoachContact {
  /** Nome como o personal informou; null quando é o provisório "Personal" (ou vazio). */
  name: string | null;
  /** "CREF 012345-G/SP"; null sem CREF. */
  credential: string | null;
  /** A linha inteira, como aparece na tela. */
  line: string;
  /** Texto do botão. */
  cta: string;
  /** Conversa do WhatsApp com o personal; null sem telefone válido (o botão some). */
  href: string | null;
}

type CoachInfo = { id?: string; name?: string | null; phone?: string | null; cref?: string | null };

/**
 * Contato do personal para o Hoje do aluno. Vale o que chegou no link (`remote`, de user.remoteCoach); o cadastro do
 * personal guardado neste aparelho (`linked`) completa telefone e CREF quando é o mesmo personal, ou serve sozinho
 * quando não houve link (aluno vinculado de outro jeito). null sem personal.
 */
export function coachContact(remote: Profile["remoteCoach"] | null | undefined, linked: CoachInfo | null | undefined): CoachContact | null {
  const extra = linked && (!remote || !linked.id || linked.id === remote.id) ? linked : null;
  if (!remote && !extra) return null;
  const pick = (k: "name" | "phone" | "cref") => remote?.[k]?.trim() || extra?.[k]?.trim() || "";
  const rawName = pick("name");
  const name = rawName && rawName !== "Personal" ? rawName : null;
  const cref = pick("cref");
  // Mesma regra de coachSignature (ficha, dieta e relatório; há teste de paridade).
  const credential = crefLabel(cref);
  const lead = name ? `Acompanhamento de ${name}` : "Com acompanhamento do seu personal";
  const line = credential ? `${lead} · ${credential}` : lead;
  const first = name ? firstName(name) : null;
  const phone = pick("phone");
  return {
    name,
    credential,
    line,
    cta: first ? `Falar com ${first}` : "Falar com seu personal",
    href: waPhone(phone) ? waLink(first ? `Oi, ${first}!` : "Oi!", phone) : null,
  };
}

/** Um item de "Recordes recentes" no Hoje. */
export interface RecentRecord {
  date: string;
  exerciseId: string;
  name: string;
  /** A série que bateu a marca: "42,5 kg × 8", "15 reps", "60 s". null se o registro do exercício sumiu. */
  mark: string | null;
}

/** Série de referência quando o histórico mudou e o recorde não se reproduz: a melhor com carga, ou a de mais reps/segundos. */
function fallbackSet(log: ExerciseLog): Pick<SetLog, "loadKg" | "reps"> | null {
  const best = bestSet(log);
  if (best && best.loadKg > 0) return best;
  let top: SetLog | null = null;
  for (const s of completedSets(log)) if (!top || (s.reps ?? 0) > (top.reps ?? 0)) top = s;
  return top;
}

/**
 * Os últimos recordes (do treino mais recente para o mais antigo), cada um com a série que bateu a marca — a mesma de
 * recordSetOf, usada no resumo do treino. Peso corporal mostra reps (ou segundos), nunca "0 kg × 15".
 */
export function recentRecords(sessions: readonly Session[], max = 5): RecentRecord[] {
  const history = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return history
    .flatMap((s) => s.prs.map((id) => ({ s, id })))
    .slice(0, max)
    .map(({ s, id }) => {
      const log = s.exercises.find((e) => e.exerciseId === id);
      const hit = recordSetOf(s, history, id);
      const set = hit?.set ?? (log ? fallbackSet(log) : null);
      return { date: s.startedAt, exerciseId: id, name: log?.name ?? getExercise(id)?.name ?? id, mark: set ? fmtMark(set, id, (hit?.log ?? log)?.unit) : null };
    });
}
