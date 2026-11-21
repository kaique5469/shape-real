"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Copy, MoreHorizontal, MoveLeft, MoveRight, Plus, Trash2 } from "lucide-react";
import { ExercisePicker } from "@/components/exercise-picker";
import { FichaDay } from "@/components/ficha";
import { ProgramShare, shareNames } from "@/components/program/program-share";
import { ActionSheet, Alert, Badge, Button, Dialog, Field, IconButton, Input, Panel, Select, Skeleton, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { GROUP_LABEL, getExercise, unitOf } from "@/lib/domain/exercises";
import { fmtLoad, fmtRest, fmtScheme, programValidity } from "@/lib/domain/format";
import { GOAL_LABEL, LEVEL_LABEL, TECHNIQUE_LABEL, buildPlanned, estimateDayMinutes, repScheme } from "@/lib/domain/generator";
import { uid } from "@/lib/domain/ids";
import { PLANS } from "@/lib/domain/plans";
import { focusOfDay, nextDayKey, programSetsPerGroup } from "@/lib/domain/program-share";
import { getSystem } from "@/lib/domain/systems";
import { fmtDate } from "@/lib/hooks";
import type { Exercise, Goal, Level, PlannedExercise, Profile, Program, Technique, Unit, WorkoutDay } from "@/lib/domain/types";

const RESTS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const UNIT_FIELDS: Record<Unit, { min: string; max: string; single: string; hi: number }> = {
  reps: { min: "Reps mín", max: "Reps máx", single: "Reps", hi: 100 },
  seg: { min: "Seg mín", max: "Seg máx", single: "Segundos", hi: 600 },
  min: { min: "Min mín", max: "Min máx", single: "Minutos", hi: 180 },
};

interface Props {
  programId: string;
  onSaved?: (p: Program) => void;
  /** Aluno dono da ficha quando quem edita é o personal. */
  student?: Profile | null;
  /** Link de volta (o editor avisa se houver alterações não salvas). */
  back?: { href: string; label: string };
}

export function ProgramEditor({ programId, onSaved, student, back }: Props) {
  const { repo, user, plan } = useApp();
  const router = useRouter();
  const [program, setProgram] = useState<Program | null>(null);
  const [day, setDay] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ replace?: string } | null>(null);
  const [dayMenu, setDayMenu] = useState(false);
  const [confirmDay, setConfirmDay] = useState(false);
  const [leave, setLeave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const autoPrint = useRef(false);

  useEffect(() => {
    let alive = true;
    repo
      .getProgram(programId)
      .then((p) => {
        if (!alive) return;
        if (!p) return setNotFound(true);
        setProgram(p);
        const q = new URLSearchParams(window.location.search);
        if (q.get("enviada")) setMsg({ tone: "done", text: "Ficha salva e ativa. Revise os detalhes e envie pelo WhatsApp ou imprima." });
        else if (q.get("salva")) setMsg({ tone: "done", text: user?.role === "coach" ? "Modelo salvo. Monte os treinos e depois aplique a um aluno." : "Ficha salva e ativa. Ela já aparece em Hoje." });
        autoPrint.current = Boolean(q.get("imprimir"));
      })
      .catch(() => alive && setNotFound(true));
    return () => {
      alive = false;
    };
  }, [programId, repo]);

  useEffect(() => {
    if (program && autoPrint.current) {
      autoPrint.current = false;
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [program]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const volume = useMemo(() => (program ? programSetsPerGroup(program) : []), [program]);

  const backLink = back ? (
    <Link
      href={back.href}
      onClick={(e) => {
        if (dirty) {
          e.preventDefault();
          setLeave(true);
        }
      }}
      className="no-print mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron"
    >
      <ArrowLeft className="size-4" /> {back.label}
    </Link>
  ) : null;

  if (notFound)
    return (
      <>
        {backLink}
        <Alert tone="error">Ficha não encontrada. Ela pode ter sido excluída.</Alert>
      </>
    );
  if (!program) return <Skeleton className="h-96" />;

  const index = Math.min(day, program.days.length - 1);
  const d = program.days[index]!;
  const isCoachEditing = Boolean(student) && user?.id !== program.ownerId;
  // Ficha do próprio personal = modelo reutilizável (não tem "ativa" nem validade correndo).
  const template = user?.role === "coach" && program.ownerId === user.id;
  const validity = programValidity(program.createdAt, program.durationWeeks);
  const names = shareNames(user, student);

  const change = (fn: (p: Program) => Program) => {
    setProgram((p) => (p ? fn(p) : p));
    setDirty(true);
    setMsg(null);
  };
  const changeDays = (fn: (days: WorkoutDay[]) => WorkoutDay[]) => change((p) => ({ ...p, days: fn(p.days) }));
  const patchDay = (patch: Partial<WorkoutDay>) => changeDays((days) => days.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const changeList = (fn: (ex: PlannedExercise[]) => PlannedExercise[]) => changeDays((days) => days.map((x, i) => (i === index ? { ...x, exercises: fn(x.exercises) } : x)));
  const changeEx = (u: string, patch: Partial<PlannedExercise>) => changeList((list) => list.map((e) => (e.uid === u ? { ...e, ...patch } : e)));

  function pick(e: Exercise) {
    const scheme = repScheme(program!.goal, program!.level, e, program!.system, false);
    const fresh = buildPlanned(e, scheme);
    if (picker?.replace) {
      changeList((list) =>
        list.map((x) => {
          if (x.uid !== picker.replace) return x;
          // Mesma unidade: mantém séries, faixa e descanso que o personal já ajustou.
          const sameUnit = unitOf(x.exerciseId, x.unit) === unitOf(e.id);
          return sameUnit ? { ...x, exerciseId: e.id, name: e.name, loadKg: null, unit: undefined } : { ...fresh, uid: x.uid, notes: x.notes };
        }),
      );
    } else {
      changeList((list) => [...list, fresh]);
    }
  }

  function addDay() {
    changeDays((days) => [...days, { key: nextDayKey(days), title: "", focus: [], exercises: [] }]);
    setDay(program!.days.length);
    setOpenEx(null);
  }
  function duplicateDay() {
    changeDays((days) => {
      const copy: WorkoutDay = { ...d, key: nextDayKey(days), focus: [...d.focus], exercises: d.exercises.map((e) => ({ ...e, uid: uid() })) };
      return [...days.slice(0, index + 1), copy, ...days.slice(index + 1)];
    });
    setDay(index + 1);
  }
  function moveDay(dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= program!.days.length) return;
    changeDays((days) => swap(days, index, to));
    setDay(to);
  }
  function deleteDay() {
    changeDays((days) => days.filter((_, i) => i !== index));
    setDay(Math.max(0, index - 1));
    setConfirmDay(false);
  }

  async function save() {
    if (!program) return;
    const name = program.name.trim();
    if (!name) return setMsg({ tone: "error", text: "Dê um nome à ficha antes de salvar." });
    const keys = program.days.map((x) => x.key.trim().toUpperCase());
    if (keys.some((k) => !k)) return setMsg({ tone: "error", text: "Todo treino precisa de uma letra ou nome curto (A, B, Push…)." });
    if (new Set(keys).size !== keys.length) return setMsg({ tone: "error", text: "Dois treinos estão com a mesma letra. Use letras diferentes para cada um." });
    setSaving(true);
    try {
      const clean: Program = {
        ...program,
        name,
        days: program.days.map((x) => ({
          ...x,
          key: x.key.trim(),
          title: x.title.trim(),
          focus: x.exercises.length ? focusOfDay(x) : x.focus,
          exercises: x.exercises.map((e) => ({ ...e, repsMin: Math.min(e.repsMin, e.repsMax), repsMax: Math.max(e.repsMin, e.repsMax), notes: e.notes?.trim() || undefined })),
        })),
        updatedAt: new Date().toISOString(),
      };
      const saved = await repo.saveProgram(clean);
      setProgram(saved);
      setDirty(false);
      setMsg({ tone: "done", text: isCoachEditing ? "Ficha salva. O aluno já vê a versão nova no app." : "Ficha salva." });
      onSaved?.(saved);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo." });
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    await repo.setActiveProgram(program!.ownerId, program!.id);
    setProgram((p) => (p ? { ...p, active: true } : p));
    setMsg({ tone: "done", text: "Esta é a ficha ativa agora." });
  }

  const recent = program.days.flatMap((x) => x.exercises.map((e) => e.exerciseId)).filter((id, i, all) => all.indexOf(id) === i);
  const empty = program.days.every((x) => !x.exercises.length);

  return (
    <div className="space-y-5">
      {backLink}

      <div className="no-print space-y-3">
        <Field label={template ? "Nome do modelo" : "Nome da ficha"}>
          <Input value={program.name} onChange={(e) => change((p) => ({ ...p, name: e.target.value }))} maxLength={60} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Objetivo">
            <Select value={program.goal} onChange={(e) => change((p) => ({ ...p, goal: e.target.value as Goal }))} className="px-2">
              {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABEL[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nível">
            <Select value={program.level} onChange={(e) => change((p) => ({ ...p, level: e.target.value as Level }))} className="px-2">
              {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Validade">
            <Select value={program.durationWeeks ?? 0} onChange={(e) => change((p) => ({ ...p, durationWeeks: Number(e.target.value) || undefined }))} className="px-2">
              <option value={0}>Sem validade</option>
              {[4, 6, 8, 10, 12, 16].map((w) => (
                <option key={w} value={w}>
                  {w} semanas
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-steel">
          {template ? <Badge>Modelo</Badge> : program.active ? <Badge tone="done">Ativa</Badge> : <Badge>Inativa</Badge>}
          <span>{[student ? `Ficha de ${student.name}` : null, getSystem(program.system).name].filter(Boolean).join(" · ")}</span>
          {validity && !template ? <span className={cx("font-semibold", validity.state === "expired" ? "text-plate-red-ink" : "text-iron")}>{validity.label}</span> : null}
          {!program.active && !template ? (
            <button type="button" onClick={activate} className="min-h-9 font-semibold text-iron underline">
              Tornar ativa
            </button>
          ) : null}
        </p>
      </div>

      {msg ? (
        <Alert tone={msg.tone} className="no-print">
          {msg.text}
        </Alert>
      ) : null}

      <div className="no-print -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Treinos da ficha">
        {program.days.map((x, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === index}
            onClick={() => {
              setDay(i);
              setOpenEx(null);
            }}
            className={cx("min-w-14 shrink-0 rounded-[6px] border px-3 py-2 text-left", i === index ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron")}
          >
            <span className="plate-type block max-w-24 truncate text-lg leading-none">{x.key || "?"}</span>
            <span className={cx("num mt-1 block whitespace-nowrap text-xs", i === index ? "text-chalk/70" : "text-steel")}>{x.exercises.length} exerc.</span>
          </button>
        ))}
        {program.days.length < 10 ? (
          <button type="button" onClick={addDay} className="flex shrink-0 items-center gap-1.5 rounded-[6px] border border-dashed border-rule-strong px-3 text-sm font-semibold hover:border-iron">
            <Plus className="size-4" aria-hidden /> Treino
          </button>
        ) : null}
      </div>

      <section className="no-print space-y-3" aria-label={`Treino ${d.key}`}>
        <div className="flex items-end gap-2">
          <Field label="Letra" className="w-20 shrink-0">
            <Input value={d.key} onChange={(e) => patchDay({ key: e.target.value.slice(0, 6) })} aria-label="Letra ou nome curto do treino" className="text-center font-bold uppercase" />
          </Field>
          <Field label="Título do treino" className="min-w-0 flex-1">
            <Input value={d.title} onChange={(e) => patchDay({ title: e.target.value })} maxLength={60} placeholder="Ex.: Peito e tríceps" />
          </Field>
          <IconButton label="Opções deste treino" onClick={() => setDayMenu(true)} className="border border-rule-strong bg-paper">
            <MoreHorizontal className="size-5" />
          </IconButton>
        </div>
        <p className="num text-sm text-steel">
          {d.exercises.length ? `${d.exercises.length} ${d.exercises.length === 1 ? "exercício" : "exercícios"} · cerca de ${estimateDayMinutes(d)} min` : "Nenhum exercício neste treino ainda."}
        </p>

        {d.exercises.length ? (
          <ol className="space-y-2">
            {d.exercises.map((e, i) => {
              const open = openEx === e.uid;
              const unit = unitOf(e.exerciseId, e.unit);
              const labels = UNIT_FIELDS[unit];
              const summary = [fmtScheme(e), e.loadKg ? fmtLoad(e.loadKg) : null, e.restSec ? `desc. ${fmtRest(e.restSec)}` : null, e.technique !== "normal" ? TECHNIQUE_LABEL[e.technique] : null].filter(Boolean).join(" · ");
              return (
                <li key={e.uid} className={cx("rounded-[8px] border bg-paper", open ? "border-iron" : "border-rule")}>
                  <div className="flex items-stretch">
                    <button type="button" onClick={() => setOpenEx(open ? null : e.uid)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pl-3 pr-1 text-left">
                      <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded bg-chalk-2 text-xs font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug">{e.name}</span>
                        <span className="num block text-sm text-steel">{summary}</span>
                        {!open && e.notes ? <span className="block truncate text-xs text-steel">{e.notes}</span> : null}
                      </span>
                      <ChevronDown className={cx("mt-1 size-4 shrink-0 text-steel transition-transform", open && "rotate-180")} aria-hidden />
                    </button>
                    <div className="flex shrink-0 items-center pr-1">
                      <IconButton label={`Subir ${e.name}`} disabled={i === 0} onClick={() => changeList((l) => swap(l, i, i - 1))} className="w-10">
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton label={`Descer ${e.name}`} disabled={i === d.exercises.length - 1} onClick={() => changeList((l) => swap(l, i, i + 1))} className="w-10">
                        <ArrowDown className="size-4" />
                      </IconButton>
                    </div>
                  </div>

                  {open ? (
                    <div className="space-y-3 border-t border-rule px-3 pb-3 pt-3">
                      {getExercise(e.exerciseId)?.cue ? <p className="text-xs text-steel">{getExercise(e.exerciseId)!.cue}</p> : null}
                      <div className="grid grid-cols-3 gap-2">
                        <NumField label="Séries" value={e.sets} min={1} max={20} onCommit={(v) => changeEx(e.uid, { sets: v ?? 1 })} />
                        {unit === "min" ? (
                          <NumField label={labels.single} value={e.repsMax} min={1} max={labels.hi} onCommit={(v) => changeEx(e.uid, { repsMin: v ?? 1, repsMax: v ?? 1 })} className="col-span-2" />
                        ) : (
                          <>
                            <NumField label={labels.min} value={e.repsMin} min={1} max={labels.hi} onCommit={(v, final) => changeEx(e.uid, final ? { repsMin: v ?? 1, repsMax: Math.max(e.repsMax, v ?? 1) } : { repsMin: v ?? 1 })} />
                            <NumField label={labels.max} value={e.repsMax} min={1} max={labels.hi} onCommit={(v, final) => changeEx(e.uid, final ? { repsMax: v ?? 1, repsMin: Math.min(e.repsMin, v ?? 1) } : { repsMax: v ?? 1 })} />
                          </>
                        )}
                        {unit !== "min" ? <NumField label="Carga (kg)" value={e.loadKg ?? null} min={0} max={999} decimal allowEmpty onCommit={(v) => changeEx(e.uid, { loadKg: v || null })} /> : null}
                        <label className="block">
                          <span className="col-head mb-1 block text-steel">Descanso</span>
                          <Select value={e.restSec} onChange={(ev) => changeEx(e.uid, { restSec: Number(ev.target.value) })} className="h-11 px-2 text-sm">
                            {(RESTS.includes(e.restSec) ? RESTS : [...RESTS, e.restSec].sort((a, b) => a - b)).map((r) => (
                              <option key={r} value={r}>
                                {r === 0 ? "Sem" : fmtRest(r)}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="block">
                          <span className="col-head mb-1 block text-steel">Contagem</span>
                          <Select
                            value={unit}
                            onChange={(ev) => {
                              const u = ev.target.value as Unit;
                              const base = u === "reps" ? { repsMin: 8, repsMax: 12 } : u === "seg" ? { repsMin: 30, repsMax: 45 } : { repsMin: 15, repsMax: 15 };
                              changeEx(e.uid, { unit: u, ...base, ...(u === "min" ? { loadKg: null, sets: 1 } : {}) });
                            }}
                            className="h-11 px-2 text-sm"
                          >
                            <option value="reps">Reps</option>
                            <option value="seg">Seg.</option>
                            <option value="min">Min.</option>
                          </Select>
                        </label>
                        <label className={cx("block", unit === "min" ? "col-span-3" : "col-span-3 sm:col-span-1")}>
                          <span className="col-head mb-1 block text-steel">Técnica</span>
                          <Select value={e.technique} onChange={(ev) => changeEx(e.uid, { technique: ev.target.value as Technique })} className="h-11 px-2 text-sm">
                            {(Object.keys(TECHNIQUE_LABEL) as Technique[]).map((t) => (
                              <option key={t} value={t}>
                                {t === "normal" ? "Sem técnica especial" : TECHNIQUE_LABEL[t]}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </div>
                      <label className="block">
                        <span className="col-head mb-1 block text-steel">Observação para o aluno</span>
                        <Input value={e.notes ?? ""} onChange={(ev) => changeEx(e.uid, { notes: ev.target.value || undefined })} placeholder="Cadência, pegada, amplitude, ajuste do banco…" maxLength={160} />
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" variant="secondary" className="px-1" onClick={() => setPicker({ replace: e.uid })}>
                          Trocar
                        </Button>
                        <Button size="sm" variant="secondary" className="px-1" onClick={() => changeList((l) => [...l.slice(0, i + 1), { ...e, uid: uid() }, ...l.slice(i + 1)])}>
                          Duplicar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="px-1"
                          onClick={() => {
                            changeList((l) => l.filter((x) => x.uid !== e.uid));
                            setOpenEx(null);
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        <Button variant={d.exercises.length ? "secondary" : "primary"} className="w-full" onClick={() => setPicker({})} icon={<Plus className="size-4" />}>
          Adicionar exercícios ao treino {d.key}
        </Button>
      </section>

      {volume.length ? (
        <Panel title="Séries por grupo em uma volta da ficha" className="no-print">
          <ul className="flex flex-wrap gap-1.5">
            {volume.map((v) => (
              <li key={v.group} className="num rounded-full border border-rule-strong px-2.5 py-1 text-sm">
                {GROUP_LABEL[v.group]} <span className="font-bold">{v.sets}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-steel">Conta as séries do grupo principal de cada exercício. Multiplique pela frequência semanal de cada treino.</p>
        </Panel>
      ) : null}

      <Field label="Orientações gerais da ficha" className="no-print" hint="Aparecem para o aluno em Hoje e no texto enviado pelo WhatsApp.">
        <Textarea value={program.notes ?? ""} onChange={(e) => change((p) => ({ ...p, notes: e.target.value }))} rows={3} maxLength={800} placeholder="Aquecimento, progressão de carga, cardio, dias de descanso…" />
      </Field>

      <Panel title={student ? `Enviar para ${student.name.split(" ")[0]}` : template ? "Compartilhar modelo" : "Compartilhar ficha"} className="no-print">
        {dirty ? <p className="mb-3 text-sm text-steel">Salve as alterações para compartilhar a versão nova.</p> : empty ? <p className="mb-3 text-sm text-steel">Adicione exercícios antes de enviar.</p> : null}
        <ProgramShare program={program} student={student} canExport={PLANS[plan].export} onPrint={() => window.print()} disabled={dirty || empty} />
      </Panel>

      {/* Versão de impressão: a ficha inteira em papel */}
      <div className="hidden print:block">
        <header className="mb-4 border-b-2 border-iron pb-2">
          <h1 className="plate-type text-2xl">{program.name}</h1>
          <p className="text-sm">
            {[names.studentName && `Aluno: ${names.studentName}`, names.coachName && `Personal: ${names.coachName}`, `Emitida em ${fmtDate(new Date().toISOString(), { day: "2-digit", month: "2-digit", year: "numeric" })}`, program.durationWeeks && `Validade: ${program.durationWeeks} semanas`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>
        <div className="space-y-4">
          {program.days.map((x, i) => (
            <FichaDay key={i} day={x} className="break-inside-avoid" />
          ))}
        </div>
        {program.notes?.trim() ? (
          <div className="mt-4 break-inside-avoid">
            <p className="col-head mb-1">Orientações</p>
            <p className="whitespace-pre-wrap text-sm">{program.notes}</p>
          </div>
        ) : null}
      </div>

      {dirty ? (
        <div className="no-print sticky bottom-20 z-10 flex items-center justify-end gap-3 lg:bottom-4">
          <span className="rounded bg-plate-yellow px-2 py-1 text-sm font-semibold">Alterações não salvas</span>
          <Button size="lg" onClick={save} loading={saving} className="shadow-lift">
            Salvar ficha
          </Button>
        </div>
      ) : null}

      <ExercisePicker
        open={Boolean(picker)}
        onClose={() => setPicker(null)}
        onPick={pick}
        multi={!picker?.replace}
        recent={recent}
        title={picker?.replace ? "Trocar exercício" : `Adicionar ao treino ${d.key}`}
      />

      <ActionSheet
        open={dayMenu}
        onClose={() => setDayMenu(false)}
        title={`Treino ${d.key}`}
        actions={[
          { label: "Duplicar este treino", icon: <Copy className="size-5" />, hint: "Cria uma cópia para você variar os exercícios.", onSelect: duplicateDay, disabled: program.days.length >= 10 },
          { label: "Mover para antes", icon: <MoveLeft className="size-5" />, onSelect: () => moveDay(-1), disabled: index === 0 },
          { label: "Mover para depois", icon: <MoveRight className="size-5" />, onSelect: () => moveDay(1), disabled: index === program.days.length - 1 },
          {
            label: "Excluir este treino",
            icon: <Trash2 className="size-5" />,
            tone: "danger",
            disabled: program.days.length <= 1,
            hint: program.days.length <= 1 ? "A ficha precisa de pelo menos um treino." : undefined,
            onSelect: () => (d.exercises.length ? setConfirmDay(true) : deleteDay()),
          },
        ]}
      />

      <Dialog open={confirmDay} onClose={() => setConfirmDay(false)} title={`Excluir o treino ${d.key}?`}>
        <p className="text-[0.9375rem] text-steel">
          Os {d.exercises.length} exercícios deste treino saem da ficha. Os treinos já registrados pelo aluno continuam no histórico.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmDay(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={deleteDay}>
            Excluir treino
          </Button>
        </div>
      </Dialog>

      <Dialog open={leave} onClose={() => setLeave(false)} title="Sair sem salvar?">
        <p className="text-[0.9375rem] text-steel">Você alterou a ficha e ainda não salvou.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              setDirty(false);
              setLeave(false);
              if (back) router.push(back.href);
            }}
          >
            Sair sem salvar
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              await save();
              setLeave(false);
            }}
          >
            Salvar ficha
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const copy = [...list];
  [copy[a], copy[b]] = [copy[b]!, copy[a]!];
  return copy;
}

const show = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

/**
 * Campo numérico que deixa apagar e digitar à vontade: guarda o texto localmente e só
 * confirma valores válidos; ao sair do campo, ajusta para a faixa permitida.
 */
function NumField({
  label,
  value,
  onCommit,
  min,
  max,
  decimal,
  allowEmpty,
  className,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null, final: boolean) => void;
  min: number;
  max: number;
  decimal?: boolean;
  allowEmpty?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
  }, [value, focused]);

  const parse = (raw: string): number | null => {
    if (!raw.trim()) return null;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return decimal ? Math.round(n * 100) / 100 : Math.round(n);
  };

  return (
    <label className={cx("block", className)}>
      <span className="col-head mb-1 block text-steel">{label}</span>
      <Input
        inputMode={decimal ? "decimal" : "numeric"}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, "").slice(0, 6);
          setText(raw);
          const n = parse(raw);
          if (n === null) {
            if (allowEmpty) onCommit(null, false);
          } else if (n >= min && n <= max) onCommit(n, false);
        }}
        onBlur={() => {
          setFocused(false);
          const n = parse(text);
          if (n === null) onCommit(allowEmpty ? null : value ?? min, true);
          else onCommit(Math.min(max, Math.max(min, n)), true);
        }}
        className="num h-11 px-2 text-center font-bold"
      />
    </label>
  );
}
