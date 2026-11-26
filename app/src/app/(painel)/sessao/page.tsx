"use client";

import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, Check, ChevronDown, Minus, MoreHorizontal, Play, Plus, Square, Timer, Trash2, TrendingUp, TriangleAlert, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { BarbellView } from "@/components/brand";
import { ExercisePicker } from "@/components/exercise-picker";
import { isStandaloneDisplay } from "@/components/pwa";
import { ActionSheet, Alert, Button, Dialog, IconButton, Skeleton, Textarea, cx } from "@/components/ui";
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
import { fmtClock, fmtOvertime, nextSetOf, restAfterRemove, restAfterUnmark, restEndedAgoText, restFromDraft, restPhase, shiftRest, startRest, type RestTimer, type SetRef } from "@/lib/domain/rest";
import { filledUnmarkedTitle, finishGate, markFilledDone, setCounts, setRowDescription, setRowState } from "@/lib/domain/session-checks";
import {
  ABOVE_MAX_NOTE,
  SWAP_BLOCKED_NOTE,
  acceptTyped,
  afterDonePlan,
  canSwap,
  dissolvedNote,
  exerciseWork,
  isLinkDissolved,
  lastSetHint,
  linkGroups,
  linkLabel,
  nextPendingIndex,
  programWithFinishedLoads,
  removeExerciseConfirm,
  removeExerciseHint,
  removeSetConfirm,
  scrollDeltaToReveal,
  summaryHeadline,
  swapCopy,
  swapOrigin,
  type VerticalBand,
} from "@/lib/domain/session-flow";
import type { ExerciseLog, Program, Session, SetLog, Unit } from "@/lib/domain/types";
import { reportError, track } from "@/lib/analytics";
import { fmtNum, selectAllSoon, useKeepFocusedRowVisible } from "@/lib/hooks";
import { buildDraft, clearDraft, decimalsOf, defaultPlan, draftHasWork, draftHref, draftKey, draftProgressText, parseDraft, restDelayBand, resumeOpenUid, saveDraft, splitCompareLine, suggestionEdit, swapInDraft, tween, unmarkBand, type WorkoutDraft } from "@/lib/workout-draft";
import { StatusRegion } from "@/components/delivery-status";
import { SendToCoach } from "@/components/transfer-share";
import { prepStatusText, type PrepVia } from "@/lib/domain/delivery";

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

/** Até quanto tempo depois da marcação a rolagem "próxima série visível" ainda vale (U1 §3.5). */
const REVEAL_MAX_MS = 1000;
/** O que revelar depois de marcar: a próxima série do exercício aberto ou o exercício recém-aberto (cabeçalho e série). */
type RevealTarget = { kind: "serie"; uid: string; index: number } | { kind: "exercicio"; uid: string };

/** Id do botão ⋯ de um exercício: o foco volta para ele depois dos diálogos de série. */
const moreId = (logUid: string) => `mais-${logUid}`;

/** Maior carga, reps ou segundos aceitos num campo da série (o + para aí; digitado acima, o campo volta ao de antes). */
const SET_MAX = 999;

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
  // Ações do exercício (⋯) e diálogos de remoção: o conteúdo fica guardado enquanto o diálogo fecha (sem piscar vazio).
  const [sheet, setSheet] = useState({ open: false, uid: "" });
  const [setAsk, setSetAsk] = useState({ open: false, uid: "", title: "", body: "" });
  const [dropAsk, setDropAsk] = useState({ open: false, uid: "", body: "" });
  // Recorde ao vivo: linha no rodapé por ~2,5 s; comemora uma vez por exercício na sessão.
  const [liveRecord, setLiveRecord] = useState<{ name: string; mark: string; at: number } | null>(null);
  const celebrated = useRef(new Set<string>());
  // Séries (`uid:índice`) cujas reps/segundos o app preencheu sozinho (✓ sem digitar, cronômetro): desmarcar limpa o valor.
  const assumed = useRef(new Set<string>());
  // Quando cada série (`uid:índice`) foi marcada: o evento serie_desmarcada leva só a faixa do tempo até desmarcar.
  const markedAt = useRef(new Map<string, number>());
  // Contagens do treino para o workout_completed (desta tela aberta; recarregar recomeça do zero).
  const tally = useRef({ desmarcadas: 0, trocas: 0 });
  // Rolagem pendente da última marcação: consumida quando o rodapé e o exercício aberto assentam (no máximo 1 por marcação).
  const reveal = useRef<{ at: number; target: RevealTarget } | null>(null);
  const finishBtn = useRef<HTMLButtonElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const [footH, setFootH] = useState(0);
  const [headH, setHeadH] = useState(0);
  // Exercício reaberto na retomada (U8 §3.8): rola até o cabeçalho dele quando a seção já está aberta na tela.
  const resumeScroll = useRef<string | null>(null);
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
        begin(d, !resumed, hist, "rascunho");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível abrir o treino.");
      }
    })();
  }, [user, repo, programId, dayKey]);

  /**
   * Abre um rascunho na tela (novo ou retomado), com o descanso que estava contando. Treino novo abre o 1º exercício
   * com série pendente; rascunho retomado volta no exercício que estava aberto (`openUid`) e rola até ele.
   */
  function begin(d: Draft, isNew: boolean, hist: Session[] = history, origem: "rascunho" | "conflito" = "rascunho") {
    setDraft(d);
    setRest(restFromDraft(d.rest));
    // Recorde já marcado antes de recarregar não é comemorado de novo.
    celebrated.current = new Set(d.session.exercises.filter((l) => firstRecordSet(l, hist, d.session) >= 0).map((l) => l.exerciseId));
    // Sem openUid, a regra de sempre: o 1º com série pendente, senão o 1º.
    const usual = resumeOpenUid(d.session);
    const target = isNew ? usual : resumeOpenUid(d.session, d.openUid);
    setOpen(target);
    resumeScroll.current = !isNew && target && target !== d.session.exercises[0]?.uid ? target : null;
    if (!d.session.exercises.length) setPicker(true);
    if (isNew) track("workout_started", { program: Boolean(d.session.programId), day: d.session.dayKey ?? "livre" });
    else track("workout_resumed", { origem, mudou_exercicio: target !== usual, instalado: isStandaloneDisplay() });
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
    begin(saved, false, history, "conflito");
    router.replace(draftHref(saved.session), { scroll: false });
  }

  // Salva rascunho (com o descanso em andamento e o exercício aberto) a cada alteração: sobrevive a recarregar a página
  // ou fechar o app, e a retomada volta no mesmo exercício.
  useEffect(() => {
    if (draft && user && !summary) saveDraft(user.id, { ...draft, openUid: open ?? undefined }, rest);
  }, [draft, rest, user, summary, open]);

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

  // Altura do rodapé fixo (descanso, recorde, erro, Finalizar) e do cabeçalho: o fim da lista nunca fica escondido
  // atrás do rodapé, e o foco (Tab, troca de campo com o teclado aberto) nunca cai atrás de um dos dois.
  const live = Boolean(draft) && !summary;
  useEffect(() => {
    const foot = footRef.current;
    const head = headRef.current;
    if (!live || !foot || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setFootH(foot.offsetHeight);
      if (head) setHeadH(head.offsetHeight);
    });
    ro.observe(foot);
    if (head) ro.observe(head);
    return () => ro.disconnect();
  }, [live]);

  // scroll-padding enquanto há treino na tela (U8 §3.2a): o navegador, ao levar um campo ou botão em foco para a
  // tela, desconta o cabeçalho e o rodapé fixos. Sai ao abrir o resumo ou deixar a sessão.
  useEffect(() => {
    if (!live || !footH || !headH) return;
    const css = document.documentElement.style;
    css.scrollPaddingTop = `${headH + 8}px`;
    css.scrollPaddingBottom = `${footH + 8}px`;
    return () => {
      css.removeProperty("scroll-padding-top");
      css.removeProperty("scroll-padding-bottom");
    };
  }, [live, headH, footH]);

  // Teclado que encolhe a página (U8 §3.2b): a linha da série em foco (carga, reps e ✓) fica entre o cabeçalho e o rodapé.
  useKeepFocusedRowVisible({ main: mainRef, header: headRef, footer: footRef, enabled: live });

  // Retomada (U8 §3.8): com o exercício salvo já aberto na tela, o cabeçalho dele vai para logo abaixo do cabeçalho fixo.
  useEffect(() => {
    const target = resumeScroll.current;
    if (!target || open !== target) return;
    resumeScroll.current = null;
    requestAnimationFrame(() => {
      const btn = document.querySelector<HTMLElement>(`section[data-uid="${CSS.escape(target)}"] [aria-expanded]`);
      const head = headRef.current;
      if (!btn || !head) return;
      const delta = btn.getBoundingClientRect().top - (head.getBoundingClientRect().bottom + 8);
      if (Math.abs(delta) >= 2) window.scrollBy({ top: delta, behavior: "instant" });
    });
  }, [open, draft]);

  const update = useCallback((logUid: string, fn: (log: ExerciseLog) => ExerciseLog) => {
    setDraft((d) => (d ? { ...d, session: { ...d.session, exercises: d.session.exercises.map((e) => (e.uid === logUid ? fn(e) : e)) } } : d));
  }, []);

  const removeLog = (logUid: string) => setDraft((d) => (d ? { ...d, session: { ...d.session, exercises: d.session.exercises.filter((e) => e.uid !== logUid) } } : d));

  /** Esquece o que a tela guardava das séries `from…` do registro (reps assumidas, hora da marcação): elas saíram. */
  const forgetSets = (logUid: string, from = 0, to = 200) => {
    for (let i = from; i < to; i++) {
      assumed.current.delete(`${logUid}:${i}`);
      markedAt.current.delete(`${logUid}:${i}`);
    }
  };

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
   * Depois de uma série feita: recorde ao vivo, descanso (ou sequência do bi-set) e avanço (afterDonePlan, U1 §3.4).
   * `doneSet` é a série como ficou (o estado ainda não aplicou o setDraft). `quiet`: quem chamou já vibrou.
   */
  const afterDone = (log: ExerciseLog, i: number, doneSet: SetLog, quiet = false) => {
    if (summary) return;
    const record = celebrateRecord(log, i, doneSet);
    if (record) navigator.vibrate?.([40, 60, 120]);
    else if (!quiet) navigator.vibrate?.(30);
    trackRestDelay();
    markedAt.current.set(`${log.uid}:${i}`, Date.now());
    const mark: SetRef = { logUid: log.uid, index: i };
    const total = draft?.restSec[log.uid] ?? log.planned?.restSec ?? 90;
    const plan = afterDonePlan({ exercises: draft?.session.exercises ?? [], links, mark, restSec: total });
    // Marcar uma série tira a barra de fim de descanso; a última série do treino e o meio do bi-set não iniciam descanso.
    // O descanso guarda a série que o iniciou: desmarcá-la (ou removê-la) cancela só ele.
    setRest(plan.startRest ? startRest(total, Date.now(), mark) : null);
    if (plan.open) {
      const target = plan.open;
      const link = links[log.uid];
      // Bi-set: o próximo membro abre logo; os demais, depois do carimbo do ✓.
      setTimeout(() => setOpen(target), link && link.pos < link.members.length - 1 ? 250 : 350);
      reveal.current = { at: Date.now(), target: { kind: "exercicio", uid: target } };
    } else {
      const next = nextPendingIndex(log, i);
      reveal.current = next >= 0 ? { at: Date.now(), target: { kind: "serie", uid: log.uid, index: next } } : null;
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
      // Desfaz também o descanso que esta série iniciou (contando ou na barra de fim); o de outra série continua.
      setRest((r) => restAfterUnmark(r, { logUid: log.uid, index: i }));
      reveal.current = null;
      const at = markedAt.current.get(key);
      markedAt.current.delete(key);
      tally.current.desmarcadas++;
      // Sem a hora da marcação (marcada antes de recarregar), a faixa fica de fora: nada é afirmado sem medir.
      track("session_feature_used", at === undefined ? { feature: "serie_desmarcada" } : { feature: "serie_desmarcada", faixa: unmarkBand((Date.now() - at) / 1000) });
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

  // Próxima série visível (U1 §3.5): depois de marcar, se a próxima série (ou o exercício recém-aberto) ficou sob o
  // rodapé ou o cabeçalho, rola o mínimo para ela caber entre os dois. Espera o layout assentar: o exercício já aberto e
  // o rodapé já medido (o espaço no fim da página acompanha a altura dele). Vale por até 1 s; no máximo 1 rolagem.
  useEffect(() => {
    const r = reveal.current;
    if (!r) return;
    if (Date.now() - r.at > REVEAL_MAX_MS) return void (reveal.current = null);
    if (r.target.kind === "exercicio" && open !== r.target.uid) return;
    const head = headRef.current;
    const foot = footRef.current;
    if (!head || !foot) return;
    if (typeof ResizeObserver !== "undefined" && foot.offsetHeight !== footH) return;
    reveal.current = null;
    const section = document.querySelector<HTMLElement>(`section[data-uid="${CSS.escape(r.target.uid)}"]`);
    if (!section) return;
    let target: VerticalBand | null = null;
    if (r.target.kind === "serie") {
      const row = section.querySelector<HTMLElement>(`li[data-set="${r.target.index}"]`)?.getBoundingClientRect();
      if (row) target = { top: row.top, bottom: row.bottom };
    } else {
      // Do topo do cabeçalho do exercício até o fim da 1ª série por fazer (num exercício novo, a 1ª série).
      const log = draft?.session.exercises.find((e) => e.uid === r.target.uid);
      const idx = Math.max(0, log ? nextPendingIndex(log) : 0);
      const top = section.querySelector<HTMLElement>("[aria-expanded]")?.getBoundingClientRect().top;
      const bottom = section.querySelector<HTMLElement>(`li[data-set="${idx}"]`)?.getBoundingClientRect().bottom;
      if (top !== undefined && bottom !== undefined) target = { top, bottom };
    }
    if (!target) return;
    const delta = scrollDeltaToReveal(target, { top: head.getBoundingClientRect().bottom + 8, bottom: foot.getBoundingClientRect().top - 8 });
    if (!delta) return;
    window.scrollBy({ top: delta, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    track("session_feature_used", { feature: "proxima_serie_visivel", alvo: r.target.kind });
  }, [footH, open, draft]);

  // ───── Ações do exercício (U1 §3.6): "+ Série", troca e ⋯ (remover a última série, remover do treino) ─────

  const origin = swapOrigin(program, user?.id ?? "");
  const fromProgram = origin !== "livre";

  /** Foco de volta no ⋯ do exercício (a folha de ações já fechou; o diálogo nativo devolveria a um botão que sumiu). */
  const focusMore = (logUid: string) => requestAnimationFrame(() => document.getElementById(moreId(logUid))?.focus());

  const openActions = (logUid: string) => {
    setSheet({ open: true, uid: logUid });
    track("session_feature_used", { feature: "acoes_exercicio" });
  };

  /** Tira a última série: o descanso que ela iniciou e o cronômetro dela param (sem marcar). */
  const removeLastSet = (logUid: string) => {
    const log = draft?.session.exercises.find((e) => e.uid === logUid);
    if (!log || log.sets.length <= 1) return;
    const left = log.sets.length - 1;
    update(logUid, (l) => ({ ...l, sets: l.sets.length > 1 ? l.sets.slice(0, -1) : l.sets }));
    setRest((r) => restAfterRemove(r, logUid, left));
    if (hold && hold.logUid === logUid && hold.index >= left) setHold(null);
    forgetSets(logUid, left);
    track("session_feature_used", { feature: "serie_removida", estado: setRowState(log.sets[left]!) });
  };

  /** "Remover a última série": vazia sai na hora; preenchida ou feita pede confirmação. */
  const requestRemoveSet = (logUid: string) => {
    const log = draft?.session.exercises.find((e) => e.uid === logUid);
    if (!log) return;
    const ask = removeSetConfirm(log);
    if (ask) return setSetAsk({ open: true, uid: logUid, ...ask });
    removeLastSet(logUid);
    focusMore(logUid);
  };

  const closeSetAsk = (confirmed: boolean) => {
    // O diálogo nativo também avisa ao fechar depois de uma escolha: só a primeira conta.
    if (!setAsk.open) return;
    setSetAsk((a) => ({ ...a, open: false }));
    if (confirmed) removeLastSet(setAsk.uid);
    else track("session_feature_used", { feature: "remocao_cancelada", acao: "serie" });
    focusMore(setAsk.uid);
  };

  /** Tira o exercício do treino (descanso e cronômetro dele param) e leva o foco ao vizinho: próximo → anterior → "Adicionar exercício". */
  const dropExercise = (logUid: string) => {
    const all = draft?.session.exercises ?? [];
    const idx = all.findIndex((e) => e.uid === logUid);
    const log = all[idx];
    if (!log) return;
    const neighbor = all[idx + 1]?.uid ?? all[idx - 1]?.uid ?? null;
    removeLog(logUid);
    setRest((r) => restAfterRemove(r, logUid, 0));
    if (hold?.logUid === logUid) setHold(null);
    forgetSets(logUid);
    track("session_feature_used", { feature: "exercicio_removido", ...exerciseWork(log) });
    requestAnimationFrame(() => {
      const next = neighbor ? document.querySelector<HTMLElement>(`section[data-uid="${CSS.escape(neighbor)}"] [aria-expanded]`) : null;
      (next ?? addBtn.current)?.focus();
    });
  };

  /** "Remover do treino": sem nada feito nem digitado sai na hora; senão, confirmação. */
  const requestDropExercise = (logUid: string) => {
    const log = draft?.session.exercises.find((e) => e.uid === logUid);
    if (!log) return;
    const ask = removeExerciseConfirm(log, fromProgram);
    if (ask) return setDropAsk({ open: true, uid: logUid, body: ask.body });
    dropExercise(logUid);
  };

  const closeDropAsk = (confirmed: boolean) => {
    if (!dropAsk.open) return;
    setDropAsk((a) => ({ ...a, open: false }));
    if (confirmed) return dropExercise(dropAsk.uid);
    track("session_feature_used", { feature: "remocao_cancelada", acao: "exercicio" });
    focusMore(dropAsk.uid);
  };

  /** Abre a troca. Com o cronômetro deste exercício contando, ele para sem marcar a série (não marca por trás do seletor). */
  const openSwap = (logUid: string) => {
    if (hold?.logUid === logUid) setHold(null);
    setSwapUid(logUid);
  };

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
      // A ficha passa a mostrar a carga atual de cada exercício. Copiar a carga não é edição: a data de edição da
      // ficha não muda (U5 A4), e o personal continua vendo "ficha atual" em vez de "mudou depois do último envio".
      const updated = program ? programWithFinishedLoads(program, exercises) : null;
      if (updated) await repo.saveProgram(updated, { keepUpdatedAt: true }).catch(() => undefined);
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
        desmarcadas: tally.current.desmarcadas,
        trocas: tally.current.trocas,
        // Membros que ficaram sozinhos (o par saiu): um por grupo desfeito.
        grupos_desfeitos: draft.session.exercises.filter((e) => isLinkDissolved(e.uid, draft.session.exercises, draft.links)).length,
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
      {/* Superfície escura: o anel de foco fica chalk (16,27:1), não o azul (2,69:1 sobre iron). */}
      <header ref={headRef} data-surface="dark" className="sticky top-0 z-20 bg-iron text-chalk">
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
          <div className="h-full bg-done transition-[width] duration-300" style={{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }} />
        </div>
      </header>

      <main ref={mainRef} className="mx-auto max-w-2xl space-y-3 px-3 py-4 sm:px-4">
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
            swapLabel={swapCopy(origin).label}
            swappable={canSwap(log)}
            onSwap={() => openSwap(log.uid)}
            onSwapBlocked={() => track("session_feature_used", { feature: "trocar_bloqueado" })}
            onMore={() => openActions(log.uid)}
            onSet={(i, patch) => setField(log.uid, i, patch)}
            onDone={(i) => toggleDone(log, i)}
            onAddSet={() => update(log.uid, (l) => ({ ...l, sets: [...l.sets, { loadKg: l.sets[l.sets.length - 1]?.loadKg ?? null, reps: null, done: false }] }))}
            onNotes={(notes) => update(log.uid, (l) => ({ ...l, notes }))}
          />
        ))}

        <Button ref={addBtn} variant="secondary" className="w-full" onClick={() => setPicker(true)} icon={<Plus className="size-4" />}>
          Adicionar exercício
        </Button>
      </main>

      <div ref={footRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {/* Recorde ao vivo: região viva sempre presente, para o leitor de tela anunciar quando a linha aparece. */}
        <div role="status" aria-live="polite">
          {liveRecord ? (
            <div data-record className="bg-record text-on-record">
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
                <Timer className="size-5 shrink-0 text-iron" aria-hidden />
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
          <div className="bg-warn-fill text-iron">
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
        title={swapUid ? swapCopy(origin).label : "Adicionar exercício"}
        hint={swapUid ? swapCopy(origin).hint : null}
        onClose={() => {
          setPicker(false);
          setSwapUid(null);
        }}
        onPick={(e) => {
          const last = lastPerformance(history, e.id);
          const unit = unitOf(e.id);
          if (swapUid) {
            // Troca só neste treino (aparelho ocupado): mesmo registro (uid), a ficha não muda (swapInDraft).
            const target = swapUid;
            const cur = draft.session.exercises.find((x) => x.uid === target);
            setDraft((d) => (d ? swapInDraft(d, target, e, history) : d));
            forgetSets(target);
            setSwapUid(null);
            tally.current.trocas++;
            track("session_feature_used", { feature: "trocar_exercicio", origem: origin, mesma_unidade: (cur?.unit ?? "reps") === unit });
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

      {/* ⋯ do exercício: as ações que tiram dado do treino ficam aqui, fora da linha de botões. */}
      <ActionSheet
        open={sheet.open}
        onClose={() => setSheet((a) => ({ ...a, open: false }))}
        title={draft.session.exercises.find((e) => e.uid === sheet.uid)?.name ?? "Exercício"}
        actions={(() => {
          const log = draft.session.exercises.find((e) => e.uid === sheet.uid);
          if (!log) return [];
          const hint = lastSetHint(log);
          return [
            { label: "Remover a última série", icon: <Minus className="size-5" aria-hidden />, hint: hint.text, disabled: hint.disabled, onSelect: () => requestRemoveSet(log.uid) },
            { label: "Remover do treino", icon: <Trash2 className="size-5" aria-hidden />, tone: "danger" as const, hint: removeExerciseHint(fromProgram), onSelect: () => requestDropExercise(log.uid) },
          ];
        })()}
      />

      <Dialog open={setAsk.open} onClose={() => closeSetAsk(false)} title={setAsk.title}>
        <p className="text-[0.9375rem] text-steel">{setAsk.body}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => closeSetAsk(false)}>
            Manter
          </Button>
          <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => closeSetAsk(true)}>
            Remover série
          </Button>
        </div>
      </Dialog>

      <Dialog open={dropAsk.open} onClose={() => closeDropAsk(false)} title="Remover este exercício?">
        <p className="text-[0.9375rem] text-steel">{dropAsk.body}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => closeDropAsk(false)}>
            Manter
          </Button>
          <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => closeDropAsk(true)}>
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
  /** "Trocar só neste treino" (com ficha) ou "Trocar exercício" (treino livre). */
  swapLabel: string;
  /** Troca liberada (nenhuma série feita). Bloqueada: o botão continua tocável e explica o motivo. */
  swappable: boolean;
  onSwap: () => void;
  onSwapBlocked: () => void;
  /** ⋯: folha com "Remover a última série" e "Remover do treino". */
  onMore: () => void;
  onSet: (i: number, patch: Partial<SetLog>) => void;
  onDone: (i: number) => void;
  onAddSet: () => void;
  onNotes: (n: string) => void;
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function ExerciseBlock({ index, log, open, onToggle, suggestion, last, recordAt, link, dissolved, hold, onHoldStart, onHoldStop, swapLabel, swappable, onSwap, onSwapBlocked, onMore, onSet, onDone, onAddSet, onNotes }: BlockProps) {
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
  // Nota da troca bloqueada: aparece no toque e some quando o exercício fecha ou a troca volta a valer.
  const [blockedNote, setBlockedNote] = useState(false);
  const showBlocked = blockedNote && open && !swappable;
  useEffect(() => {
    if (!open || swappable) setBlockedNote(false);
  }, [open, swappable]);
  // Série cujo valor digitado passou de 999 (o campo voltou ao de antes): o aviso fica até a próxima edição da linha.
  const [aboveMax, setAboveMax] = useState<number | null>(null);
  const onLimit = (i: number, rejected: boolean) => setAboveMax((cur) => (rejected ? i : cur === i ? null : cur));
  useEffect(() => {
    if (!open) setAboveMax(null);
  }, [open]);

  return (
    <section data-uid={log.uid} className={cx("overflow-hidden rounded-[8px] border bg-paper transition-colors", open ? "border-iron" : complete ? "border-done/40" : "border-rule")}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4">
        <span className={cx("num grid size-8 shrink-0 place-items-center rounded text-sm font-bold", complete ? "bg-done text-white" : "bg-chalk-2")}>
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
            <div className="mb-3 space-y-1 rounded-[6px] border border-warn-line bg-warn-surface px-3 py-2 text-sm">
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
            {/* Sugestão de aumento em preto com a seta de alta: o troféu fica só para o recorde, depois que acontece. */}
            {suggestion && unit === "reps" ? (
              <p className="flex items-start gap-1.5 font-semibold text-iron">
                {suggestion.kind === "aumentar" ? <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
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
                <li key={i} data-set={i}>
                  <div className={cx("grid items-center gap-1.5", cols)}>
                    <span className="num text-sm font-bold text-steel">{i + 1}</span>
                    {showLoad ? (
                      <NumberCell
                        value={s.loadKg}
                        confirmed={s.done}
                        onChange={(v) => onSet(i, { loadKg: v || (optionalLoad ? null : v) })}
                        onLimit={(rejected) => onLimit(i, rejected)}
                        step={step}
                        label={`Carga da série ${i + 1}`}
                        placeholder={optionalLoad ? "—" : "kg"}
                      />
                    ) : null}
                    <NumberCell
                      value={s.reps}
                      confirmed={s.done}
                      onChange={(v) => onSet(i, { reps: v === null ? null : Math.round(v) })}
                      onLimit={(rejected) => onLimit(i, rejected)}
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
                  </div>
                  {/* Valor acima de 999: o campo voltou ao de antes e a linha diz por quê (até a próxima edição). */}
                  <div role="status">
                    {aboveMax === i ? (
                      <p className="mt-1 flex items-start gap-1.5 pl-[1.375rem] text-sm text-iron">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-hidden />
                        {ABOVE_MAX_NOTE}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          {unit === "seg" && nextPending >= 0 ? (
            hold ? (
              // "Série N" e "de m:ss" empilhados (numa linha só não cabem a 360 px), depois o relógio e o "Parar" (44 px).
              <div className="mt-3 flex items-center gap-3 rounded-[6px] border-2 border-iron px-3 py-2" role="timer">
                <span className="flex flex-col text-sm leading-tight text-steel">
                  <span className="whitespace-nowrap font-semibold">Série {hold.index + 1}</span>
                  <span className="num whitespace-nowrap">de {clock(hold.max)}</span>
                </span>
                <span className="num plate-type ml-auto text-3xl">{clock(hold.elapsed)}</span>
                <Button size="md" variant="primary" className="shrink-0" onClick={onHoldStop} icon={<Square className="size-4" aria-hidden />}>
                  Parar
                </Button>
              </div>
            ) : (
              <Button variant="secondary" className="mt-3 w-full" icon={<Play className="size-4" />} onClick={() => onHoldStart(nextPending, log.sets[nextPending]?.reps || p?.repsMax || 30)}>
                Cronometrar série {nextPending + 1} (até {log.sets[nextPending]?.reps || p?.repsMax || 30} s)
              </Button>
            )
          ) : null}

          {/* Ações: "+ Série", troca e ⋯ (remover). Texto de 14 px obrigatório: "Trocar só neste treino" cabe numa linha a 360 px. */}
          <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_2.75rem] gap-1.5">
            <Button variant="secondary" onClick={onAddSet} icon={<Plus className="size-4" aria-hidden />} className="gap-1.5! px-3! text-sm!" aria-label="Adicionar série">
              Série
            </Button>
            {/* Bloqueada: aria-disabled (não `disabled`) para o toque chegar e mostrar o motivo. */}
            <Button
              variant="secondary"
              aria-disabled={swappable ? undefined : true}
              onClick={() => {
                if (swappable) return onSwap();
                setBlockedNote(true);
                onSwapBlocked();
              }}
              className="h-auto! min-h-11 px-3! text-sm! leading-tight aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-rule-strong aria-disabled:active:translate-y-0"
            >
              {swapLabel}
            </Button>
            <IconButton id={moreId(log.uid)} label={`Mais ações: ${log.name}`} aria-haspopup="dialog" onClick={onMore}>
              <MoreHorizontal className="size-5" aria-hidden />
            </IconButton>
          </div>
          <div role="status">{showBlocked ? <p className="mt-2 text-sm text-steel">{SWAP_BLOCKED_NOTE}</p> : null}</div>

          {barbell && currentLoad ? <BarbellView totalKg={currentLoad} className="mt-3 rounded-[6px] bg-chalk px-3 py-2" /> : null}

          {/* Dica e Anotação recolhidas lado a lado; a que abrir ocupa a linha inteira. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-5">
            {ex?.cue ? (
              <details className="open:basis-full">
                <summary className="flex min-h-11 min-w-11 cursor-pointer items-center text-sm font-semibold text-steel">Dica</summary>
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
 * Acima de SET_MAX digitado: não grava nada novo, volta ao valor de quando o campo recebeu o foco e avisa (`onLimit`);
 * o + continua parando em SET_MAX. Abaixo de 360 px de tela, − e + somem para o número nunca aparecer cortado.
 */
function NumberCell({
  value,
  onChange,
  onLimit,
  step,
  label,
  placeholder,
  fallback,
  confirmed = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  /** A cada edição (digitada ou −/+): true quando o valor digitado passou do limite e não foi aceito. */
  onLimit?: (rejected: boolean) => void;
  step: number;
  label: string;
  placeholder?: string;
  fallback?: number | null;
  confirmed?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  // Valor quando o campo recebeu o foco: é para ele que o campo volta se o digitado passar do limite.
  const atFocus = useRef(value);
  const shown = text ?? (value === null ? "" : String(value).replace(".", ","));
  const base = value ?? fallback ?? 0;
  const bump = (delta: number) => {
    setText(null);
    onChange(Math.min(SET_MAX, Math.max(0, Math.round((base + delta) * 100) / 100)));
    onLimit?.(false);
  };
  return (
    <div className="flex h-12 items-stretch overflow-hidden rounded-[6px] border border-rule-strong bg-paper focus-within:border-iron">
      <button type="button" onClick={() => bump(value === null && fallback ? 0 : -step)} className="w-8 shrink-0 text-lg font-bold text-steel hover:bg-chalk-2 max-[360px]:hidden sm:w-10" aria-label={`Diminuir ${label}`}>
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
          const typed = raw === "" || raw === "," ? null : Number(raw.replace(",", "."));
          const r = acceptTyped(atFocus.current, typed, SET_MAX);
          onChange(r.value);
          onLimit?.(r.rejected);
        }}
        onFocus={(e) => {
          atFocus.current = value;
          selectAllSoon(e.currentTarget);
        }}
        onBlur={() => setText(null)}
        className={cx(
          "num w-full min-w-0 bg-transparent px-0 text-center text-base placeholder:font-normal placeholder:text-suggest focus:outline-none sm:text-lg",
          confirmed ? "font-bold text-iron" : "font-semibold text-suggest focus:text-iron",
        )}
      />
      <button type="button" onClick={() => bump(value === null && fallback ? 0 : step)} className="w-8 shrink-0 text-lg font-bold text-steel hover:bg-chalk-2 max-[360px]:hidden sm:w-10" aria-label={`Aumentar ${label}`}>
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
      <TrendingUp className="mr-2 size-4 shrink-0 self-center text-done" aria-hidden />
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
  const { repo, user, returnTo, mode } = useApp();
  const [feeling, setFeeling] = useState<Session["feeling"]>(session.feeling);
  const [note, setNote] = useState(session.note ?? "");
  const [saving, setSaving] = useState(false);
  /** O último toque de envio nesta tela (canal e a hora gravada). O app só sabe do toque, nunca que a mensagem saiu. */
  const [sent, setSent] = useState<{ via: PrepVia; at: string } | null>(null);
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
    // Superfície escura: anel de foco chalk em tudo daqui; os diálogos (papel) voltam ao azul pelo data-surface="light".
    <div data-surface="dark" className="min-h-dvh bg-iron text-chalk">
      <div className="mx-auto max-w-xl px-5 pt-6">
        <p className="text-sm font-semibold text-chalk/70">{summaryHeadline({ mode, hasCoach: Boolean(coach), viewingAsStudent: Boolean(returnTo) })}</p>
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
                <li key={id} data-record className="flex animate-stamp items-center gap-3 rounded-[8px] bg-record px-4 py-3 text-on-record" style={{ animationDelay: `${i * 120}ms` }}>
                  <Trophy className="size-5 shrink-0" aria-hidden />
                  <span className="sr-only">Recorde: </span>
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
                className={cx("min-h-11 rounded-[6px] border px-0.5 text-[0.8125rem] font-semibold", feeling === i + 1 ? "border-chalk bg-chalk text-iron" : "border-white/25 hover:border-white/60")}
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
              {/* Sempre montada (U2 §3.6): só o texto muda depois do toque. Diz o que o aparelho viu (o toque, a
                  cópia), nunca que o treino foi enviado; ícone de envio ou de cópia, nunca o de check. */}
              <StatusRegion onDark className="mb-2" text={sent ? prepStatusText(sent.via, sent.at, coachFirst, "aluno") : null} icon={sent?.via === "copy" ? "copia" : "whatsapp"} />
              {sent ? (
                <Button size="lg" variant="inverse" className="w-full" loading={saving} onClick={() => void conclude()}>
                  Concluir
                </Button>
              ) : null}
              {/* Fica sempre no mesmo lugar da árvore: o diálogo de envio não fecha quando o botão vira "Enviar de novo". */}
              <SendToCoach
                where="resumo"
                sessions={[{ ...session, feeling, note: note || undefined }]}
                size={sent ? "md" : "lg"}
                variant={sent ? "ghost" : "inverse"}
                label={sent ? `Enviar de novo para ${coachFirst}` : `Enviar para ${coachFirst}`}
                className={sent ? "mt-1 w-full !text-chalk/85 underline underline-offset-4 hover:!bg-white/10" : "w-full"}
                onSent={(via, at) => {
                  void persist();
                  setSent({ via, at });
                }}
              />
              {!sent ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void conclude()}
                  className="mt-1 flex min-h-11 w-full items-center justify-center rounded-[6px] text-[0.9375rem] font-semibold text-chalk/85 underline underline-offset-4 hover:text-chalk disabled:opacity-60"
                >
                  Concluir sem enviar
                </button>
              ) : null}
            </div>
          ) : (
            <Button size="lg" variant="inverse" className="w-full" loading={saving} onClick={() => void conclude()}>
              Concluir
            </Button>
          )}
        </div>
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
