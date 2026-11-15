import { getExercise, GROUP_LABEL } from "@/lib/domain/exercises";
import { TECHNIQUE_LABEL, estimateDayMinutes } from "@/lib/domain/generator";
import type { WorkoutDay } from "@/lib/domain/types";
import { cx } from "@/lib/cx";

const kg = (v?: number | null) => (v ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—");
const rest = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`);

/** Um dia da ficha no formato de folha: cabeçalho escuro, colunas, pauta fina. */
export function FichaDay({ day, compact, className }: { day: WorkoutDay; compact?: boolean; className?: string }) {
  return (
    <div className={cx("overflow-hidden rounded-[8px] border border-rule-strong bg-paper", className)}>
      <div className="flex items-center gap-4 bg-iron px-4 py-3 text-chalk">
        <span className="plate-type grid h-11 min-w-11 place-items-center rounded bg-plate-red px-2 text-xl text-white">{day.key}</span>
        <div className="min-w-0">
          <p className="truncate font-bold">{day.title}</p>
          <p className="text-xs text-chalk/65">
            {day.exercises.length} exercícios · ~{estimateDayMinutes(day)} min · {day.focus.map((g) => GROUP_LABEL[g]).join(", ")}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b border-rule bg-chalk px-4 py-2 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem_4rem]">
        <span className="col-head text-steel">Exercício</span>
        <span className="col-head text-steel">Séries × reps</span>
        <span className="col-head text-right text-steel">Carga</span>
        <span className="col-head hidden text-right text-steel sm:block">Desc.</span>
      </div>
      <ol className="ruled">
        {day.exercises.map((e, i) => (
          <li key={e.uid} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem_4rem]">
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-semibold">
                <span className="num mr-2 text-steel">{i + 1}</span>
                {e.name}
              </p>
              {!compact && (e.technique !== "normal" || e.notes) ? (
                <p className="truncate text-xs text-steel">
                  {e.technique !== "normal" ? <span className="font-semibold text-plate-red-ink">{TECHNIQUE_LABEL[e.technique]}. </span> : null}
                  {e.notes ?? getExercise(e.exerciseId)?.cue}
                </p>
              ) : null}
            </div>
            <span className="num text-sm font-semibold">
              {e.sets} × {e.repsMin === e.repsMax ? e.repsMin : `${e.repsMin}–${e.repsMax}`}
            </span>
            <span className="num text-right text-sm font-bold">{kg(e.loadKg)}</span>
            <span className="num hidden text-right text-sm text-steel sm:block">{rest(e.restSec)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
