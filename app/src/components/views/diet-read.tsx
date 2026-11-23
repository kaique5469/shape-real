"use client";

import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Panel, cx } from "@/components/ui";
import { MACRO_LABEL, MACRO_ORDER, comparePlan, diffSrText, fmtDiff, fmtInt, fmtMacro, planSummary, type MacroKey } from "@/lib/domain/diet-plan";
import type { MacroTargets } from "@/lib/domain/types";

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
