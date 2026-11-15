"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Printer, Replace, Trash2 } from "lucide-react";
import { ExercisePicker } from "@/components/exercise-picker";
import { FichaDay } from "@/components/ficha";
import { Alert, Button, Field, Input, Select, Skeleton, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { getExercise } from "@/lib/domain/exercises";
import { TECHNIQUE_LABEL, buildPlanned, estimateDayMinutes, repScheme } from "@/lib/domain/generator";

import type { Exercise, PlannedExercise, Program, Technique } from "@/lib/domain/types";

const RESTS = [30, 45, 60, 75, 90, 120, 150, 180, 240];

export function ProgramEditor({ programId, onSaved }: { programId: string; onSaved?: (p: Program) => void }) {
  const { repo } = useApp();
  const [program, setProgram] = useState<Program | null>(null);
  const [day, setDay] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<{ replace?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    repo.getProgram(programId).then((p) => (p ? setProgram(p) : setNotFound(true)));
  }, [programId, repo]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (notFound) return <Alert tone="error">Ficha não encontrada ou sem permissão de acesso.</Alert>;
  if (!program) return <Skeleton className="h-96" />;

  const d = program.days[day]!;
  const change = (fn: (p: Program) => Program) => {
    setProgram((p) => (p ? fn(p) : p));
    setDirty(true);
    setMsg(null);
  };
  const changeDay = (fn: (ex: PlannedExercise[]) => PlannedExercise[]) =>
    change((p) => ({ ...p, days: p.days.map((x, i) => (i === day ? { ...x, exercises: fn(x.exercises) } : x)) }));
  const changeEx = (u: string, patch: Partial<PlannedExercise>) => changeDay((list) => list.map((e) => (e.uid === u ? { ...e, ...patch } : e)));

  function pick(e: Exercise) {
    const scheme = repScheme(program!.goal, program!.level, e, program!.system, false);
    if (picker?.replace) {
      changeDay((list) => list.map((x) => (x.uid === picker.replace ? { ...x, exerciseId: e.id, name: e.name, loadKg: null } : x)));
    } else {
      changeDay((list) => [...list, buildPlanned(e, scheme)]);
    }
  }

  async function save() {
    if (!program) return;
    setSaving(true);
    try {
      const saved = await repo.saveProgram(program);
      setProgram(saved);
      setDirty(false);
      setMsg({ tone: "done", text: "Ficha salva." });
      onSaved?.(saved);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="no-print grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Nome da ficha">
          <Input value={program.name} onChange={(e) => change((p) => ({ ...p, name: e.target.value }))} maxLength={60} />
        </Field>
        <div className="flex items-end gap-2">
          <Button variant="secondary" onClick={() => window.print()} icon={<Printer className="size-4" />}>
            Imprimir
          </Button>
        </div>
      </div>

      <div className="no-print -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Dias da ficha">
        {program.days.map((x, i) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={i === day}
            onClick={() => setDay(i)}
            className={cx("shrink-0 rounded-[6px] border px-3.5 py-2 text-left", i === day ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron")}
          >
            <span className="plate-type block text-lg leading-none">{x.key}</span>
            <span className={cx("mt-1 block text-xs", i === day ? "text-chalk/70" : "text-steel")}>{x.exercises.length} exerc.</span>
          </button>
        ))}
      </div>

      <section className="no-print space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label={`Título do treino ${d.key}`}>
            <Input value={d.title} onChange={(e) => change((p) => ({ ...p, days: p.days.map((x, i) => (i === day ? { ...x, title: e.target.value } : x)) }))} maxLength={80} />
          </Field>
          <p className="num pb-3 text-sm text-steel">~{estimateDayMinutes(d)} min estimados</p>
        </div>

        {d.exercises.length === 0 ? (
          <Alert tone="info">Nenhum exercício neste dia ainda. Adicione o primeiro abaixo.</Alert>
        ) : (
          <ol className="space-y-2">
            {d.exercises.map((e, i) => (
              <li key={e.uid} className="rounded-[8px] border border-rule bg-paper p-3">
                <div className="flex items-start gap-2">
                  <span className="num mt-1 grid size-7 shrink-0 place-items-center rounded bg-chalk-2 text-sm font-bold">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{e.name}</p>
                    <p className="text-xs text-steel">{getExercise(e.exerciseId)?.cue}</p>
                  </div>
                  <div className="flex shrink-0">
                    <IconBtn label="Subir" disabled={i === 0} onClick={() => changeDay((l) => swap(l, i, i - 1))} icon={<ArrowUp className="size-4" />} />
                    <IconBtn label="Descer" disabled={i === d.exercises.length - 1} onClick={() => changeDay((l) => swap(l, i, i + 1))} icon={<ArrowDown className="size-4" />} />
                    <IconBtn label="Trocar exercício" onClick={() => setPicker({ replace: e.uid })} icon={<Replace className="size-4" />} />
                    <IconBtn label="Remover" onClick={() => changeDay((l) => l.filter((x) => x.uid !== e.uid))} icon={<Trash2 className="size-4 text-plate-red-ink" />} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <Mini label="Séries" value={e.sets} onChange={(v) => changeEx(e.uid, { sets: clamp(v, 1, 10) })} />
                  <Mini label="Reps mín" value={e.repsMin} onChange={(v) => changeEx(e.uid, { repsMin: clamp(v, 1, 60), repsMax: Math.max(e.repsMax, clamp(v, 1, 60)) })} />
                  <Mini label="Reps máx" value={e.repsMax} onChange={(v) => changeEx(e.uid, { repsMax: clamp(Math.max(v, e.repsMin), 1, 60) })} />
                  <Mini label="Carga kg" value={e.loadKg ?? null} decimal onChange={(v) => changeEx(e.uid, { loadKg: v || null })} />
                  <label className="block">
                    <span className="col-head mb-1 block text-steel">Descanso</span>
                    <Select value={e.restSec} onChange={(ev) => changeEx(e.uid, { restSec: Number(ev.target.value) })} className="h-10 text-sm">
                      {RESTS.map((r) => (
                        <option key={r} value={r}>
                          {r >= 60 ? `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}` : `${r}s`}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="col-head mb-1 block text-steel">Técnica</span>
                    <Select value={e.technique} onChange={(ev) => changeEx(e.uid, { technique: ev.target.value as Technique })} className="h-10 text-sm">
                      {(Object.keys(TECHNIQUE_LABEL) as Technique[]).map((t) => (
                        <option key={t} value={t}>
                          {TECHNIQUE_LABEL[t]}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <Input value={e.notes ?? ""} onChange={(ev) => changeEx(e.uid, { notes: ev.target.value || undefined })} placeholder="Observação (cadência, pegada, amplitude…)" className="mt-2 h-10 text-sm" maxLength={140} />
              </li>
            ))}
          </ol>
        )}
        <Button variant="secondary" className="w-full" onClick={() => setPicker({})} icon={<Plus className="size-4" />}>
          Adicionar exercício ao treino {d.key}
        </Button>
      </section>

      <Field label="Orientações gerais da ficha" className="no-print">
        <Textarea value={program.notes ?? ""} onChange={(e) => change((p) => ({ ...p, notes: e.target.value }))} rows={3} maxLength={600} placeholder="Aquecimento, progressão, cardio…" />
      </Field>

      {/* Versão de impressão: a ficha inteira em papel */}
      <div className="hidden space-y-4 print:block">
        <h1 className="plate-type text-2xl">{program.name}</h1>
        {program.days.map((x) => (
          <FichaDay key={x.key} day={x} />
        ))}
        {program.notes ? <p className="text-sm">{program.notes}</p> : null}
      </div>

      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {dirty ? (
        <div className="no-print sticky bottom-20 z-10 flex items-center justify-end gap-3 lg:bottom-4">
          <span className="rounded bg-plate-yellow px-2 py-1 text-sm font-semibold">Alterações não salvas</span>
          <Button size="lg" onClick={save} loading={saving} className="shadow-lift">
            Salvar ficha
          </Button>
        </div>
      ) : null}

      <ExercisePicker open={Boolean(picker)} onClose={() => setPicker(null)} onPick={pick} title={picker?.replace ? "Trocar exercício" : "Adicionar exercício"} />
    </div>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const copy = [...list];
  [copy[a], copy[b]] = [copy[b]!, copy[a]!];
  return copy;
}
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v || min)));

function IconBtn({ label, onClick, icon, disabled }: { label: string; onClick: () => void; icon: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-9 place-items-center rounded hover:bg-chalk-2 disabled:opacity-30">
      {icon}
    </button>
  );
}

function Mini({ label, value, onChange, decimal }: { label: string; value: number | null; onChange: (v: number) => void; decimal?: boolean }) {
  return (
    <label className="block">
      <span className="col-head mb-1 block text-steel">{label}</span>
      <Input
        inputMode={decimal ? "decimal" : "numeric"}
        value={value === null ? "" : String(value).replace(".", ",")}
        onChange={(e) => {
          const n = Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
          onChange(Number.isNaN(n) ? 0 : n);
        }}
        className="num h-10 text-center font-bold"
      />
    </label>
  );
}

