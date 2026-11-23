"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportError } from "@/lib/analytics";
import { calendarDaysSince, sessionsThisWeek, weeklyGoal } from "@/lib/domain/attention";
import { crefLabel } from "@/lib/domain/cref";
import { getExercise } from "@/lib/domain/exercises";
import { firstName, waLink, waPhone } from "@/lib/domain/format";
import { RETURN_AFTER_DAYS, bestSet, completedSets, fmtMark, recordSetOf } from "@/lib/domain/progression";
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
  let last: string | null = null;
  for (const s of sessions) if (!last || s.startedAt.localeCompare(last) > 0) last = s.startedAt;
  if (!last) return null;
  const days = calendarDaysSince(last, now);
  return days >= RETURN_AFTER_DAYS ? `Faz ${days} dias desde o último treino. Hoje as cargas sugeridas vêm mais leves.` : null;
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
