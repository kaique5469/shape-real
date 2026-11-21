"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, Trash2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { GROUP_LABEL, UNIT_LABEL, getExercise, normalize, searchExercises } from "@/lib/domain/exercises";
import { uid } from "@/lib/domain/ids";
import { track } from "@/lib/analytics";
import type { Exercise, Implement, MuscleGroup, Unit } from "@/lib/domain/types";
import { Alert, Button, Dialog, Field, Input, Segmented, Select, cx } from "./ui";

export const IMPLEMENT_LABEL: Record<Implement, string> = {
  barra: "Barra",
  halter: "Halteres",
  maquina: "Máquina",
  cabo: "Polia",
  smith: "Smith",
  peso_corporal: "Peso do corpo",
  kettlebell: "Kettlebell",
  elastico: "Elástico",
  caneleira: "Caneleira",
  acessorio: "Acessório",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (e: Exercise) => void;
  title?: string;
  /** Mantém aberto para adicionar vários exercícios em sequência. */
  multi?: boolean;
  /** Ids já usados na ficha: aparecem primeiro quando a busca está vazia. */
  recent?: string[];
}

export function ExercisePicker({ open, onClose, onPick, title = "Adicionar exercício", multi = false, recent }: Props) {
  const { user, repo, refreshCustom, customVersion } = useApp();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Exercícios criados por quem está usando agora. Em "ver como aluno" o cadastro também traz os do
  // personal, que o aluno pode usar mas não pode excluir.
  const [mine, setMine] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    repo
      .listCustomExercises(user.id)
      .then((own) => alive && setMine(new Set(own.map((e) => e.id))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, user, repo, customVersion]);

  useEffect(() => {
    if (open) {
      setQ("");
      setGroup(null);
      setCreating(false);
      setAdded([]);
      setConfirmDel(null);
      setErr(null);
    }
  }, [open]);

  const list = useMemo(() => {
    const found = searchExercises(q, group);
    if (q.trim() || group || !recent?.length) return found;
    const first = recent.map((id) => getExercise(id)).filter((e): e is Exercise => Boolean(e));
    const ids = new Set(first.map((e) => e.id));
    return [...first, ...found.filter((e) => !ids.has(e.id))];
    // customVersion: a lista muda quando um exercício próprio é criado ou excluído
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, group, recent, customVersion]);

  const exact = list.some((e) => normalize(e.name) === normalize(q));

  function choose(e: Exercise) {
    onPick(e);
    if (multi) setAdded((a) => [...a, e.id]);
    else onClose();
  }

  async function removeCustom(id: string) {
    if (!user) return;
    setErr(null);
    try {
      await repo.deleteCustomExercise(user.id, id);
      await refreshCustom();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível excluir o exercício.");
    } finally {
      setConfirmDel(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={creating ? "Criar exercício" : title} wide>
      {creating ? (
        <CreateExercise
          initialName={q.trim()}
          initialGroup={group}
          onCancel={() => setCreating(false)}
          onCreated={(e) => {
            setCreating(false);
            setQ("");
            choose(e);
          }}
        />
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" aria-hidden />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: supino, remada, agachamento…" className="pl-9" aria-label="Buscar exercício" />
          </div>
          <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1">
            {[null, ...(Object.keys(GROUP_LABEL) as MuscleGroup[])].map((g) => (
              <button
                key={g ?? "all"}
                type="button"
                onClick={() => setGroup(g)}
                aria-pressed={group === g}
                className={cx("h-9 shrink-0 rounded-full border px-3 text-sm font-semibold", group === g ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper")}
              >
                {g ? GROUP_LABEL[g] : "Todos"}
              </button>
            ))}
          </div>
          {err ? (
            <Alert tone="error" className="mt-3">
              {err}
            </Alert>
          ) : null}
          <ul className="ruled mt-3 rounded-[8px] border border-rule">
            {list.map((e) => {
              const count = added.filter((id) => id === e.id).length;
              return (
                <li key={e.id} className="flex items-stretch">
                  <button type="button" onClick={() => choose(e)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-chalk">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {e.name}
                        {e.custom ? <span className="ml-2 rounded bg-plate-blue/10 px-1.5 py-0.5 text-[0.6875rem] font-bold text-plate-blue-ink">{mine.has(e.id) ? "seu" : "do personal"}</span> : null}
                      </span>
                      <span className="block text-xs text-steel">
                        {GROUP_LABEL[e.group]} · {IMPLEMENT_LABEL[e.implement]}
                        {e.unit && e.unit !== "reps" ? ` · por ${UNIT_LABEL[e.unit].noun}` : ""}
                      </span>
                    </span>
                    {count ? (
                      <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-plate-green-ink">
                        <Check className="size-4" aria-hidden /> {count > 1 ? `${count}×` : "adicionado"}
                      </span>
                    ) : null}
                  </button>
                  {e.custom && mine.has(e.id) ? (
                    confirmDel === e.id ? (
                      <span className="flex shrink-0 items-center gap-1 pr-2">
                        <Button size="sm" variant="danger" onClick={() => removeCustom(e.id)}>
                          Excluir
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDel(null)}>
                          Não
                        </Button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmDel(e.id)} aria-label={`Excluir exercício ${e.name}`} className="grid w-11 shrink-0 place-items-center text-plate-red-ink hover:bg-chalk">
                        <Trash2 className="size-4" />
                      </button>
                    )
                  ) : null}
                </li>
              );
            })}
            {!list.length ? <li className="px-3 py-4 text-sm text-steel">Nenhum exercício encontrado{q.trim() ? ` para “${q.trim()}”` : ""}. Crie o seu abaixo.</li> : null}
          </ul>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-3 flex min-h-12 w-full items-center gap-2 rounded-[8px] border border-dashed border-rule-strong px-3 py-2 text-left font-semibold hover:border-iron"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{q.trim() && !exact ? `Criar exercício “${q.trim()}”` : "Criar exercício novo"}</span>
          </button>
          {multi ? (
            <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 flex items-center justify-between gap-3 border-t border-rule bg-paper px-5 py-3">
              <span className="text-sm text-steel">{added.length ? `${added.length} ${added.length === 1 ? "exercício adicionado" : "exercícios adicionados"}` : "Toque para adicionar vários em sequência."}</span>
              <Button onClick={onClose}>Concluir</Button>
            </div>
          ) : null}
        </>
      )}
    </Dialog>
  );
}

function CreateExercise({ initialName, initialGroup, onCancel, onCreated }: { initialName: string; initialGroup: MuscleGroup | null; onCancel: () => void; onCreated: (e: Exercise) => void }) {
  const { user, repo, refreshCustom } = useApp();
  const [name, setName] = useState(initialName ? initialName[0]!.toUpperCase() + initialName.slice(1) : "");
  const [group, setGroup] = useState<MuscleGroup>(initialGroup ?? "peito");
  const [implement, setImplement] = useState<Implement>("maquina");
  const [unit, setUnit] = useState<Unit>("reps");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 3) return setErr("Dê um nome ao exercício (pelo menos 3 letras).");
    if (searchExercises(clean).some((e) => normalize(e.name) === normalize(clean))) return setErr("Já existe um exercício com esse nome. Volte e busque por ele.");
    if (!user) return;
    setSaving(true);
    setErr(null);
    try {
      const cardio = group === "cardio";
      const exercise: Exercise = {
        id: `custom_${uid()}`,
        name: clean,
        group,
        implement,
        pattern: cardio ? "cardio" : group === "abdomen" ? "core" : "isolado",
        compound: false,
        home: implement === "peso_corporal" || implement === "halter" || implement === "elastico" || implement === "caneleira" || implement === "kettlebell",
        unit: unit === "reps" ? undefined : unit,
        custom: true,
      };
      const saved = await repo.saveCustomExercise(user.id, exercise);
      await refreshCustom();
      track("custom_exercise_created", { group, unit });
      onCreated(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar o exercício.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome do exercício">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} placeholder="Ex.: Remada na máquina articulada" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Grupo muscular">
          <Select value={group} onChange={(e) => {
            const g = e.target.value as MuscleGroup;
            setGroup(g);
            if (g === "cardio") setUnit("min");
          }}>
            {(Object.keys(GROUP_LABEL) as MuscleGroup[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Equipamento">
          <Select value={implement} onChange={(e) => setImplement(e.target.value as Implement)}>
            {(Object.keys(IMPLEMENT_LABEL) as Implement[]).map((i) => (
              <option key={i} value={i}>
                {IMPLEMENT_LABEL[i]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field group label="Como a série é contada">
        <Segmented
          label="Unidade"
          value={unit}
          onChange={setUnit}
          size="sm"
          options={[
            { value: "reps", label: "Repetições" },
            { value: "seg", label: "Segundos" },
            { value: "min", label: "Minutos" },
          ]}
        />
      </Field>
      {err ? <Alert tone="error">{err}</Alert> : null}
      <p className="text-sm text-steel">O exercício fica salvo na sua lista e pode ser usado em qualquer ficha.</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Voltar para a busca
        </Button>
        <Button type="submit" loading={saving}>
          Criar e adicionar
        </Button>
      </div>
    </form>
  );
}
