"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Minus, Play, Plus, Replace, Square, Timer, Trash2, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { BarbellView } from "@/components/brand";
import { ExercisePicker } from "@/components/exercise-picker";
import { Alert, Badge, Button, Dialog, Skeleton, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { UNIT_LABEL, getExercise, unitOf } from "@/lib/domain/exercises";
import { fmtRest, fmtScheme } from "@/lib/domain/format";
import { TECHNIQUE_LABEL } from "@/lib/domain/generator";
import { uid } from "@/lib/domain/ids";
import { completedSets, detectPRs, fmtKg, lastPerformance, sessionVolume, suggestNext, type LoadSuggestion } from "@/lib/domain/progression";
import type { Exercise, ExerciseLog, Program, Session, SetLog, Technique, Unit } from "@/lib/domain/types";
import { track } from "@/lib/analytics";
import { fmtNum } from "@/lib/hooks";

export default function SessaoPage() {
  return (
    <Suspense fallback={<SessionSkeleton />}>
      <Sessao />
    </Suspense>
  );
}

interface Draft {
  session: Session;
  suggestions: Record<string, LoadSuggestion>;
  restSec: Record<string, number>;
}

const draftKey = (userId: string) => `sr:draft:${userId}`;

function buildDraft(userId: string, program: Program | null, dayKey: string | null, history: Session[]): Draft {
  const day = program?.days.find((d) => d.key === dayKey) ?? null;
  const suggestions: Record<string, LoadSuggestion> = {};
  const restSec: Record<string, number> = {};
  const exercises: ExerciseLog[] = (day?.exercises ?? []).map((p) => {
    const last = lastPerformance(history, p.exerciseId);
    const unit = unitOf(p.exerciseId, p.unit);
    const sug = suggestNext(last, p, p.exerciseId);
    const logUid = uid();
    if (unit === "reps") suggestions[logUid] = sug;
    restSec[logUid] = p.restSec;
    const impl = getExercise(p.exerciseId)?.implement;
    // Peso corporal/elástico e séries por tempo: carga é opcional ("peso extra"); nunca começa com 0 kg.
    const optionalLoad = unit !== "reps" || impl === "peso_corporal" || impl === "elastico";
    const load = unit === "min" ? null : optionalLoad ? (unit === "reps" ? sug.loadKg : null) || p.loadKg || null : (sug.loadKg ?? p.loadKg ?? null);
    return {
      uid: logUid,
      exerciseId: p.exerciseId,
      name: p.name,
      unit,
      planned: { sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax, loadKg: p.loadKg, restSec: p.restSec, technique: p.technique, notes: p.notes },
      sets: Array.from({ length: p.sets }, () => ({ loadKg: load, reps: null, done: false })),
    };
  });
  return {
    session: {
      id: uid(),
      userId,
      programId: program?.id ?? null,
      programName: program?.name,
      dayKey: day?.key,
      dayTitle: day?.title,
      startedAt: new Date().toISOString(),
      exercises,
      volumeKg: 0,
      prs: [],
    },
    suggestions,
    restSec,
  };
}

const LINKED: Technique[] = ["bi_set", "tri_set", "super_serie"];
const SOUND_KEY = "sr:sound";

/**
 * Grupos de exercícios feitos em sequência (bi-set, tri-set, supersérie).
 * Exercícios seguidos com a mesma técnica formam o grupo; se só o primeiro foi marcado,
 * ele se junta ao exercício seguinte.
 */
function linkGroups(exercises: ExerciseLog[]): Record<string, { members: string[]; pos: number }> {
  const out: Record<string, { members: string[]; pos: number }> = {};
  let i = 0;
  while (i < exercises.length) {
    const t = exercises[i]!.planned?.technique;
    if (!t || !LINKED.includes(t)) {
      i++;
      continue;
    }
    const size = t === "tri_set" ? 3 : 2;
    let j = i;
    while (j + 1 < exercises.length && j - i + 1 < size && exercises[j + 1]!.planned?.technique === t) j++;
    if (j === i && i + 1 < exercises.length) j = Math.min(exercises.length - 1, i + size - 1);
    const members = exercises.slice(i, j + 1).map((e) => e.uid);
    if (members.length > 1) members.forEach((u, pos) => (out[u] = { members, pos }));
    i = j + 1;
  }
  return out;
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
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
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
        try {
          const saved = localStorage.getItem(draftKey(user.id));
          if (saved) {
            const parsed = JSON.parse(saved) as Draft;
            const sameDay = parsed.session.programId === (prog?.id ?? null) && (parsed.session.dayKey ?? null) === (dayKey ?? parsed.session.dayKey ?? null);
            const fresh = Date.now() - new Date(parsed.session.startedAt).getTime() < 6 * 3_600_000;
            if (sameDay && fresh) d = parsed;
          }
        } catch {}
        d ??= buildDraft(user.id, prog, dayKey, hist);
        setDraft(d);
        setOpen(d.session.exercises.find((e) => e.sets.some((s) => !s.done))?.uid ?? d.session.exercises[0]?.uid ?? null);
        if (!d.session.exercises.length) setPicker(true);
        track("workout_started", { program: Boolean(prog), day: dayKey ?? "livre" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível abrir o treino.");
      }
    })();
  }, [user, repo, programId, dayKey]);

  // Salva rascunho a cada alteração (sobrevive a recarregar a página ou fechar o app).
  useEffect(() => {
    if (draft && user && !summary) localStorage.setItem(draftKey(user.id), JSON.stringify(draft));
  }, [draft, user, summary]);

  // Relógio (cronômetro do treino + descanso)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
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

  // Fim do descanso: vibra, apita e limpa
  useEffect(() => {
    if (rest && now >= rest.until) {
      navigator.vibrate?.([180, 80, 180]);
      beep(2);
      setRest(null);
    }
  }, [now, rest, beep]);

  // Mantém a tela acesa durante o treino
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  const update = useCallback((logUid: string, fn: (log: ExerciseLog) => ExerciseLog) => {
    setDraft((d) => (d ? { ...d, session: { ...d.session, exercises: d.session.exercises.map((e) => (e.uid === logUid ? fn(e) : e)) } } : d));
  }, []);

  const setField = (logUid: string, i: number, patch: Partial<SetLog>) =>
    update(logUid, (log) => ({ ...log, sets: log.sets.map((s, j) => (j === i ? { ...s, ...patch } : j > i && patch.loadKg !== undefined && !s.done ? { ...s, loadKg: patch.loadKg } : s)) }));

  const links = useMemo(() => linkGroups(draft?.session.exercises ?? []), [draft?.session.exercises]);

  /** Depois de uma série feita: descanso (ou sequência do bi-set) e avanço para o próximo exercício. */
  const afterDone = (log: ExerciseLog, i: number) => {
    navigator.vibrate?.(30);
    const all = draft?.session.exercises ?? [];
    const link = links[log.uid];
    const lastSet = i === log.sets.length - 1;
    const pending = (e: ExerciseLog) => (e.uid === log.uid ? e.sets.some((s, j) => !s.done && j !== i) : e.sets.some((s) => !s.done));
    if (link && link.pos < link.members.length - 1) {
      // Bi-set/tri-set: vai direto para o próximo exercício do grupo, sem descanso.
      const nextUid = link.members[link.pos + 1]!;
      setTimeout(() => setOpen(nextUid), 250);
      return;
    }
    const total = draft?.restSec[log.uid] ?? log.planned?.restSec ?? 90;
    if (total > 0) setRest({ until: Date.now() + total * 1000, total });
    if (link) {
      const first = all.find((e) => e.uid === link.members[0]);
      if (first && pending(first)) return void setTimeout(() => setOpen(first.uid), 350);
    }
    if (lastSet) {
      const next = all.find((e) => e.uid !== log.uid && !(link?.members.includes(e.uid)) && e.sets.some((s) => !s.done));
      if (next) setTimeout(() => setOpen(next.uid), 350);
    }
  };

  const toggleDone = (log: ExerciseLog, i: number) => {
    const set = log.sets[i]!;
    const done = !set.done;
    unlockAudio();
    // Sem valor digitado, assume o da mesma série no último treino (ou o mínimo da faixa) —
    // nunca o topo da faixa, que dispararia sugestão de aumento sem o atleta ter batido as reps.
    const reps = set.reps ?? (done ? defaultReps(log, i, lastPerformance(history, log.exerciseId)) : set.reps);
    update(log.uid, (l) => ({ ...l, sets: l.sets.map((s, j) => (j === i ? { ...s, done, reps } : s)) }));
    if (hold && hold.logUid === log.uid && hold.index === i) setHold(null);
    if (done) afterDone(log, i);
  };

  /** Cronômetro de série por tempo (prancha, isometria): para sozinho no alvo e marca a série. */
  const stopHold = useCallback(
    (seconds: number) => {
      if (!hold) return;
      const log = draft?.session.exercises.find((e) => e.uid === hold.logUid);
      setHold(null);
      if (!log) return;
      const i = hold.index;
      update(log.uid, (l) => ({ ...l, sets: l.sets.map((s, j) => (j === i ? { ...s, done: true, reps: Math.max(1, Math.round(seconds)) } : s)) }));
      navigator.vibrate?.([120, 60, 120]);
      beep(3);
      afterDone(log, i);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hold, draft, update, beep],
  );

  useEffect(() => {
    if (hold && now - hold.startedAt >= hold.max * 1000) stopHold(hold.max);
  }, [now, hold, stopHold]);

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

  async function finish() {
    if (!draft || !user) return;
    setFinishing(true);
    setError(null);
    try {
      const exercises = draft.session.exercises.filter((e) => completedSets(e).length);
      if (!exercises.length) {
        setError("Marque pelo menos uma série como feita para salvar o treino.");
        setFinishing(false);
        return;
      }
      const s: Session = { ...draft.session, exercises, finishedAt: new Date().toISOString() };
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
      localStorage.removeItem(draftKey(user.id));
      track("workout_completed", { sets: stats.done, prs: s.prs.length, minutes: Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000) });
      if (s.prs.length) track("pr_achieved", { count: s.prs.length });
      setSummary(saved);
      setRest(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar. Seus dados continuam nesta tela.");
    } finally {
      setFinishing(false);
    }
  }

  function discard() {
    if (user) localStorage.removeItem(draftKey(user.id));
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
  if (!draft) return <SessionSkeleton />;
  if (summary) return <Summary session={summary} onDone={() => router.push("/hoje")} />;

  const elapsed = Math.max(0, Math.floor((now - new Date(draft.session.startedAt).getTime()) / 1000));
  const restLeft = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;

  return (
    <div className="min-h-dvh pb-40">
      <header className="sticky top-0 z-20 bg-iron text-chalk">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button onClick={() => setConfirmExit(true)} className="-ml-2 grid size-11 place-items-center rounded hover:bg-white/10" aria-label="Sair do treino">
            <X className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{draft.session.dayKey ? `Treino ${draft.session.dayKey} — ${draft.session.dayTitle}` : "Treino livre"}</p>
            <p className="num text-xs text-chalk/65">
              {stats.exDone}/{draft.session.exercises.length} exercícios · {stats.done}/{stats.total} séries{stats.volume ? ` · ${fmtNum(stats.volume, 0)} kg` : ""}
            </p>
          </div>
          <span className="num plate-type text-lg" aria-label="Tempo de treino">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
          <button
            onClick={() => {
              const on = !sound;
              setSound(on);
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

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        {draft.session.exercises.map((log, idx) => (
          <ExerciseBlock
            key={log.uid}
            index={idx}
            log={log}
            open={open === log.uid}
            onToggle={() => setOpen(open === log.uid ? null : log.uid)}
            suggestion={draft.suggestions[log.uid]}
            last={lastPerformance(history, log.exerciseId)}
            link={links[log.uid] ? { pos: links[log.uid]!.pos, size: links[log.uid]!.members.length, partner: draft.session.exercises.find((e) => e.uid === links[log.uid]!.members[links[log.uid]!.pos === links[log.uid]!.members.length - 1 ? links[log.uid]!.pos - 1 : links[log.uid]!.pos + 1])?.name ?? "" } : undefined}
            hold={hold && hold.logUid === log.uid ? { index: hold.index, elapsed: Math.max(0, Math.floor((now - hold.startedAt) / 1000)), max: hold.max } : null}
            onHoldStart={(i, max) => {
              unlockAudio();
              setRest(null);
              setHold({ logUid: log.uid, index: i, startedAt: Date.now(), max });
            }}
            onHoldStop={() => hold && stopHold((Date.now() - hold.startedAt) / 1000)}
            onSwap={() => setSwapUid(log.uid)}
            onSet={(i, patch) => setField(log.uid, i, patch)}
            onDone={(i) => toggleDone(log, i)}
            onAddSet={() => update(log.uid, (l) => ({ ...l, sets: [...l.sets, { loadKg: l.sets[l.sets.length - 1]?.loadKg ?? null, reps: null, done: false }] }))}
            onRemoveSet={() => update(log.uid, (l) => ({ ...l, sets: l.sets.length > 1 ? l.sets.slice(0, -1) : l.sets }))}
            onRemove={() => setDraft((d) => (d ? { ...d, session: { ...d.session, exercises: d.session.exercises.filter((e) => e.uid !== log.uid) } } : d))}
            onNotes={(notes) => update(log.uid, (l) => ({ ...l, notes }))}
          />
        ))}

        <Button variant="secondary" className="w-full" onClick={() => setPicker(true)} icon={<Plus className="size-4" />}>
          Adicionar exercício
        </Button>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {rest ? (
          <div className="mx-auto flex max-w-2xl items-center gap-3 border-b border-rule px-4 py-2.5" role="timer" aria-live="off">
            <Timer className="size-5 text-plate-red" aria-hidden />
            <span className="text-sm font-semibold text-steel">Descanso</span>
            <span className="num plate-type ml-auto text-3xl">
              {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
            </span>
            <Button size="sm" variant="secondary" onClick={() => setRest((r) => (r ? { ...r, until: r.until + 15_000 } : r))}>
              +15s
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRest(null)}>
              Pular
            </Button>
          </div>
        ) : null}
        <div className="mx-auto max-w-2xl px-4 py-3">
          <Button size="lg" className="w-full" onClick={finish} loading={finishing} variant={stats.done === stats.total && stats.total > 0 ? "record" : "primary"}>
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
              const sug = unit === "reps" ? suggestNext(last, planned, e.id) : null;
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
            return;
          }
          const logUid = uid();
          const planned = defaultPlan(e);
          const sug = unit === "reps" ? suggestNext(last, planned, e.id) : null;
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

      <Dialog open={confirmExit} onClose={() => setConfirmExit(false)} title="Sair do treino?">
        <p className="text-[0.9375rem] text-steel">Seu progresso fica salvo neste aparelho e você pode voltar depois. Ou descarte este treino.</p>
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

/** Prescrição padrão de um exercício adicionado na hora, conforme a unidade. */
function defaultPlan(e: Exercise): { sets: number; repsMin: number; repsMax: number; restSec: number } {
  const unit = unitOf(e.id);
  if (unit === "min") return { sets: 1, repsMin: 15, repsMax: 15, restSec: 0 };
  if (unit === "seg") return { sets: 3, repsMin: 30, repsMax: 45, restSec: 45 };
  return { sets: 3, repsMin: 8, repsMax: 12, restSec: e.compound ? 120 : 75 };
}

function defaultReps(log: ExerciseLog, i: number, last: ExerciseLog | null): number | null {
  const prev = last ? completedSets(last)[i]?.reps : undefined;
  return prev ?? log.planned?.repsMin ?? null;
}

interface BlockProps {
  index: number;
  log: ExerciseLog;
  open: boolean;
  onToggle: () => void;
  suggestion?: LoadSuggestion;
  last: ExerciseLog | null;
  link?: { pos: number; size: number; partner: string };
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

function ExerciseBlock({ index, log, open, onToggle, suggestion, last, link, hold, onHoldStart, onHoldStop, onSwap, onSet, onDone, onAddSet, onRemoveSet, onRemove, onNotes }: BlockProps) {
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
  const cols = showLoad ? "grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_3rem]" : "grid-cols-[1.25rem_minmax(0,1fr)_3rem]";
  const technique = p?.technique && p.technique !== "normal" ? TECHNIQUE_LABEL[p.technique] : null;
  const nextPending = log.sets.findIndex((s) => !s.done);
  const fmtSet = (s: SetLog) => (unit === "reps" ? (s.loadKg ? `${fmtNum(s.loadKg)}×${s.reps}` : `${s.reps}`) : `${s.loadKg ? `${fmtNum(s.loadKg)} kg · ` : ""}${s.reps} ${UNIT_LABEL[unit].short}`);

  return (
    <section className={cx("overflow-hidden rounded-[8px] border bg-paper transition-colors", open ? "border-iron" : complete ? "border-plate-green/40" : "border-rule")}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
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
        <div className="border-t border-rule px-4 pb-4 pt-3">
          {technique || p?.notes || link ? (
            <div className="mb-3 space-y-1 rounded-[6px] border border-plate-yellow/60 bg-plate-yellow/12 px-3 py-2 text-sm">
              {technique ? <p className="font-bold">{technique}</p> : null}
              {link ? (
                <p>
                  {link.pos < link.size - 1 ? `Faça em sequência com ${link.partner}, sem descanso entre os dois.` : `Depois desta série, descanse e volte para ${link.partner}.`}
                </p>
              ) : null}
              {p?.notes ? <p>{p.notes}</p> : null}
            </div>
          ) : null}

          <div className="space-y-1 text-sm">
            <p className="num text-steel">Última vez: {last && completedSets(last).length ? completedSets(last).map(fmtSet).join(" · ") : "primeiro registro"}</p>
            {suggestion && unit === "reps" ? (
              <p className={cx("flex items-start gap-1.5 font-semibold", suggestion.kind === "aumentar" ? "text-plate-red-ink" : "text-iron")}>
                {suggestion.kind === "aumentar" ? <Trophy className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
                {suggestion.text}
              </p>
            ) : null}
            {p?.restSec && unit !== "min" ? <p className="num text-steel">Descanso: {fmtRest(p.restSec)}</p> : null}
            {ex?.cue ? <p className="text-steel">{ex.cue}</p> : null}
          </div>

          <div className={cx("mt-3 grid gap-2 px-0.5", cols)}>
            <span className="col-head text-steel">#</span>
            {showLoad ? <span className="col-head truncate text-steel">{optionalLoad ? "Peso extra (kg)" : "Carga (kg)"}</span> : null}
            <span className="col-head text-steel">{UNIT_LABEL[unit].column}</span>
            <span className="col-head text-center text-steel">Feito</span>
          </div>
          <ol className="mt-1.5 space-y-2">
            {log.sets.map((s, i) => (
              <li key={i} className={cx("grid items-center gap-2", cols, s.done && "opacity-80")}>
                <span className="num text-sm font-bold text-steel">{i + 1}</span>
                {showLoad ? (
                  <NumberCell value={s.loadKg} onChange={(v) => onSet(i, { loadKg: v || (optionalLoad ? null : v) })} step={step} label={`Carga da série ${i + 1}`} placeholder={optionalLoad ? "—" : "kg"} />
                ) : null}
                <NumberCell
                  value={s.reps}
                  onChange={(v) => onSet(i, { reps: v === null ? null : Math.round(v) })}
                  step={unit === "seg" ? 5 : 1}
                  label={`${UNIT_LABEL[unit].column} da série ${i + 1}`}
                  placeholder={String(defaultReps(log, i, last) ?? "")}
                />
                <button
                  onClick={() => onDone(i)}
                  aria-pressed={s.done}
                  aria-label={s.done ? `Desmarcar série ${i + 1}` : `Marcar série ${i + 1} como feita`}
                  className={cx("grid h-12 place-items-center rounded-[6px] border-2 transition-colors", s.done ? "animate-stamp border-plate-green bg-plate-green text-white" : "border-rule-strong hover:border-iron")}
                >
                  <Check className="size-5" />
                </button>
              </li>
            ))}
          </ol>

          {unit === "seg" && nextPending >= 0 ? (
            hold ? (
              <div className="mt-3 flex items-center gap-3 rounded-[6px] border-2 border-iron px-3 py-2" role="timer">
                <span className="text-sm font-semibold text-steel">Série {hold.index + 1}</span>
                <span className="num plate-type ml-auto text-3xl">{clock(hold.elapsed)}</span>
                <span className="num text-sm text-steel">de {clock(hold.max)}</span>
                <Button size="sm" variant="record" onClick={onHoldStop} icon={<Square className="size-4" />}>
                  Parar
                </Button>
              </div>
            ) : (
              <Button variant="secondary" className="mt-3 w-full" icon={<Play className="size-4" />} onClick={() => onHoldStart(nextPending, log.sets[nextPending]?.reps || p?.repsMax || 30)}>
                Cronometrar série {nextPending + 1} (até {log.sets[nextPending]?.reps || p?.repsMax || 30} s)
              </Button>
            )
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onAddSet} icon={<Plus className="size-4" />}>
              Série
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemoveSet} icon={<Minus className="size-4" />} disabled={log.sets.length <= 1}>
              Série
            </Button>
            <Button size="sm" variant="ghost" onClick={onSwap} icon={<Replace className="size-4" />} disabled={doneCount > 0} title={doneCount > 0 ? "Já há séries feitas neste exercício" : undefined}>
              Trocar
            </Button>
            <Button size="sm" variant="ghost" onClick={onRemove} className="ml-auto text-plate-red-ink" icon={<Trash2 className="size-4" />}>
              Remover
            </Button>
          </div>

          {barbell && currentLoad ? <BarbellView totalKg={currentLoad} className="mt-3 rounded-[6px] bg-chalk px-3 py-2" /> : null}

          <details className="mt-3">
            <summary className="flex min-h-9 cursor-pointer items-center text-sm font-semibold text-steel">Anotação</summary>
            <Textarea value={log.notes ?? ""} onChange={(e) => onNotes(e.target.value)} rows={2} className="mt-2 min-h-16" placeholder="Ex.: pegada mais aberta, dor no ombro na 3ª série" />
          </details>
        </div>
      ) : null}
    </section>
  );
}

function NumberCell({ value, onChange, step, label, placeholder }: { value: number | null; onChange: (v: number | null) => void; step: number; label: string; placeholder?: string }) {
  return (
    <div className="flex h-12 items-stretch overflow-hidden rounded-[6px] border border-rule-strong bg-paper focus-within:border-iron">
      <button type="button" onClick={() => onChange(Math.max(0, Math.round(((value ?? 0) - step) * 100) / 100))} className="w-9 shrink-0 text-lg font-bold text-steel hover:bg-chalk-2" aria-label={`Diminuir ${label}`}>
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder={placeholder}
        value={value === null ? "" : String(value).replace(".", ",")}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
          if (raw === "") return onChange(null);
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(Math.min(999, n));
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="num w-full min-w-0 bg-transparent text-center text-lg font-bold placeholder:font-normal placeholder:text-pencil focus:outline-none"
      />
      <button type="button" onClick={() => onChange(Math.round(((value ?? 0) + step) * 100) / 100)} className="w-9 shrink-0 text-lg font-bold text-steel hover:bg-chalk-2" aria-label={`Aumentar ${label}`}>
        +
      </button>
    </div>
  );
}

function Summary({ session, onDone }: { session: Session; onDone: () => void }) {
  const { repo } = useApp();
  const [feeling, setFeeling] = useState<Session["feeling"]>();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const minutes = session.finishedAt ? Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000) : 0;
  const sets = session.exercises.reduce((a, e) => a + completedSets(e).length, 0);

  return (
    <div className="min-h-dvh bg-iron text-chalk">
      <div className="mx-auto max-w-xl px-5 py-10">
        <p className="text-sm font-semibold text-chalk/60">Treino concluído</p>
        <h1 className="plate-type mt-1 text-[2.4rem] leading-tight">{session.prs.length ? "Dia de recorde." : "Treino na conta."}</h1>
        <dl className="mt-8 grid grid-cols-3 divide-x divide-white/15 border-y border-white/15 py-4 text-center">
          <div>
            <dd className="num plate-type text-2xl">{minutes}</dd>
            <dt className="text-xs text-chalk/60">minutos</dt>
          </div>
          <div>
            <dd className="num plate-type text-2xl">{sets}</dd>
            <dt className="text-xs text-chalk/60">séries</dt>
          </div>
          <div>
            {session.volumeKg > 0 ? (
              <>
                <dd className="num plate-type text-2xl">{session.volumeKg >= 1000 ? fmtNum(session.volumeKg / 1000, 1) : fmtNum(session.volumeKg, 0)}</dd>
                <dt className="text-xs text-chalk/60">{session.volumeKg >= 1000 ? "toneladas" : "kg levantados"}</dt>
              </>
            ) : (
              <>
                <dd className="num plate-type text-2xl">{session.exercises.length}</dd>
                <dt className="text-xs text-chalk/60">{session.exercises.length === 1 ? "exercício" : "exercícios"}</dt>
              </>
            )}
          </div>
        </dl>

        {session.prs.length ? (
          <ul className="mt-6 space-y-2">
            {session.prs.map((id, i) => {
              const log = session.exercises.find((e) => e.exerciseId === id);
              const best = log ? completedSets(log).reduce((b, s) => ((s.loadKg ?? 0) > (b.loadKg ?? 0) ? s : b), completedSets(log)[0]!) : null;
              return (
                <li key={id} className="flex animate-stamp items-center gap-3 rounded-[8px] bg-plate-red px-4 py-3" style={{ animationDelay: `${i * 120}ms` }}>
                  <Trophy className="size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-bold">{log?.name}</span>
                  <span className="num font-bold">{best ? `${fmtKg(best.loadKg)} × ${best.reps}` : ""}</span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-8">
          <p className="text-sm font-semibold">Como foi o treino?</p>
          <div className="mt-2 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Como foi o treino">
            {(["Péssimo", "Ruim", "Ok", "Bom", "Ótimo"] as const).map((l, i) => (
              <button
                key={l}
                role="radio"
                aria-checked={feeling === i + 1}
                onClick={() => setFeeling((i + 1) as Session["feeling"])}
                className={cx("min-h-11 rounded-[6px] border px-0.5 text-[0.8125rem] font-semibold", feeling === i + 1 ? "border-chalk bg-chalk text-iron" : "border-white/25 hover:border-white/60")}
              >
                {l}
              </button>
            ))}
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anotação do treino (opcional)" className="mt-3 border-white/25 bg-white/5 text-chalk placeholder:text-chalk/40" rows={2} />
        </div>

        <Button
          size="lg"
          className="mt-8 w-full !bg-chalk !text-iron hover:!bg-white"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            if (feeling || note) await repo.saveSession({ ...session, feeling, note: note || undefined }).catch(() => undefined);
            onDone();
          }}
        >
          Concluir
        </Button>
        {session.prs.length ? (
          <div className="mt-4 flex justify-center">
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
