"use client";

import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, Check, ChevronDown, Minus, Play, Plus, Square, Timer, Trash2, TrendingUp, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { BarbellView } from "@/components/brand";
import { ExercisePicker } from "@/components/exercise-picker";
import { Alert, Badge, Button, Dialog, Skeleton, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { UNIT_LABEL, getExercise, unitOf } from "@/lib/domain/exercises";
import { firstName, fmtRest, fmtScheme } from "@/lib/domain/format";
import { TECHNIQUE_LABEL } from "@/lib/domain/generator";
import { uid } from "@/lib/domain/ids";
import {
  assumedReps,
  compareWithLastSameDay,
  completedSets,
  detectPRs,
  firstOfWeek,
  firstRecordSet,
  fmtMark,
  lastPerformance,
  priorSets,
  recordFlags,
  recordSetOf,
  sessionVolume,
  suggestFromHistory,
  weekStreak,
  type LoadSuggestion,
} from "@/lib/domain/progression";
import { fmtClock, fmtOvertime, nextSetOf, restEndedAgoText, restFromDraft, restPhase, shiftRest, shouldStartRest, startRest, type RestTimer } from "@/lib/domain/rest";
import { filledUnmarkedTitle, finishGate, markFilledDone, setCounts, setRowDescription, setRowState } from "@/lib/domain/session-checks";
import { dissolvedNote, isLinkDissolved, linkGroups, linkLabel } from "@/lib/domain/session-flow";
import type { ExerciseLog, Program, Session, SetLog, Unit } from "@/lib/domain/types";
import { reportError, track } from "@/lib/analytics";
import { fmtNum } from "@/lib/hooks";
import { buildDraft, clearDraft, decimalsOf, defaultPlan, draftHasWork, draftHref, draftKey, draftProgressText, parseDraft, restDelayBand, saveDraft, splitCompareLine, suggestionEdit, tween, type WorkoutDraft } from "@/lib/workout-draft";
import { SendToCoach } from "@/components/transfer-share";

export default function SessaoPage() {
  return (
    <Suspense fallback={<SessionSkeleton />}>
      <Sessao />
    </Suspense>
  );
}

/** Rascunho do treino (gravado em sr:draft:{userId}; ver workout-draft.ts). O descanso fica num estado à parte e é gravado junto. */
type Draft = WorkoutDraft;

const SOUND_KEY = "sr:sound";
/** Por quanto tempo a linha "Recorde: …" fica no rodapé. */
const RECORD_LINE_MS = 2500;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function Sessao() {
  const { user, repo } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const programId = params.get("p");
  const dayKey = params.get("d");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [swapUid, setSwapUid] = useState<string | null>(null);
  const [hold, setHold] = useState<{ logUid: string; index: number; startedAt: number; max: number } | null>(null);
  const [sound, setSound] = useState(true);
  const audio = useRef<AudioContext | null>(null);
  const [rest, setRest] = useState<RestTimer | null>(null);
  // Fim do descanso já percebido (uma vez por descanso): se foi percebido tarde (recarregou, voltou de outro app) e o que anunciar.
  const [restEnd, setRestEnd] = useState<{ until: number; late: boolean; announce: string } | null>(null);
  // Quando o último descanso acabou: mede o atraso até a próxima série, mesmo se a pessoa tocou "OK" antes.
  const restEndedAt = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  // Diálogos do "Finalizar": a contagem fica guardada enquanto o diálogo fecha (sem piscar "null séries").
  const [pendingAsk, setPendingAsk] = useState({ open: false, count: 0 });
  const [filledAsk, setFilledAsk] = useState({ open: false, count: 0 });
  const [dropLog, setDropLog] = useState<ExerciseLog | null>(null);
  // Recorde ao vivo: linha no rodapé por ~2,5 s; comemora uma vez por exercício na sessão.
  const [liveRecord, setLiveRecord] = useState<{ name: string; mark: string; at: number } | null>(null);
  const celebrated = useRef(new Set<string>());
  // Séries (`uid:índice`) cujas reps/segundos o app preencheu sozinho (✓ sem digitar, cronômetro): desmarcar limpa o valor.
  const assumed = useRef(new Set<string>());
  const finishBtn = useRef<HTMLButtonElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const [footH, setFootH] = useState(0);
  // Outro treino ficou em andamento: nada é sobrescrito até a pessoa escolher o que fazer com ele.
  const [conflict, setConflict] = useState<{ saved: Draft; fresh: Draft } | null>(null);
  const loaded = useRef(false);

  // Carrega ficha + histórico; retoma rascunho salvo se for do mesmo treino.
  useEffect(() => {
    if (!user || loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const [prog, hist] = await Promise.all([programId ? repo.getProgram(programId) : Promise.resolve(null), repo.listSessions(user.id)]);
        setProgram(prog);
        setHistory(hist);
        let d: Draft | null = null;
        let pending: Draft | null = null;
        // Rascunhos antigos (sem descanso salvo, sugestões sem "retorno") abrem igual; corrompido = como se não houvesse.
        const parsed = parseDraft(readStorage(draftKey(user.id)));
        if (parsed) {
          const sameDay = parsed.session.programId === (prog?.id ?? null) && (parsed.session.dayKey ?? null) === (dayKey ?? parsed.session.dayKey ?? null);
          const fresh = Date.now() - new Date(parsed.session.startedAt).getTime() < 6 * 3_600_000;
          // Série preenchida sem ✓ também é trabalho: nada é sobrescrito sem a pessoa escolher.
          const hasWork = draftHasWork(parsed.session);
          if (sameDay && fresh) d = parsed;
          else if (hasWork) pending = parsed;
        }
        const resumed = Boolean(d);
        d ??= buildDraft(user.id, prog, dayKey, hist);
        if (pending) {
          setConflict({ saved: pending, fresh: d });
          return;
        }
        begin(d, !resumed, hist);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível abrir o treino.");
      }
    })();
  }, [user, repo, programId, dayKey]);

  /** Abre um rascunho na tela (novo ou retomado), com o descanso que estava contando. */
  function begin(d: Draft, isNew: boolean, hist: Session[] = history) {
    setDraft(d);
    setRest(restFromDraft(d.rest));
    // Recorde já marcado antes de recarregar não é comemorado de novo.
    celebrated.current = new Set(d.session.exercises.filter((l) => firstRecordSet(l, hist, d.session) >= 0).map((l) => l.exerciseId));
    setOpen(d.session.exercises.find((e) => e.sets.some((x) => !x.done))?.uid ?? d.session.exercises[0]?.uid ?? null);
    if (!d.session.exercises.length) setPicker(true);
    if (isNew) track("workout_started", { program: Boolean(d.session.programId), day: d.session.dayKey ?? "livre" });
  }

  /** Retoma o treino que tinha ficado em andamento (pode ser de outro dia ou de outra ficha). */
  async function resumeSaved() {
    if (!conflict) return;
    const saved = conflict.saved;
    setConflict(null);
    if ((saved.session.programId ?? null) !== (program?.id ?? null)) {
      const prog = saved.session.programId ? await repo.getProgram(saved.session.programId).catch(() => null) : null;
      setProgram(prog);
    }
    begin(saved, false);
    router.replace(draftHref(saved.session), { scroll: false });
  }

  // Salva rascunho (com o descanso em andamento) a cada alteração: sobrevive a recarregar a página ou fechar o app.
  useEffect(() => {
    if (draft && user && !summary) saveDraft(user.id, draft, rest);
  }, [draft, rest, user, summary]);

  // Relógio (cronômetro do treino + descanso). Na volta de outro app, atualiza na hora em vez de esperar o próximo tique.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    const wake = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  useEffect(() => {
    try {
      setSound(localStorage.getItem(SOUND_KEY) !== "0");
    } catch {}
  }, []);

  /** Prepara o áudio num toque do usuário (exigência do iOS) para o aviso sonoro funcionar depois. */
  const unlockAudio = useCallback(() => {
    if (!sound) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio.current ??= new Ctor();
      void audio.current.resume();
    } catch {}
  }, [sound]);

  const beep = useCallback(
    (times = 2) => {
      const ctx = audio.current;
      if (!ctx || !sound) return;
      try {
        for (let k = 0; k < times; k++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          gain.gain.value = 0.18;
          osc.connect(gain).connect(ctx.destination);
          const t = ctx.currentTime + k * 0.28;
          osc.start(t);
          osc.stop(t + 0.16);
        }
      } catch {}
    },
    [sound],
  );

  // Fim do descanso: a barra continua (estado de fim) e o aviso toca uma vez — só se o fim foi percebido na hora
  // (até ~5 s depois). Voltando de outro app ou recarregando depois disso, nada de bipe atrasado. Vencido há mais de
  // 10 min, o descanso é descartado.
  useEffect(() => {
    if (!rest) return;
    const ph = restPhase(rest, now);
    if (ph.phase === "none" || ph.phase === "expired") {
      setRest(null);
      return;
    }
    if (ph.phase !== "ended" || restEnd?.until === rest.until) return;
    const late = !ph.justEnded;
    setRestEnd({ until: rest.until, late, announce: late ? restEndedAgoText(ph.overSec) : "Descanso acabou" });
    restEndedAt.current = rest.until;
    if (!late) {
      navigator.vibrate?.([180, 80, 180]);
      beep(2);
    }
  }, [now, rest, restEnd, beep]);

  // A linha "Recorde: …" some sozinha.
  useEffect(() => {
    if (!liveRecord) return;
    const t = setTimeout(() => setLiveRecord(null), RECORD_LINE_MS);
    return () => clearTimeout(t);
  }, [liveRecord]);

  // Mantém a tela acesa durante o treino. O sistema solta a trava ao trocar de app, então pede de novo na volta.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      nav.wakeLock
        ?.request("screen")
        .then((l) => {
          if (gone) void l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, []);

  // Altura do rodapé fixo (descanso, recorde, erro, Finalizar): o fim da lista nunca fica escondido atrás dele.
  const live = Boolean(draft) && !summary;
  useEffect(() => {
    const el = footRef.current;
    if (!live || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFootH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [live]);

  const update = useCallback((logUid: string, fn: (log: ExerciseLog) => ExerciseLog) => {
    setDraft((d) => (d ? { ...d, session: { ...d.session, exercises: d.session.exercises.map((e) => (e.uid === logUid ? fn(e) : e)) } } : d));
  }, []);

  const removeLog = (logUid: string) => setDraft((d) => (d ? { ...d, session: { ...d.session, exercises: d.session.exercises.filter((e) => e.uid !== logUid) } } : d));

  const setField = (logUid: string, i: number, patch: Partial<SetLog>) => {
    // Valor digitado pela pessoa deixa de ser "assumido": desmarcar depois não apaga o que ela escreveu.
    if (patch.reps !== undefined) assumed.current.delete(`${logUid}:${i}`);
    update(logUid, (log) => ({ ...log, sets: log.sets.map((s, j) => (j === i ? { ...s, ...patch } : j > i && patch.loadKg !== undefined && !s.done ? { ...s, loadKg: patch.loadKg } : s)) }));
  };

  // Grupos de bi-set em vigor: os fixados no início do treino (rascunho), entre os exercícios que continuam nele.
  const links = useMemo(() => linkGroups(draft?.session.exercises ?? [], draft?.links), [draft?.session.exercises, draft?.links]);

  // Recorde ao vivo (estado derivado, nunca salvo): índice da 1ª série recorde de cada registro, ou -1.
  // Mesma regra (setRecord) que detectPRs usa no fim: os dois nunca discordam.
  const recordAt = useMemo(() => {
    const out: Record<string, number> = {};
    if (draft) for (const log of draft.session.exercises) out[log.uid] = firstRecordSet(log, history, draft.session);
    return out;
  }, [draft, history]);

  // Próxima série por fazer (texto da barra de descanso): a do exercício aberto, senão a do próximo com série pendente.
  const nextUp = useMemo(() => {
    const all = draft?.session.exercises ?? [];
    const start = Math.max(0, all.findIndex((e) => e.uid === open));
    for (let k = 0; k < all.length; k++) {
      const n = nextSetOf(all[(start + k) % all.length]!);
      if (n) return n;
    }
    return null;
  }, [draft, open]);

  /** Atraso entre o fim do descanso e a próxima série (só a faixa, nunca o valor exato). */
  const trackRestDelay = () => {
    const end = restEndedAt.current;
    if (end === null) return;
    restEndedAt.current = null;
    track("session_feature_used", { feature: "descanso_atraso", faixa: restDelayBand((Date.now() - end) / 1000) });
  };

  /** A série recém-marcada bateu recorde? Comemora a 1ª vez do exercício na sessão: linha no rodapé e vibração curta. */
  const celebrateRecord = (log: ExerciseLog, i: number, doneSet: SetLog): boolean => {
    if (!draft || celebrated.current.has(log.exerciseId)) return false;
    const next = { ...log, sets: log.sets.map((s, j) => (j === i ? doneSet : s)) };
    if (!recordFlags(next, priorSets(history, log.exerciseId, draft.session))[i]) return false;
    celebrated.current.add(log.exerciseId);
    setLiveRecord({ name: log.name, mark: fmtMark(doneSet, log.exerciseId, log.unit), at: Date.now() });
    track("pr_achieved", { live: true });
    return true;
  };

  /**
   * Depois de uma série feita: recorde ao vivo, descanso (ou sequência do bi-set) e avanço para o próximo exercício.
   * `doneSet` é a série como ficou (o estado ainda não aplicou o setDraft). `quiet`: quem chamou já vibrou.
   */
  const afterDone = (log: ExerciseLog, i: number, doneSet: SetLog, quiet = false) => {
    if (summary) return;
    const record = celebrateRecord(log, i, doneSet);
    if (record) navigator.vibrate?.([40, 60, 120]);
    else if (!quiet) navigator.vibrate?.(30);
    trackRestDelay();
    const all = draft?.session.exercises ?? [];
    const link = links[log.uid];
    const lastSet = i === log.sets.length - 1;
    const pending = (e: ExerciseLog) => (e.uid === log.uid ? e.sets.some((s, j) => !s.done && j !== i) : e.sets.some((s) => !s.done));
    if (link && link.pos < link.members.length - 1) {
      // Bi-set/tri-set: vai direto para o próximo exercício do grupo, sem descanso.
      setRest(null);
      const nextUid = link.members[link.pos + 1]!;
      setTimeout(() => setOpen(nextUid), 250);
      return;
    }
    const total = draft?.restSec[log.uid] ?? log.planned?.restSec ?? 90;
    // Marcar uma série tira a barra de fim de descanso; a última série do treino não inicia descanso.
    setRest(shouldStartRest(all, { logUid: log.uid, index: i }, total) ? startRest(total, Date.now()) : null);
    if (link) {
      const first = all.find((e) => e.uid === link.members[0]);
      if (first && pending(first)) return void setTimeout(() => setOpen(first.uid), 350);
    }
    if (lastSet) {
      const next = all.find((e) => e.uid !== log.uid && !link?.members.includes(e.uid) && e.sets.some((s) => !s.done));
      if (next) setTimeout(() => setOpen(next.uid), 350);
    }
  };

  const toggleDone = (log: ExerciseLog, i: number) => {
    const set = log.sets[i]!;
    const done = !set.done;
    unlockAudio();
    // Sem valor digitado, assume o da mesma série no último treino (ou o mínimo da faixa) —
    // nunca o topo da faixa, que dispararia sugestão de aumento sem o atleta ter batido as reps.
    const key = `${log.uid}:${i}`;
    const fallback = defaultReps(log, i, lastPerformance(history, log.exerciseId));
    let reps = set.reps;
    if (done && !set.reps) {
      reps = fallback;
      if (reps) assumed.current.add(key);
    } else if (!done) {
      // Desmarcar desfaz o que o ✓ preencheu: a série volta vazia e não vira "preenchida sem marcar" no Finalizar.
      // Igual ao valor assumido também limpa (depois de recarregar a página): o campo mostra o mesmo número, mais claro.
      if (assumed.current.has(key) || (set.reps !== null && set.reps === fallback)) reps = null;
      assumed.current.delete(key);
    }
    update(log.uid, (l) => ({ ...l, sets: l.sets.map((s, j) => (j === i ? { ...s, done, reps } : s)) }));
    if (hold && hold.logUid === log.uid && hold.index === i) setHold(null);
    if (done) afterDone(log, i, { ...set, done, reps });
  };

  /** Cronômetro de série por tempo (prancha, isometria): para sozinho no alvo e marca a série. */
  const stopHold = (seconds: number) => {
    if (!hold) return;
    const log = draft?.session.exercises.find((e) => e.uid === hold.logUid);
    setHold(null);
    if (!log) return;
    const i = hold.index;
    const reps = Math.max(1, Math.round(seconds));
    assumed.current.add(`${log.uid}:${i}`);
    update(log.uid, (l) => ({ ...l, sets: l.sets.map((s, j) => (j === i ? { ...s, done: true, reps } : s)) }));
    navigator.vibrate?.([120, 60, 120]);
    beep(3);
    afterDone(log, i, { ...log.sets[i]!, done: true, reps }, true);
  };

  useEffect(() => {
    // Salvando ou já no resumo: o cronômetro não marca série, não bipa nem manda evento de um treino já salvo.
    if (summary || finishing) return;
    if (hold && now - hold.startedAt >= hold.max * 1000) stopHold(hold.max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, hold, summary, finishing]);

  const stats = useMemo(() => {
    if (!draft) return { done: 0, total: 0, volume: 0, exDone: 0 };
    const all = draft.session.exercises.flatMap((e) => e.sets);
    return {
      done: all.filter((s) => s.done).length,
      total: all.length,
      volume: sessionVolume(draft.session),
      exDone: draft.session.exercises.filter((e) => e.sets.length && e.sets.every((s) => s.done)).length,
    };
  }, [draft]);

  /** Salva o treino. `base` substitui a sessão do rascunho (ex.: com as séries preenchidas já marcadas). */
  async function finish(base?: Session) {
    if (!draft || !user) return;
    const src = base ?? draft.session;
    setFinishing(true);
    setError(null);
    try {
      const exercises = src.exercises.filter((e) => completedSets(e).length);
      if (!exercises.length) {
        setError("Marque pelo menos uma série como feita para salvar o treino.");
        setFinishing(false);
        return;
      }
      const s: Session = { ...src, exercises, finishedAt: new Date().toISOString() };
      s.volumeKg = sessionVolume(s);
      s.prs = detectPRs(s, [...history, s]);
      const saved = await repo.saveSession(s);
      // A ficha passa a mostrar a carga atual de cada exercício.
      if (program) {
        const top = new Map(exercises.map((e) => [e.exerciseId, Math.max(...completedSets(e).map((x) => x.loadKg ?? 0))]));
        const updated = {
          ...program,
          days: program.days.map((d) => ({ ...d, exercises: d.exercises.map((p) => (top.get(p.exerciseId) ? { ...p, loadKg: top.get(p.exerciseId) } : p)) })),
        };
        await repo.saveProgram(updated).catch(() => undefined);
      }
      clearDraft(user.id);
      const counts = setCounts(src);
      track("workout_completed", {
        sets: counts.done,
        prs: s.prs.length,
        minutes: Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000),
        exercises: exercises.length,
        timed_exercises: exercises.filter((e) => (e.unit ?? "reps") !== "reps").length,
        linked_exercises: Object.keys(links).length,
        from_program: Boolean(program),
        completed_all: counts.done === counts.total,
        compare_lines: compareWithLastSameDay(s, history).lines.length,
      });
      if (s.prs.length) track("pr_achieved", { count: s.prs.length, live: false });
      // Sugestão de carga mantida ou editada, por exercício concluído (só o tipo e o sim/não, nunca a carga).
      for (const e of exercises) {
        const edit = suggestionEdit(e, draft.suggestions[e.uid]);
        if (edit) track("session_feature_used", { feature: "carga_sugerida_editada", tipo: edit.tipo, editada: edit.editada });
      }
      setSummary(saved);
      setRest(null);
      setHold(null);
    } catch (e) {
      reportError(e, "treino:salvar");
      setError(e instanceof Error ? e.message : "Não foi possível salvar. Seus dados continuam nesta tela.");
    } finally {
      setFinishing(false);
    }
  }

  /** Volta o foco ao "Finalizar treino" quando um diálogo dele fecha sem finalizar. */
  const refocusFinish = () => requestAnimationFrame(() => finishBtn.current?.focus());

  /** Toque em "Finalizar": protege séries preenchidas sem ✓ antes de qualquer outra conferência. */
  function askFinish() {
    if (!draft) return;
    setError(null);
    const gate = finishGate(draft.session);
    if (gate.kind === "filled") setFilledAsk({ open: true, count: gate.count });
    else if (gate.kind === "pending") setPendingAsk({ open: true, count: gate.count });
    else if (gate.kind === "nothing") setError("Marque pelo menos uma série como feita para salvar o treino.");
    else void finish();
  }

  function resolveFilled(escolha: "marcar" | "sem_elas" | "voltar") {
    // O diálogo nativo também avisa ao fechar depois de uma escolha: só a primeira conta.
    if (!filledAsk.open || !draft) return;
    track("session_feature_used", { feature: "marcar_preenchidas", count: filledAsk.count, escolha });
    setFilledAsk((a) => ({ ...a, open: false }));
    if (escolha === "voltar") return void refocusFinish();
    if (escolha === "marcar") {
      const marked = markFilledDone(draft.session);
      setDraft((d) => (d ? { ...d, session: markFilledDone(d.session) } : d));
      void finish(marked);
    } else void finish();
  }

  function discard() {
    if (user) clearDraft(user.id);
    router.push("/hoje");
  }

  if (error && !draft)
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Alert tone="error">{error}</Alert>
        <Button variant="secondary" onClick={() => router.push("/hoje")}>
          Voltar
        </Button>
      </div>
    );
  if (conflict && !draft) {
    const sv = conflict.saved.session;
    const counts = setCounts(sv);
    const when = new Date(sv.startedAt);
    const sameDate = when.toDateString() === new Date().toDateString();
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="plate-type text-[1.6rem] leading-tight">Você tem um treino em andamento</h1>
        <p className="mt-3 text-[0.9375rem] text-steel">
          <strong className="text-iron">{sv.dayKey ? `Treino ${sv.dayKey}${sv.dayTitle ? ` — ${sv.dayTitle}` : ""}` : "Treino livre"}</strong>, iniciado{" "}
          {sameDate ? "hoje" : `em ${when.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`} às {when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}, com{" "}
          {draftProgressText({ done: counts.done, total: counts.total, filled: counts.filledUnmarked })}. Ele ainda não foi salvo no histórico.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" onClick={() => void resumeSaved()}>
            Continuar aquele treino
          </Button>
          <Button
            size="lg"
            variant="danger"
            onClick={() => {
              const fresh = conflict.fresh;
              setConflict(null);
              begin(fresh, true);
            }}
          >
            Descartar e começar este
          </Button>
          <Button variant="ghost" onClick={() => router.push("/hoje")}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }
  if (!draft) return <SessionSkeleton />;
  if (summary) return <Summary session={summary} history={history} onDone={() => router.push("/hoje")} />;

  const elapsed = Math.max(0, Math.floor((now - new Date(draft.session.startedAt).getTime()) / 1000));
  const phase = restPhase(rest, now);
  const endInfo = rest && restEnd?.until === rest.until ? restEnd : null;
  // Antes do efeito registrar o fim, decide pelo próprio restPhase (mesma conta), para a barra não piscar.
  const late = phase.phase === "ended" ? (endInfo ? endInfo.late : !phase.justEnded) : false;

  return (
    <div className={cx("min-h-dvh", !footH && "pb-40")} style={footH ? { paddingBottom: footH + 16 } : undefined}>
      <header className="sticky top-0 z-20 bg-iron text-chalk">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button onClick={() => setConfirmExit(true)} className="-ml-2 grid size-11 place-items-center rounded hover:bg-white/10" aria-label="Sair do treino">
            <X className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{draft.session.dayKey ? `Treino ${draft.session.dayKey}${draft.session.dayTitle ? ` — ${draft.session.dayTitle}` : ""}` : "Treino livre"}</p>
            <p className="num text-xs text-chalk/65">
              {/* Cada trecho inteiro na mesma linha: "320 kg" nunca quebra separado da unidade. */}
              <span className="whitespace-nowrap">
                {stats.exDone}/{draft.session.exercises.length} exercícios
              </span>{" "}
              · <span className="whitespace-nowrap">{stats.done}/{stats.total} séries</span>
              {stats.volume ? (
                <>
                  {" "}
                  · <span className="whitespace-nowrap">{fmtNum(stats.volume, 0)} kg</span>
                </>
              ) : null}
            </p>
          </div>
          <span className="num plate-type text-lg" aria-label="Tempo de treino">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
          <button
            onClick={() => {
              const on = !sound;
              setSound(on);
              track("session_feature_used", { feature: "som", on });
              try {
                localStorage.setItem(SOUND_KEY, on ? "1" : "0");
              } catch {}
            }}
            aria-pressed={sound}
            aria-label={sound ? "Desligar aviso sonoro do descanso" : "Ligar aviso sonoro do descanso"}
            title={sound ? "Som ligado" : "Som desligado"}
            className="-mr-2 grid size-11 place-items-center rounded hover:bg-white/10"
          >
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5 text-chalk/60" />}
          </button>
        </div>
        <div className="h-1 bg-white/10">
          <div className="h-full bg-plate-green transition-[width] duration-300" style={{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-3 py-4 sm:px-4">
        {draft.session.exercises.map((log, idx) => (
          <ExerciseBlock
            key={log.uid}
            index={idx}
            log={log}
            open={open === log.uid}
            onToggle={() => setOpen(open === log.uid ? null : log.uid)}
            suggestion={draft.suggestions[log.uid]}
            last={lastPerformance(history, log.exerciseId)}
            recordAt={recordAt[log.uid] ?? -1}
            link={links[log.uid] ? { pos: links[log.uid]!.pos, size: links[log.uid]!.members.length, partner: draft.session.exercises.find((e) => e.uid === links[log.uid]!.members[links[log.uid]!.pos === links[log.uid]!.members.length - 1 ? links[log.uid]!.pos - 1 : links[log.uid]!.pos + 1])?.name ?? "" } : undefined}
            dissolved={draft.links && isLinkDissolved(log.uid, draft.session.exercises, draft.links) ? { label: linkLabel(log.planned?.technique, true), note: dissolvedNote(log.uid, draft.links) } : undefined}
            hold={hold && hold.logUid === log.uid ? { index: hold.index, elapsed: Math.max(0, Math.floor((now - hold.startedAt) / 1000)), max: hold.max } : null}
            onHoldStart={(i, max) => {
              unlockAudio();
              trackRestDelay();
              setRest(null);
              setHold({ logUid: log.uid, index: i, startedAt: Date.now(), max });
              track("session_feature_used", { feature: "cronometro_serie" });
            }}
            onHoldStop={() => hold && stopHold((Date.now() - hold.startedAt) / 1000)}
            onSwap={() => setSwapUid(log.uid)}
            onSet={(i, patch) => setField(log.uid, i, patch)}
            onDone={(i) => toggleDone(log, i)}
            onAddSet={() => update(log.uid, (l) => ({ ...l, sets: [...l.sets, { loadKg: l.sets[l.sets.length - 1]?.loadKg ?? null, reps: null, done: false }] }))}
            onRemoveSet={() => update(log.uid, (l) => ({ ...l, sets: l.sets.length > 1 ? l.sets.slice(0, -1) : l.sets }))}
            onRemove={() => (log.sets.some((x) => x.done) ? setDropLog(log) : removeLog(log.uid))}
            onNotes={(notes) => update(log.uid, (l) => ({ ...l, notes }))}
          />
        ))}

        <Button variant="secondary" className="w-full" onClick={() => setPicker(true)} icon={<Plus className="size-4" />}>
          Adicionar exercício
        </Button>
      </main>

      <div ref={footRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {/* Recorde ao vivo: região viva sempre presente, para o leitor de tela anunciar quando a linha aparece. */}
        <div role="status" aria-live="polite">
          {liveRecord ? (
            <div className="bg-plate-red text-white">
              <p className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2.5 text-[0.9375rem] font-bold">
                <Trophy className="size-5 shrink-0" aria-hidden />
                {/* O troféu já diz "recorde" na tela; o leitor de tela ouve a frase inteira. Só o nome trunca, a marca nunca. */}
                <span className="sr-only">Recorde: </span>
                <span className="min-w-0 truncate">{liveRecord.name}</span>
                <span className="num shrink-0 whitespace-nowrap">· {liveRecord.mark}</span>
              </p>
            </div>
          ) : null}
        </div>
        {/* "Descanso acabou" anunciado uma vez; o contador extra fica fora da região viva. */}
        <p className="sr-only" aria-live="assertive">
          {phase.phase === "ended" ? (endInfo?.announce ?? "") : ""}
        </p>
        {phase.phase === "running" ? (
          <div className="border-b border-rule">
            <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 items-center gap-2.5 sm:flex-1">
                <Timer className="size-5 shrink-0 text-plate-red" aria-hidden />
                <p className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm font-semibold text-steel">Descanso</span>
                  {nextUp ? (
                    <span className="block truncate text-xs text-steel">
                      Depois: Série {nextUp.number} de {nextUp.of} · {nextUp.name}
                    </span>
                  ) : null}
                </p>
                <span role="timer" className="num plate-type shrink-0 text-[2.5rem] leading-none">
                  {fmtClock(phase.leftSec)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0">
                <Button
                  variant="secondary"
                  aria-label="Menos 15 segundos de descanso"
                  onClick={() => {
                    setRest((r) => (r ? shiftRest(r, -15, Date.now()) : r));
                    track("session_feature_used", { feature: "descanso_menos_15" });
                  }}
                >
                  −15s
                </Button>
                <Button
                  variant="secondary"
                  aria-label="Mais 15 segundos de descanso"
                  onClick={() => {
                    setRest((r) => (r ? shiftRest(r, 15, Date.now()) : r));
                    track("session_feature_used", { feature: "descanso_mais_15" });
                  }}
                >
                  +15s
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Pular descanso"
                  onClick={() => {
                    setRest(null);
                    track("session_feature_used", { feature: "descanso_pular" });
                  }}
                >
                  Pular
                </Button>
              </div>
            </div>
          </div>
        ) : phase.phase === "ended" ? (
          <div className="bg-plate-yellow text-iron">
            <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
              <p className="min-w-0 flex-1 leading-tight">
                <span className="block font-bold">{late ? restEndedAgoText(phase.overSec) : "Descanso acabou"}</span>
                {nextUp ? (
                  <span className="block truncate text-sm">
                    <span className="sr-only"> · </span>Série {nextUp.number} de {nextUp.of} · {nextUp.name}
                  </span>
                ) : null}
              </p>
              {!late ? (
                <span className="num plate-type shrink-0 text-[1.75rem] leading-none">
                  <span className="sr-only">Tempo extra: </span>
                  {fmtOvertime(phase.overSec)}
                </span>
              ) : null}
              <Button
                className="shrink-0 px-5"
                aria-label="OK, fechar aviso de descanso"
                onClick={() => {
                  setRest(null);
                  track("session_feature_used", { feature: "descanso_ok" });
                }}
              >
                OK
              </Button>
            </div>
          </div>
        ) : null}
        <div className="mx-auto max-w-2xl px-4 py-3">
          {error ? (
            <Alert tone="error" className="mb-2">
              {error}
            </Alert>
          ) : null}
          <Button ref={finishBtn} size="lg" className="w-full" onClick={askFinish} loading={finishing} variant="primary">
            Finalizar treino
          </Button>
        </div>
      </div>

      <ExercisePicker
        open={picker || Boolean(swapUid)}
        title={swapUid ? "Trocar exercício neste treino" : "Adicionar exercício"}
        onClose={() => {
          setPicker(false);
          setSwapUid(null);
        }}
        onPick={(e) => {
          const last = lastPerformance(history, e.id);
          const unit = unitOf(e.id);
          if (swapUid) {
            // Troca só neste treino (aparelho ocupado): mantém o número de séries e a faixa quando a unidade é a mesma.
            const target = swapUid;
            setDraft((d) => {
              if (!d) return d;
              const cur = d.session.exercises.find((x) => x.uid === target);
              if (!cur) return d;
              const sameUnit = (cur.unit ?? "reps") === unit;
              const planned = sameUnit && cur.planned ? { ...cur.planned, loadKg: null, notes: undefined } : { ...defaultPlan(e), technique: cur.planned?.technique };
              const sug = unit === "reps" ? suggestFromHistory(history, planned, e.id) : null;
              const load = unit === "min" ? null : (sug?.loadKg ?? null);
              const suggestions = { ...d.suggestions };
              if (sug) suggestions[target] = sug;
              else delete suggestions[target];
              return {
                ...d,
                suggestions,
                session: {
                  ...d.session,
                  exercises: d.session.exercises.map((x) =>
                    x.uid === target ? { ...x, exerciseId: e.id, name: e.name, unit, planned, sets: Array.from({ length: Math.max(1, sameUnit ? x.sets.length : planned.sets) }, () => ({ loadKg: load, reps: null, done: false })) } : x,
                  ),
                },
              };
            });
            setSwapUid(null);
            track("session_feature_used", { feature: "trocar_exercicio" });
            return;
          }
          track("session_feature_used", { feature: "adicionar_exercicio" });
          const logUid = uid();
          const planned = defaultPlan(e);
          const sug = unit === "reps" ? suggestFromHistory(history, planned, e.id) : null;
          setDraft((d) =>
            d
              ? {
                  ...d,
                  suggestions: sug ? { ...d.suggestions, [logUid]: sug } : d.suggestions,
                  restSec: { ...d.restSec, [logUid]: planned.restSec },
                  session: {
                    ...d.session,
                    exercises: [
                      ...d.session.exercises,
                      { uid: logUid, exerciseId: e.id, name: e.name, unit, planned, sets: Array.from({ length: planned.sets }, () => ({ loadKg: unit === "reps" ? (sug?.loadKg ?? last?.sets[0]?.loadKg ?? null) : null, reps: null, done: false })) },
                    ],
                  },
                }
              : d,
          );
          setOpen(logUid);
        }}
      />

      <Dialog open={Boolean(dropLog)} onClose={() => setDropLog(null)} title="Remover este exercício?">
        <p className="text-[0.9375rem] text-steel">
          {dropLog
            ? `${dropLog.name} sai deste treino e ${dropLog.sets.filter((x) => x.done).length === 1 ? "a série já feita é descartada" : `as ${dropLog.sets.filter((x) => x.done).length} séries já feitas são descartadas`}. A ficha não muda.`
            : ""}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDropLog(null)}>
            Manter
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const gone = dropLog;
              setDropLog(null);
              if (gone) removeLog(gone.uid);
            }}
          >
            Remover exercício
          </Button>
        </div>
      </Dialog>

      {/* Séries com reps digitadas e sem ✓: só as marcadas entram no histórico, então nada some sem aviso. */}
      <Dialog open={filledAsk.open} onClose={() => resolveFilled("voltar")} title={filledUnmarkedTitle(filledAsk.count)}>
        <p className="text-[0.9375rem] text-steel">{filledAsk.count === 1 ? "Ela só entra no histórico se estiver marcada." : "Elas só entram no histórico se estiverem marcadas."}</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button className="!h-12 w-full" icon={<Check className="size-4" />} onClick={() => resolveFilled("marcar")}>
            Marcar e finalizar
          </Button>
          {/* Sempre os 3 botões (spec). Sem nenhuma série marcada, "sem elas" não tem o que salvar: finish() mostra o aviso. */}
          <Button variant="secondary" className="!h-12 w-full" onClick={() => resolveFilled("sem_elas")}>
            {filledAsk.count === 1 ? "Finalizar sem ela" : "Finalizar sem elas"}
          </Button>
          <Button variant="ghost" className="!h-12 w-full" onClick={() => resolveFilled("voltar")}>
            Voltar ao treino
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={pendingAsk.open}
        onClose={() => {
          if (!pendingAsk.open) return;
          setPendingAsk((a) => ({ ...a, open: false }));
          refocusFinish();
        }}
        title="Finalizar com séries pendentes?"
      >
        <p className="text-[0.9375rem] text-steel">
          {pendingAsk.count === 1 ? "Falta 1 série" : `Faltam ${pendingAsk.count} séries`} das {stats.total} do treino. Só as séries marcadas como feitas entram no histórico.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              setPendingAsk((a) => ({ ...a, open: false }));
              refocusFinish();
            }}
          >
            Voltar ao treino
          </Button>
          <Button
            onClick={() => {
              setPendingAsk((a) => ({ ...a, open: false }));
              void finish();
            }}
          >
            Finalizar assim mesmo
          </Button>
        </div>
      </Dialog>

      <Dialog open={confirmExit} onClose={() => setConfirmExit(false)} title="Sair do treino?">
        <p className="text-[0.9375rem] text-steel">Seu progresso fica salvo neste aparelho: ele aparece em Hoje para você continuar depois. Ou descarte este treino.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="danger" onClick={discard} icon={<Trash2 className="size-4" />}>
            Descartar treino
          </Button>
          <Button variant="secondary" onClick={() => router.push("/hoje")}>
            Sair e continuar depois
          </Button>
          <Button onClick={() => setConfirmExit(false)}>Voltar ao treino</Button>
        </div>
      </Dialog>
    </div>
  );
}

function defaultReps(log: ExerciseLog, i: number, last: ExerciseLog | null): number | null {
  const prev = last ? completedSets(last)[i] : undefined;
  // Séries por tempo repetem a marca anterior; com carga, subir o peso volta ao mínimo da faixa.
  if ((log.unit ?? "reps") !== "reps") return prev?.reps ?? log.planned?.repsMin ?? null;
  return assumedReps(log.sets[i] ?? { loadKg: null }, prev, log.planned?.repsMin);
}

interface BlockProps {
  index: number;
  log: ExerciseLog;
  open: boolean;
  onToggle: () => void;
  suggestion?: LoadSuggestion;
  last: ExerciseLog | null;
  /** Índice da 1ª série recorde deste registro na sessão (✓ verde com o selo do troféu), ou -1. */
  recordAt: number;
  link?: { pos: number; size: number; partner: string };
  /** Membro de um grupo (bi-set etc.) cujos outros exercícios saíram deste treino: rótulo da técnica e caixa. */
  dissolved?: { label: string | null; note: string };
  hold: { index: number; elapsed: number; max: number } | null;
  onHoldStart: (i: number, max: number) => void;
  onHoldStop: () => void;
  onSwap: () => void;
  onSet: (i: number, patch: Partial<SetLog>) => void;
  onDone: (i: number) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onRemove: () => void;
  onNotes: (n: string) => void;
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function ExerciseBlock({ index, log, open, onToggle, suggestion, last, recordAt, link, dissolved, hold, onHoldStart, onHoldStop, onSwap, onSet, onDone, onAddSet, onRemoveSet, onRemove, onNotes }: BlockProps) {
  const ex = getExercise(log.exerciseId);
  const unit: Unit = log.unit ?? unitOf(log.exerciseId);
  const doneCount = log.sets.filter((s) => s.done).length;
  const complete = doneCount === log.sets.length && log.sets.length > 0;
  const p = log.planned;
  const barbell = ex?.implement === "barra";
  const optionalLoad = unit !== "reps" || ex?.implement === "peso_corporal" || ex?.implement === "elastico";
  const currentLoad = log.sets.find((s) => !s.done)?.loadKg ?? log.sets[log.sets.length - 1]?.loadKg ?? 0;
  const step = ex?.implement === "halter" || ex?.implement === "kettlebell" ? 1 : ex?.implement === "maquina" ? 5 : 2.5;
  const showLoad = unit !== "min";
  const cols = showLoad ? "grid-cols-[1rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem]" : "grid-cols-[1rem_minmax(0,1fr)_2.75rem]";
  const rawTechnique = p?.technique && p.technique !== "normal" ? TECHNIQUE_LABEL[p.technique] : null;
  // Último exercício de um bi-set/tri-set: o rótulo aponta para o anterior, não para o próximo. Grupo desfeito
  // (o outro exercício saiu deste treino): "Bi-set desfeito neste treino", nunca "com o próximo".
  const technique = dissolved
    ? (dissolved.label ?? rawTechnique)
    : rawTechnique && link && link.pos > 0 && link.pos === link.size - 1
      ? rawTechnique.replace("com o próximo", "com o anterior").replace("com os próximos", "com os anteriores").replace("(antagonista)", "(com o anterior)")
      : rawTechnique;
  const nextPending = log.sets.findIndex((s) => !s.done);
  const fmtSet = (s: SetLog) => (unit === "reps" ? (s.loadKg ? `${fmtNum(s.loadKg)}×${s.reps}` : `${s.reps}`) : `${s.loadKg ? `${fmtNum(s.loadKg)} kg · ` : ""}${s.reps} ${UNIT_LABEL[unit].short}`);

  return (
    <section className={cx("overflow-hidden rounded-[8px] border bg-paper transition-colors", open ? "border-iron" : complete ? "border-plate-green/40" : "border-rule")}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4">
        <span className={cx("num grid size-8 shrink-0 place-items-center rounded text-sm font-bold", complete ? "bg-plate-green text-white" : "bg-chalk-2")}>
          {complete ? <Check className="size-4" /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("block font-bold", !open && "truncate")}>{log.name}</span>
          <span className="num block truncate text-xs text-steel">
            {p ? fmtScheme({ ...p, exerciseId: log.exerciseId, unit }) : `${log.sets.length} séries`}
            {technique ? ` · ${technique}` : ""} · {doneCount}/{log.sets.length} feitas
          </span>
        </span>
        <ChevronDown className={cx("size-5 shrink-0 text-steel transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div className="border-t border-rule px-3 pb-4 pt-3 sm:px-4">
          {technique || p?.notes || link || dissolved ? (
            <div className="mb-3 space-y-1 rounded-[6px] border border-plate-yellow/60 bg-plate-yellow/12 px-3 py-2 text-sm">
              {technique ? <p className="font-bold">{technique}</p> : null}
              {link ? (
                <p>
                  {link.pos < link.size - 1 ? `Faça em sequência com ${link.partner}, sem descanso entre os dois.` : `Depois desta série, descanse e volte para ${link.partner}.`}
                </p>
              ) : dissolved ? (
                <p>{dissolved.note}</p>
              ) : null}
              {p?.notes ? <p>{p.notes}</p> : null}
            </div>
          ) : null}

          {/* Acima das séries, só o que decide a carga: "Última vez" e a sugestão. Dica e descanso ficam embaixo. */}
          <div className="space-y-1 text-sm">
            <p className="num text-steel">Última vez: {last && completedSets(last).length ? completedSets(last).map(fmtSet).join(" · ") : "primeiro registro"}</p>
            {suggestion && unit === "reps" ? (
              <p className={cx("flex items-start gap-1.5 font-semibold", suggestion.kind === "aumentar" ? "text-plate-red-ink" : "text-iron")}>
                {suggestion.kind === "aumentar" ? <Trophy className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
                {suggestion.text}
              </p>
            ) : null}
          </div>

          <div className={cx("mt-3 grid gap-1.5", cols)}>
            <span className="col-head text-steel">#</span>
            {showLoad ? <span className="col-head truncate text-steel">{optionalLoad ? "Extra (kg)" : "Carga (kg)"}</span> : null}
            <span className="col-head text-steel">{UNIT_LABEL[unit].column}</span>
            <span className="col-head text-center text-steel">Feito</span>
          </div>
          <ol className="mt-1.5 space-y-2">
            {log.sets.map((s, i) => {
              // Estado da linha (derivado, nunca gravado): pendente = caixa vazia; preenchida = caixa vazia com borda
              // escura ("falta marcar"); concluída = verde com ✓. Recorde = concluída + selo do troféu (o verde não muda).
              const state = setRowState(s);
              const record = state === "concluida" && recordAt === i;
              const desc = setRowDescription(state, record);
              const descId = `set-${log.uid}-${i}-desc`;
              return (
                <li key={i} className={cx("grid items-center gap-1.5", cols)}>
                  <span className="num text-sm font-bold text-steel">{i + 1}</span>
                  {showLoad ? (
                    <NumberCell
                      value={s.loadKg}
                      confirmed={s.done}
                      onChange={(v) => onSet(i, { loadKg: v || (optionalLoad ? null : v) })}
                      step={step}
                      label={`Carga da série ${i + 1}`}
                      placeholder={optionalLoad ? "—" : "kg"}
                    />
                  ) : null}
                  <NumberCell
                    value={s.reps}
                    confirmed={s.done}
                    onChange={(v) => onSet(i, { reps: v === null ? null : Math.round(v) })}
                    step={unit === "seg" ? 5 : 1}
                    label={`${UNIT_LABEL[unit].column} da série ${i + 1}`}
                    placeholder={String(defaultReps(log, i, last) ?? "")}
                    fallback={defaultReps(log, i, last)}
                  />
                  {/* Caixa de marcar: nome fixo ("Série N feita"), o estado vai em aria-checked e, quando há, na descrição. */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={s.done}
                    aria-label={`Série ${i + 1} feita`}
                    aria-describedby={desc ? descId : undefined}
                    onClick={() => onDone(i)}
                    className={cx(
                      "relative grid h-12 place-items-center rounded-[6px] border-2 transition-colors",
                      // No mouse, o hover só tinge o fundo: escurecer a borda faria a pendente parecer preenchida.
                      state === "concluida" ? "animate-stamp border-done bg-done text-white" : state === "preenchida" ? "border-iron bg-paper hover:bg-chalk" : "border-field bg-paper hover:bg-chalk",
                    )}
                  >
                    {s.done ? <Check className="size-5" aria-hidden /> : null}
                    {record ? (
                      // Selo do recorde (U1 §3.1): círculo `record` com troféu branco no canto, anel de papel para não
                      // encostar no verde. Cabe nos 8 px entre as linhas e no respiro lateral do bloco.
                      <span data-record className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-record text-on-record ring-2 ring-paper">
                        <Trophy className="size-3" aria-hidden />
                      </span>
                    ) : null}
                  </button>
                  {desc ? (
                    <span id={descId} className="sr-only">
                      {desc}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {unit === "seg" && nextPending >= 0 ? (
            hold ? (
              <div className="mt-3 flex items-center gap-3 rounded-[6px] border-2 border-iron px-3 py-2" role="timer">
                <span className="text-sm font-semibold text-steel">Série {hold.index + 1}</span>
                <span className="num plate-type ml-auto text-3xl">{clock(hold.elapsed)}</span>
                <span className="num text-sm text-steel">de {clock(hold.max)}</span>
                <Button size="sm" variant="primary" onClick={onHoldStop} icon={<Square className="size-4" />}>
                  Parar
                </Button>
              </div>
            ) : (
              <Button variant="secondary" className="mt-3 w-full" icon={<Play className="size-4" />} onClick={() => onHoldStart(nextPending, log.sets[nextPending]?.reps || p?.repsMax || 30)}>
                Cronometrar série {nextPending + 1} (até {log.sets[nextPending]?.reps || p?.repsMax || 30} s)
              </Button>
            )
          ) : null}

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <Button size="sm" variant="secondary" onClick={onAddSet} icon={<Plus className="size-4" />} className="px-1" aria-label="Adicionar série">
              Série
            </Button>
            <Button size="sm" variant="secondary" onClick={onRemoveSet} icon={<Minus className="size-4" />} disabled={log.sets.length <= 1} className="px-1" aria-label="Remover a última série">
              Série
            </Button>
            <Button size="sm" variant="secondary" onClick={onSwap} disabled={doneCount > 0} title={doneCount > 0 ? "Já há séries feitas neste exercício" : undefined} className="px-1" aria-label="Trocar exercício neste treino">
              Trocar
            </Button>
            <Button size="sm" variant="danger" onClick={onRemove} className="px-1" aria-label="Remover exercício deste treino">
              Remover
            </Button>
          </div>

          {barbell && currentLoad ? <BarbellView totalKg={currentLoad} className="mt-3 rounded-[6px] bg-chalk px-3 py-2" /> : null}

          {/* Dica e Anotação recolhidas lado a lado; a que abrir ocupa a linha inteira. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-5">
            {ex?.cue ? (
              <details className="open:basis-full">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-steel">Dica</summary>
                <p className="pb-2 text-sm text-steel">{ex.cue}</p>
              </details>
            ) : null}
            <details className="open:basis-full">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-steel">Anotação</summary>
              <Textarea value={log.notes ?? ""} onChange={(e) => onNotes(e.target.value)} rows={2} className="mt-1 min-h-16" placeholder="Ex.: pegada mais aberta, dor no ombro na 3ª série" />
            </details>
            {p?.restSec && unit !== "min" ? <p className="num ml-auto text-sm text-steel">Descanso: {fmtRest(p.restSec)}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Campo numérico do treino. Guarda o texto enquanto a pessoa digita (senão "42," voltaria a "42" e
 * 42,5 viraria 425) e, com o campo vazio, os botões − e + partem do valor sugerido, não de zero.
 * `confirmed` (série com ✓) mostra o valor em preto; sem ✓, o valor ainda é sugerido e aparece mais claro
 * (cor `suggest`, 5,1:1 — AA). O ✓ verde continua sendo o sinal de série feita.
 */
function NumberCell({
  value,
  onChange,
  step,
  label,
  placeholder,
  fallback,
  confirmed = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  label: string;
  placeholder?: string;
  fallback?: number | null;
  confirmed?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === null ? "" : String(value).replace(".", ","));
  const base = value ?? fallback ?? 0;
  const bump = (delta: number) => {
    setText(null);
    onChange(Math.min(999, Math.max(0, Math.round((base + delta) * 100) / 100)));
  };
  return (
    <div className="flex h-12 items-stretch overflow-hidden rounded-[6px] border border-rule-strong bg-paper focus-within:border-iron">
      <button type="button" onClick={() => bump(value === null && fallback ? 0 : -step)} className="w-8 shrink-0 text-lg font-bold text-steel hover:bg-chalk-2 sm:w-10" aria-label={`Diminuir ${label}`}>
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          // Só dígitos e um separador decimal; aceita vírgula ou ponto.
          const cleaned = e.target.value.replace(/[^\d.,]/g, "").replace(".", ",");
          const [int = "", ...rest] = cleaned.split(",");
          const raw = rest.length ? `${int},${rest.join("").slice(0, 2)}` : int;
          setText(raw.slice(0, 7));
          if (raw === "" || raw === ",") return onChange(null);
          const n = Number(raw.replace(",", "."));
          if (!Number.isNaN(n)) onChange(Math.min(999, n));
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setText(null)}
        className={cx(
          "num w-full min-w-0 bg-transparent px-0 text-center text-base placeholder:font-normal placeholder:text-suggest focus:outline-none sm:text-lg",
          confirmed ? "font-bold text-iron" : "font-semibold text-suggest focus:text-iron",
        )}
      />
      <button type="button" onClick={() => bump(value === null && fallback ? 0 : step)} className="w-8 shrink-0 text-lg font-bold text-steel hover:bg-chalk-2 sm:w-10" aria-label={`Aumentar ${label}`}>
        +
      </button>
    </div>
  );
}

/**
 * Número que anima do valor anterior até o novo (nunca do zero). Com prefers-reduced-motion, já nasce no valor final.
 * O leitor de tela lê só o valor final.
 */
function AnimatedNumber({ from, to, decimals = 0 }: { from: number; to: number; decimals?: number }) {
  const [value, setValue] = useState(() => (from === to || prefersReducedMotion() ? to : from));
  useEffect(() => {
    if (from === to || prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      setValue(tween(from, to, p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
  return (
    <>
      <span aria-hidden="true">{fmt(value)}</span>
      <span className="sr-only">{fmt(to)}</span>
    </>
  );
}

/** Uma linha de "Desde o último Treino B": nome truncável, detalhe inteiro; em "A → B", B anima a partir de A. */
function CompareLine({ line }: { line: string }) {
  const { name, detail, arrow } = splitCompareLine(line);
  return (
    <li className="flex min-w-0 items-baseline text-[0.9375rem]">
      <TrendingUp className="mr-2 size-4 shrink-0 self-center text-plate-green" aria-hidden />
      {name ? <span className="min-w-0 truncate">{name}</span> : null}
      <span className="num shrink-0 whitespace-nowrap font-bold">
        {name ? ": " : ""}
        {arrow ? (
          <>
            {arrow.head}
            {arrow.fromText} → <AnimatedNumber from={arrow.from} to={arrow.to} decimals={decimalsOf(arrow.toText)} />
            {arrow.tail}
          </>
        ) : (
          detail
        )}
      </span>
    </li>
  );
}

const FEELINGS = ["Péssimo", "Ruim", "Ok", "Bom", "Ótimo"] as const;

function Summary({ session, history, onDone }: { session: Session; history: Session[]; onDone: () => void }) {
  const { repo, user, returnTo } = useApp();
  const [feeling, setFeeling] = useState<Session["feeling"]>(session.feeling);
  const [note, setNote] = useState(session.note ?? "");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const compareId = useId();
  // O que está na tela agora (lido na hora de gravar) e a fila de gravações (uma nunca atropela a seguinte).
  const latest = useRef({ feeling: session.feeling, note: session.note ?? "" });
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feelingTracked = useRef(false);
  const minutes = session.finishedAt ? Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000) : 0;
  const sets = session.exercises.reduce((a, e) => a + completedSets(e).length, 0);
  const cmp = useMemo(() => compareWithLastSameDay(session, history), [session, history]);
  // "Semana N seguida" só no 1º treino da semana, e só a partir da 2ª semana (sem contador absoluto de treinos).
  const streak = useMemo(() => (firstOfWeek(session, history) ? weekStreak([...history.filter((h) => h.id !== session.id), session]) : 0), [session, history]);
  const coach = user?.remoteCoach && !returnTo ? user.remoteCoach : null;
  const coachFirst = coach ? firstName(coach.name) || "seu personal" : "";

  /** Grava sentimento e anotação já (o treino em si já está salvo): fechar o app no resumo não perde nada. */
  const persist = useCallback(() => {
    if (noteTimer.current) {
      clearTimeout(noteTimer.current);
      noteTimer.current = null;
    }
    const s: Session = { ...session, feeling: latest.current.feeling, note: latest.current.note || undefined };
    chain.current = chain.current.then(() => repo.saveSession(s)).catch((e) => reportError(e, "treino:salvar-resumo"));
    return chain.current;
  }, [repo, session]);

  // Anotação ainda no debounce: grava ao sair do app (iOS pode matar a PWA em segundo plano) ou ao sair da tela.
  useEffect(() => {
    const flush = () => {
      if (noteTimer.current) void persist();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  const chooseFeeling = (v: NonNullable<Session["feeling"]>) => {
    latest.current.feeling = v;
    setFeeling(v);
    void persist();
    if (!feelingTracked.current) {
      feelingTracked.current = true;
      track("session_feature_used", { feature: "sentimento_salvo" });
    }
  };

  const changeNote = (v: string) => {
    latest.current.note = v;
    setNote(v);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      noteTimer.current = null;
      void persist();
    }, 600);
  };

  const conclude = async () => {
    setSaving(true);
    if (noteTimer.current) void persist();
    await chain.current;
    onDone();
  };

  return (
    <div className="min-h-dvh bg-iron text-chalk">
      <div className="mx-auto max-w-xl px-5 pt-6">
        <p className="text-sm font-semibold text-chalk/70">Treino concluído</p>
        <h1 className="plate-type mt-1 text-[2rem] leading-tight">{session.prs.length ? "Dia de recorde." : "Treino na conta."}</h1>
        <dl className="mt-5 grid grid-cols-3 divide-x divide-white/15 border-y border-white/15 py-3 text-center">
          <div>
            <dd className="num plate-type text-2xl">{minutes}</dd>
            <dt className="text-xs text-chalk/70">{minutes === 1 ? "minuto" : "minutos"}</dt>
          </div>
          <div>
            <dd className="num plate-type text-2xl">{sets}</dd>
            <dt className="text-xs text-chalk/70">séries</dt>
          </div>
          <div>
            {session.volumeKg > 0 ? (
              <>
                <dd className="num plate-type text-2xl">{session.volumeKg >= 1000 ? fmtNum(session.volumeKg / 1000, 1) : fmtNum(session.volumeKg, 0)}</dd>
                <dt className="text-xs text-chalk/70">{session.volumeKg >= 1000 ? "toneladas" : "kg levantados"}</dt>
              </>
            ) : (
              <>
                <dd className="num plate-type text-2xl">{session.exercises.length}</dd>
                <dt className="text-xs text-chalk/70">{session.exercises.length === 1 ? "exercício" : "exercícios"}</dt>
              </>
            )}
          </div>
        </dl>

        {session.prs.length ? (
          <ul className="mt-5 space-y-2">
            {session.prs.map((id, i) => {
              // A série que bateu a marca (não a mais pesada), com reps ou segundos no peso corporal.
              const hit = recordSetOf(session, history, id);
              const log = hit?.log ?? session.exercises.find((e) => e.exerciseId === id);
              const set = hit?.set ?? (log ? completedSets(log).reduce((b, s) => ((s.loadKg ?? 0) > (b.loadKg ?? 0) ? s : b), completedSets(log)[0]!) : null);
              return (
                <li key={id} className="flex animate-stamp items-center gap-3 rounded-[8px] bg-plate-red px-4 py-3" style={{ animationDelay: `${i * 120}ms` }}>
                  <Trophy className="size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-bold">{log?.name}</span>
                  <span className="num shrink-0 font-bold">{log && set ? fmtMark(set, log.exerciseId, log.unit) : ""}</span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {cmp.variant === "compare" && cmp.lines.length ? (
          <section className="mt-5 rounded-[8px] border border-white/15 bg-white/5 px-4 py-3" aria-labelledby={compareId}>
            <h2 id={compareId} className="text-sm font-semibold text-chalk/70">
              Desde o último {cmp.dayLabel}
            </h2>
            <ul className="mt-1.5 space-y-1">
              {cmp.lines.map((line) => (
                <CompareLine key={line} line={line} />
              ))}
            </ul>
          </section>
        ) : cmp.variant === "first" && cmp.firstText ? (
          <p className="mt-5 text-[0.9375rem] text-chalk/80">{cmp.firstText}</p>
        ) : null}

        {streak >= 2 ? (
          <p className="mt-3 flex items-center gap-2 text-[0.9375rem] font-semibold">
            <CalendarCheck className="size-4 shrink-0 text-plate-yellow" aria-hidden />
            <span className="num">
              Semana <AnimatedNumber from={streak - 1} to={streak} /> seguida
            </span>
          </p>
        ) : null}

        <div className="mt-5">
          <p className="text-sm font-semibold">Como foi o treino?</p>
          <div className="mt-2 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Como foi o treino">
            {FEELINGS.map((l, i) => (
              <button
                key={l}
                role="radio"
                aria-checked={feeling === i + 1}
                onClick={() => chooseFeeling((i + 1) as NonNullable<Session["feeling"]>)}
                className={cx("min-h-11 rounded-[6px] border px-0.5 text-[0.8125rem] font-semibold focus-visible:outline-chalk!", feeling === i + 1 ? "border-chalk bg-chalk text-iron" : "border-white/25 hover:border-white/60")}
              >
                {l}
              </button>
            ))}
          </div>
          <Textarea
            value={note}
            onChange={(e) => changeNote(e.target.value)}
            aria-label="Anotação do treino"
            placeholder="Anotação do treino (opcional)"
            className="mt-3 min-h-0 border-white/25! bg-white/5! text-chalk! placeholder:text-chalk/60! focus:border-chalk!"
            rows={2}
          />
        </div>

        {/* Um só botão principal, sempre visível: com personal, "Enviar para …"; sozinho, "Concluir". */}
        <div className="sticky bottom-0 -mx-5 mt-5 border-t border-white/10 bg-iron px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {coach ? (
            <div className="flex flex-col">
              {sent ? (
                <>
                  <p role="status" className="mb-2 flex items-center justify-center gap-1.5 text-sm text-chalk/80">
                    <Check className="size-4" aria-hidden /> Treino enviado para {coachFirst}.
                  </p>
                  <Button size="lg" className="w-full !bg-chalk !text-iron hover:!bg-white focus-visible:outline-chalk!" loading={saving} onClick={() => void conclude()}>
                    Concluir
                  </Button>
                </>
              ) : null}
              {/* Fica sempre no mesmo lugar da árvore: o diálogo de envio não fecha quando o botão vira "Enviar de novo". */}
              <SendToCoach
                sessions={[{ ...session, feeling, note: note || undefined }]}
                size={sent ? "md" : "lg"}
                variant={sent ? "ghost" : "inverse"}
                label={sent ? `Enviar de novo para ${coachFirst}` : `Enviar para ${coachFirst}`}
                className={sent ? "mt-1 w-full !text-chalk/85 underline underline-offset-4 hover:!bg-white/10 focus-visible:outline-chalk!" : "w-full focus-visible:outline-chalk!"}
                onSent={() => {
                  void persist();
                  setSent(true);
                }}
              />
              {!sent ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void conclude()}
                  className="mt-1 flex min-h-11 w-full items-center justify-center rounded-[6px] text-[0.9375rem] font-semibold text-chalk/85 underline underline-offset-4 hover:text-chalk disabled:opacity-60 focus-visible:outline-chalk!"
                >
                  Concluir sem enviar
                </button>
              ) : null}
            </div>
          ) : (
            <Button size="lg" className="w-full !bg-chalk !text-iron hover:!bg-white focus-visible:outline-chalk!" loading={saving} onClick={() => void conclude()}>
              Concluir
            </Button>
          )}
        </div>
        {session.prs.length ? (
          <div className="flex justify-center pb-8 pt-2">
            <Badge tone="record">
              <Trophy className="size-3" /> {session.prs.length} recorde{session.prs.length > 1 ? "s" : ""}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SessionSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-6" aria-busy="true">
      <Skeleton className="h-14" />
      <Skeleton className="h-48" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  );
}
