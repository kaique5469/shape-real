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
  /** O usuário escolheu o sistema à mão: a sugestão automática não sobrescreve mais. */
  systemTouched?: boolean;
}

/** Sistema sugerido para as respostas atuais (frequência, nível, prioridades, equipamento e objetivo). */
export function suggestFor(p: Pick<TrainingPrefs, "daysPerWeek" | "level" | "emphasis" | "equipment" | "goal">): SystemId {
  return suggestSystem(p.daysPerWeek, p.level, { emphasis: p.emphasis, equipment: p.equipment, goal: p.goal });
}

/** Aplica a mudança e, se o sistema ainda é o sugerido, atualiza a sugestão. */
export function withSuggestion(prefs: TrainingPrefs, patch: Partial<TrainingPrefs>): TrainingPrefs {
  const next = { ...prefs, ...patch };
  return next.systemTouched || patch.system ? next : { ...next, system: suggestFor(next) };
}

const GOAL_HINT: Record<Goal, string> = {
  hipertrofia: "Ganhar massa muscular",
  forca: "Levantar mais peso",
  emagrecimento: "Perder gordura mantendo músculo",
  condicionamento: "Fôlego e resistência",
  saude: "Treinar com constância e sem dor",
};

export function GoalPicker({ value, onChange }: { value: Goal; onChange: (g: Goal) => void }) {
  // Objetivo muda a sugestão de sistema: quem chama usa withSuggestion.
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
      <Field group label="Há quanto tempo treina?">
        <Segmented
          label="Nível"
          value={prefs.level}
          onChange={(level) => set({ level })}
          options={[
            { value: "iniciante", label: LEVEL_LABEL.iniciante, hint: "Menos de 6 meses" },
            { value: "intermediario", label: LEVEL_LABEL.intermediario, hint: "6 meses a 2 anos" },
            { value: "avancado", label: LEVEL_LABEL.avancado, hint: "Mais de 2 anos" },
          ]}
        />
      </Field>
      <Field group label="Quantos dias por semana?">
        <Segmented
          label="Dias por semana"
          value={prefs.daysPerWeek}
          onChange={(d) => set({ daysPerWeek: d })}
          options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: `${d}x` }))}
        />
      </Field>
      <Field group label="Quanto tempo por treino?">
        <Segmented label="Minutos por treino" value={prefs.sessionMinutes} onChange={(m) => set({ sessionMinutes: m })} options={[30, 45, 60, 75, 90].map((m) => ({ value: m, label: `${m} min` }))} />
      </Field>
      <Field group label="Onde treina?">
        <Segmented
          label="Equipamento"
          value={prefs.equipment}
          onChange={(equipment) => set({ equipment })}
          options={[
            { value: "academia", label: "Academia", hint: "Máquinas, barras e halteres" },
            { value: "home", label: "Em casa", hint: "Halteres, elástico e caneleira" },
            { value: "peso_corporal", label: "Sem equipamento", hint: "Só peso do corpo" },
          ]}
        />
      </Field>
    </div>
  );
}

export function SystemChooser({ prefs, set }: { prefs: TrainingPrefs; set: (p: Partial<TrainingPrefs>) => void }) {
  const suggested = suggestFor(prefs);
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
            onClick={() => set({ system: s.id, systemTouched: true })}
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
  const groups: MuscleGroup[] = ["peito", "costas", "ombros", "biceps", "triceps", "quadriceps", "posteriores", "gluteos", "panturrilhas", "adutores", "abdomen"];
  return (
    <div className="space-y-5">
      <Field group label="Algum músculo para priorizar? (até 3)">
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const on = prefs.emphasis.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => set({ emphasis: on ? prefs.emphasis.filter((x) => x !== g) : [...prefs.emphasis, g].slice(-3) })}
                className={cx("h-10 rounded-full border px-3.5 text-sm font-semibold", on ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron")}
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
