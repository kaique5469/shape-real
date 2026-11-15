"use client";

import { GROUP_LABEL } from "@/lib/domain/exercises";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { SYSTEMS, suggestSystem } from "@/lib/domain/systems";
import type { Equipment, Goal, Level, MuscleGroup, SystemId } from "@/lib/domain/types";
import { Field, Segmented, Textarea, cx } from "./ui";

export interface TrainingPrefs {
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: Equipment;
  system: SystemId;
  limitations: string;
  emphasis: MuscleGroup[];
}

const GOAL_HINT: Record<Goal, string> = {
  hipertrofia: "Ganhar massa muscular",
  forca: "Levantar mais peso",
  emagrecimento: "Perder gordura mantendo músculo",
  condicionamento: "Fôlego e resistência",
  saude: "Treinar com constância e sem dor",
};

export function GoalPicker({ value, onChange }: { value: Goal; onChange: (g: Goal) => void }) {
  return (
    <Segmented
      label="Objetivo"
      value={value}
      onChange={onChange}
      className="grid grid-cols-1 sm:grid-cols-2"
      options={(Object.keys(GOAL_LABEL) as Goal[]).map((g) => ({ value: g, label: GOAL_LABEL[g], hint: GOAL_HINT[g] }))}
    />
  );
}

export function RoutinePicker({ prefs, set }: { prefs: TrainingPrefs; set: (p: Partial<TrainingPrefs>) => void }) {
  return (
    <div className="space-y-5">
      <Field label="Há quanto tempo você treina?">
        <Segmented
          label="Nível"
          value={prefs.level}
          onChange={(level) => set({ level, system: suggestSystem(prefs.daysPerWeek, level) })}
          options={[
            { value: "iniciante", label: LEVEL_LABEL.iniciante, hint: "Menos de 6 meses" },
            { value: "intermediario", label: LEVEL_LABEL.intermediario, hint: "6 meses a 2 anos" },
            { value: "avancado", label: LEVEL_LABEL.avancado, hint: "Mais de 2 anos" },
          ]}
        />
      </Field>
      <Field label="Quantos dias por semana?">
        <Segmented
          label="Dias por semana"
          value={prefs.daysPerWeek}
          onChange={(d) => set({ daysPerWeek: d, system: suggestSystem(d, prefs.level) })}
          options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: `${d}x` }))}
        />
      </Field>
      <Field label="Quanto tempo por treino?">
        <Segmented label="Minutos por treino" value={prefs.sessionMinutes} onChange={(m) => set({ sessionMinutes: m })} options={[30, 45, 60, 75, 90].map((m) => ({ value: m, label: `${m} min` }))} />
      </Field>
      <Field label="Onde você treina?">
        <Segmented
          label="Equipamento"
          value={prefs.equipment}
          onChange={(equipment) => set({ equipment })}
          options={[
            { value: "academia", label: "Academia", hint: "Máquinas, barras e halteres" },
            { value: "home", label: "Em casa", hint: "Halteres e elástico" },
            { value: "peso_corporal", label: "Sem equipamento", hint: "Só peso do corpo" },
          ]}
        />
      </Field>
    </div>
  );
}

export function SystemChooser({ prefs, set }: { prefs: TrainingPrefs; set: (p: Partial<TrainingPrefs>) => void }) {
  const suggested = suggestSystem(prefs.daysPerWeek, prefs.level);
  return (
    <div role="radiogroup" aria-label="Sistema de treino" className="grid gap-2 sm:grid-cols-2">
      {SYSTEMS.map((s) => {
        const active = s.id === prefs.system;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => set({ system: s.id })}
            className={cx("rounded-[8px] border p-3 text-left transition-colors", active ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron")}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="plate-type text-lg">{s.short}</span>
              {s.id === suggested ? <span className={cx("rounded px-1.5 py-0.5 text-[0.6875rem] font-bold", active ? "bg-plate-red text-white" : "bg-plate-red/10 text-plate-red-ink")}>Sugerido</span> : null}
            </span>
            <span className={cx("mt-1 block text-[0.8125rem]", active ? "text-chalk/75" : "text-steel")}>{s.bestFor}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LimitsPicker({ prefs, set }: { prefs: TrainingPrefs; set: (p: Partial<TrainingPrefs>) => void }) {
  const groups: MuscleGroup[] = ["peito", "costas", "ombros", "biceps", "triceps", "quadriceps", "posteriores", "gluteos", "abdomen"];
  return (
    <div className="space-y-5">
      <Field label="Algum músculo que você quer priorizar? (até 3)">
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const on = prefs.emphasis.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => set({ emphasis: on ? prefs.emphasis.filter((x) => x !== g) : [...prefs.emphasis, g].slice(-3) })}
                className={cx("rounded-full border px-3 py-1.5 text-sm font-semibold", on ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron")}
              >
                {GROUP_LABEL[g]}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Dor, lesão ou limitação?" hint="Ex.: “dor no joelho ao agachar”, “hérnia lombar”. A ficha evita exercícios que carregam a região.">
        <Textarea value={prefs.limitations} onChange={(e) => set({ limitations: e.target.value })} rows={2} className="min-h-20" placeholder="Deixe em branco se não tiver" />
      </Field>
    </div>
  );
}
