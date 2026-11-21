import { GROUP_LABEL } from "@/lib/domain/exercises";
import { fmtLoad, fmtRest, fmtScheme } from "@/lib/domain/format";
import { estimateDayMinutes } from "@/lib/domain/generator";
import { techniqueText } from "@/lib/domain/program-share";
import type { WorkoutDay } from "@/lib/domain/types";
import { cx } from "@/lib/cx";

/** Um dia da ficha no formato de folha: cabeçalho escuro, colunas, pauta fina. */
export function FichaDay({ day, compact, className }: { day: WorkoutDay; compact?: boolean; className?: string }) {
  const meta = [`${day.exercises.length} ${day.exercises.length === 1 ? "exercício" : "exercícios"}`, day.exercises.length ? `~${estimateDayMinutes(day)} min` : null, day.focus.map((g) => GROUP_LABEL[g]).join(", ") || null].filter(Boolean);
  return (
    <div className={cx("ficha-day overflow-hidden rounded-[8px] border border-rule-strong bg-paper", className)}>
      <div className="flex items-center gap-3 bg-iron px-4 py-3 text-chalk">
        <span className="plate-type grid h-11 min-w-11 shrink-0 place-items-center rounded bg-plate-red px-2 text-xl text-white">{day.key}</span>
        <div className="min-w-0">
          <p className="truncate font-bold">{day.title || `Treino ${day.key}`}</p>
          <p className="truncate text-xs text-chalk/65">{meta.join(" · ")}</p>
        </div>
      </div>
      {day.exercises.length ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_3.75rem] gap-x-3 border-b border-rule bg-chalk px-4 py-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_4rem] sm:gap-x-4">
            <span className="col-head text-steel">Exercício</span>
            <span className="col-head text-steel">Séries</span>
            <span className="col-head text-right text-steel">Carga</span>
            <span className="col-head hidden text-right text-steel sm:block">Desc.</span>
          </div>
          <ol className="ruled">
            {day.exercises.map((e, i) => (
              <li key={e.uid} className="grid grid-cols-[minmax(0,1fr)_auto_3.75rem] items-start gap-x-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_4rem] sm:gap-x-4">
                <div className="min-w-0">
                  <p className={cx("text-[0.9375rem] font-semibold", compact && "truncate")}>
                    <span className="num mr-2 text-steel">{i + 1}</span>
                    {e.name}
                  </p>
                  {!compact && (e.technique !== "normal" || e.notes) ? (
                    <p className="mt-0.5 text-xs text-steel">
                      {e.technique !== "normal" ? <span className="font-semibold text-plate-red-ink">{techniqueText(day.exercises, i)}{e.notes ? ". " : ""}</span> : null}
                      {e.notes}
                    </p>
                  ) : null}
                  {!compact && e.restSec ? <p className="num mt-0.5 text-xs text-steel sm:hidden">descanso {fmtRest(e.restSec)}</p> : null}
                </div>
                <span className="num whitespace-nowrap text-sm font-semibold">{fmtScheme(e)}</span>
                <span className="num whitespace-nowrap text-right text-sm font-bold">{fmtLoad(e.loadKg)}</span>
                <span className="num hidden text-right text-sm text-steel sm:block">{fmtRest(e.restSec)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="px-4 py-4 text-sm text-steel">Nenhum exercício neste treino ainda.</p>
      )}
    </div>
  );
}
