"use client";

import { useId, type ReactNode, type Ref } from "react";
import { Pencil } from "lucide-react";
import { Button, Panel, cx } from "@/components/ui";
import {
  MACRO_LABEL,
  MACRO_ORDER,
  comparePlan,
  diffSrText,
  fmtDiff,
  fmtInt,
  fmtMacro,
  metasOnlyText,
  originLine,
  planSummary,
  targetsSourceLine,
  type DietOrigin,
  type MacroKey,
} from "@/lib/domain/diet-plan";
import { dietItemText, macroLine } from "@/lib/domain/diet-share";
import { fmtDayMonth } from "@/lib/domain/format";
import { dietTotals, sumItems } from "@/lib/domain/nutrition";
import type { DietPlan, MacroTargets, Meal } from "@/lib/domain/types";

/**
 * Peças de leitura da Dieta (U3). Todo número de dieta fica dentro de `data-area="dieta-numeros"` e só usa
 * iron/steel: acima ou abaixo da meta aparecem pelo sinal e pela palavra, nunca pela cor (U3 R11).
 */

/** Valor da tabela: calorias sem unidade (o cabeçalho diz "kcal"), gramas com " g". */
const cellValue = (key: MacroKey, v: number) => (key === "kcal" ? fmtInt(v) : fmtMacro(key, v));

/**
 * As 4 metas do dia, sem barras. `compact` (card do Hoje): rótulo visível "Metas do dia" e cada par com
 * `dt` antes de `dd` ("Metas do dia, kcal, 1.650"). `sourceLine`: quem definiu ("Definidas por Rafael.").
 */
export function TargetsList({ targets, sourceLine, compact, className }: { targets: MacroTargets; sourceLine?: string | null; compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <div data-area="dieta-numeros" className={className}>
        <p className="text-xs font-semibold text-steel">Metas do dia</p>
        <dl className="mt-1.5 grid grid-cols-4 gap-2 text-center">
          {MACRO_ORDER.map((k) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-steel">{MACRO_LABEL[k].compact}</dt>
              <dd className="num plate-type text-xl text-iron">
                {fmtInt(targets[k])}
                {MACRO_LABEL[k].unit === "g" ? <span className="text-xs font-semibold text-steel"> g</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return (
    <div data-area="dieta-numeros" className={className}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {MACRO_ORDER.map((k) => (
          <div key={k} className="min-w-0">
            <dt className="text-sm font-semibold text-steel">{MACRO_LABEL[k].long}</dt>
            <dd className="num plate-type mt-0.5 text-2xl text-iron">
              {fmtInt(targets[k])}
              <span className="text-sm font-semibold text-steel"> {MACRO_LABEL[k].unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      {sourceLine ? <p className="mt-3 text-sm text-steel">{sourceLine}</p> : null}
    </div>
  );
}

function RowHead({ children }: { children: ReactNode }) {
  return (
    <th scope="row" className="whitespace-nowrap py-1.5 pr-1 text-left font-bold">
      {children}
    </th>
  );
}

/**
 * Painel "Metas do dia" da edição (personal sempre; aluno ao editar): tabela Metas do dia / Cardápio /
 * Diferença, com o resumo da comparação na legenda. `totals` null = cardápio sem itens (só a linha das metas).
 * `lockedNote` troca "Editar metas" por uma nota (metas do personal no ajuste do aluno).
 */
export function PlanVsTargets({
  targets,
  totals,
  editTargets,
  lockedNote,
  tdeeLine,
  className,
}: {
  targets: MacroTargets;
  totals: MacroTargets | null;
  editTargets?: () => void;
  lockedNote?: string;
  tdeeLine?: string | null;
  className?: string;
}) {
  const cmp = totals ? comparePlan(targets, totals) : null;
  const cell = "whitespace-nowrap py-1.5 pl-1.5 text-right";
  return (
    <Panel
      title="Metas do dia"
      className={className}
      action={
        editTargets && !lockedNote ? (
          <button type="button" onClick={editTargets} className="-my-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline">
            <Pencil className="size-3.5" aria-hidden /> Editar metas
          </button>
        ) : undefined
      }
    >
      <div data-area="dieta-numeros">
        <table className="num w-full border-collapse text-[0.8125rem] text-iron">
          <caption className="caption-top pb-2 text-left text-sm text-iron">{planSummary(cmp)}</caption>
          <thead>
            <tr>
              <td />
              {MACRO_ORDER.map((k) => (
                <th key={k} scope="col" className={cx(cell, "text-xs font-semibold text-steel")}>
                  {MACRO_LABEL[k].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-rule">
              <RowHead>Metas do dia</RowHead>
              {MACRO_ORDER.map((k) => (
                <td key={k} className={cx(cell, "text-[0.9375rem] font-extrabold")}>
                  {cellValue(k, targets[k])}
                </td>
              ))}
            </tr>
            {cmp ? (
              <>
                <tr className="border-t border-rule">
                  <RowHead>Cardápio</RowHead>
                  {cmp.map((c) => (
                    <td key={c.key} className={cell}>
                      {cellValue(c.key, c.plan)}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-rule">
                  <RowHead>Diferença</RowHead>
                  {cmp.map((c) => {
                    const sr = diffSrText(c.status);
                    return (
                      <td key={c.key} className={cell} data-status={c.status}>
                        {fmtDiff(c)}
                        {sr && c.key !== "kcal" ? " g" : ""}
                        {sr ? <span className="sr-only"> {sr}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              </>
            ) : null}
          </tbody>
        </table>
        {lockedNote ? <p className="mt-3 text-sm text-steel">{lockedNote}</p> : null}
        {tdeeLine ? <p className="mt-3 text-xs text-steel">{tdeeLine}</p> : null}
      </div>
    </Panel>
  );
}

/** "Orientações de Rafael" | "Orientações do personal" | "Suas orientações". */
function notesTitle(origin: DietOrigin): string {
  if (origin.kind === "proprio") return "Suas orientações";
  return origin.coachFirstName ? `Orientações de ${origin.coachFirstName}` : "Orientações do personal";
}

/** Orientações só para leitura (some quando vazias). Também usado no ajuste, onde elas não são editáveis (R4). */
export function NotesRead({ notes, origin, className }: { notes?: string; origin: DietOrigin; className?: string }) {
  const id = useId();
  if (!notes?.trim()) return null;
  return (
    <section aria-labelledby={id} className={className}>
      <h3 id={id} className="text-[0.9375rem] font-bold">
        {notesTitle(origin)}
      </h3>
      <p className="mt-1 whitespace-pre-wrap text-[0.9375rem] text-iron">{notes.trim()}</p>
    </section>
  );
}

/** Uma refeição só para leitura: nome em h3, horário em <time>, itens com gramas e medida caseira e o subtotal. */
function MealRead({ meal }: { meal: Meal }) {
  const id = useId();
  const t = sumItems(meal.items);
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-[8px] border border-rule bg-paper">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule bg-chalk px-4 py-2.5">
        <h3 id={id} className="min-w-0 text-base font-bold">
          {meal.name.trim() || "Refeição"}
        </h3>
        {meal.time ? (
          <time dateTime={meal.time} className="num shrink-0 text-sm text-steel">
            {meal.time}
          </time>
        ) : null}
      </div>
      <ul className="ruled">
        {meal.items.map((i) => (
          <li key={i.uid} className="px-4 py-2 text-[0.9375rem]">
            {dietItemText(i)}
          </li>
        ))}
      </ul>
      <p className="num border-t border-rule px-4 py-2 text-sm text-steel">
        {fmtInt(t.kcal)} kcal · {fmtInt(t.proteinG)} g de proteína
      </p>
    </section>
  );
}

/**
 * Dieta só para leitura no aparelho de quem segue o plano (U3b, estados `leitura` e `leitura_metas`): as metas do
 * dia, o cardápio com a origem, o total em uma linha (sem comparação com as metas: no plano do personal, isso seria
 * o app avaliando a prescrição) e as orientações. O botão "Ajustar cardápio" (plano do personal) ou "Editar dieta"
 * (próprio) só aparece com `canAdjust`. Nenhum campo editável: a sequência de Tab passa só pelo botão.
 */
export function DietRead({
  diet,
  origin,
  screen,
  canAdjust,
  onAdjust,
  adjustButtonRef,
}: {
  diet: DietPlan;
  origin: DietOrigin;
  screen: "leitura" | "leitura_metas";
  canAdjust: boolean;
  onAdjust: () => void;
  adjustButtonRef?: Ref<HTMLButtonElement>;
}) {
  const headId = useId();
  const meals = diet.meals.filter((m) => m.items.length);
  return (
    <>
      <Panel title="Metas do dia">
        <TargetsList targets={diet.targets} sourceLine={targetsSourceLine(origin)} />
      </Panel>

      <section id="cardapio" aria-labelledby={headId} className="space-y-3">
        <div>
          <h2 id={headId} className="text-lg font-bold">
            Cardápio do dia
          </h2>
          <p className="text-sm text-steel">{originLine(origin, fmtDayMonth)}</p>
        </div>
        <div data-area="dieta-numeros" className="space-y-3">
          {screen === "leitura" ? (
            <>
              {meals.map((m) => (
                <MealRead key={m.uid} meal={m} />
              ))}
              <p className="num text-[0.9375rem] text-iron">
                <span className="font-bold">Total do cardápio:</span> {macroLine(dietTotals(diet))}
              </p>
            </>
          ) : (
            <p className="text-[0.9375rem] text-steel">{metasOnlyText(diet)}</p>
          )}
        </div>
        <NotesRead notes={diet.notes} origin={origin} />
        {canAdjust ? (
          <Button ref={adjustButtonRef} variant="secondary" icon={<Pencil className="size-4" />} onClick={onAdjust} className="w-full sm:w-auto">
            {origin.kind === "personal" ? "Ajustar cardápio" : "Editar dieta"}
          </Button>
        ) : null}
      </section>
    </>
  );
}
