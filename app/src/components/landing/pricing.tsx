"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PLANS, brl, type PlanDef } from "@/lib/domain/plans";
import { LinkButton, Segmented, cx } from "@/components/ui";
import { track } from "@/lib/analytics";

/**
 * Rótulo honesto do plano anual (rodada 3, R3-9), sem mudar preço: "2 meses grátis" só quando o anual é exatamente
 * 10 mensalidades (hoje, o Personal); senão a economia em reais ("economia de R$ 89,80", hoje o Pro). Conta em
 * centavos (nada de 19,9 × 12 = 238,79999…). null sem anual, sem economia ou no plano grátis.
 */
export function rotuloAnual(p: Pick<PlanDef, "priceMonthly" | "priceYearly">): string | null {
  if (!p.priceYearly || p.priceMonthly <= 0) return null;
  const mensal = Math.round(p.priceMonthly * 100);
  const economia = 12 * mensal - Math.round(p.priceYearly * 100);
  if (economia <= 0) return null;
  if (economia % mensal === 0) {
    const meses = economia / mensal;
    return meses === 1 ? "1 mês grátis" : `${meses} meses grátis`;
  }
  return `economia de ${brl(economia / 100)}`;
}

export function Pricing() {
  const [yearly, setYearly] = useState(true);
  const plans = [PLANS.free, PLANS.pro, PLANS.coach];
  return (
    <div>
      <Segmented
        label="Cobrança"
        value={yearly ? "ano" : "mes"}
        onChange={(v) => setYearly(v === "ano")}
        options={[
          { value: "mes", label: "Mensal" },
          { value: "ano", label: "Anual" },
        ]}
        size="sm"
      />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const featured = p.id === "pro";
          const monthly = yearly && p.priceYearly ? p.priceYearly / 12 : p.priceMonthly;
          const anual = yearly ? rotuloAnual(p) : null;
          return (
            <div key={p.id} className={cx("flex flex-col rounded-[10px] border p-6", featured ? "border-iron bg-paper shadow-lift" : "border-rule-strong bg-paper/70")}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="plate-type text-xl">{p.name}</h3>
                {featured ? <span className="rounded bg-plate-red px-1.5 py-0.5 text-xs font-bold text-white">Para quem treina sozinho</span> : null}
              </div>
              <p className="mt-1 text-sm text-steel">{p.tagline}</p>
              <p className="mt-5">
                <span className="num plate-type text-[2.5rem] leading-none">{p.priceMonthly === 0 ? "R$ 0" : brl(monthly)}</span>
                {p.priceMonthly > 0 ? <span className="text-sm text-steel"> /mês</span> : null}
              </p>
              <p className={cx("num mt-1 text-xs text-steel", yearly ? "min-h-10" : "min-h-5")}>
                {p.priceMonthly > 0 && yearly && p.priceYearly ? `cobrado ${brl(p.priceYearly)} por ano` : p.priceMonthly > 0 ? "cancele quando quiser" : "para sempre"}
                {anual ? <span className="block font-semibold text-iron">{anual}</span> : null}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-[0.9375rem]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-plate-green" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton
                href={p.id === "coach" ? "/entrar?modo=criar&perfil=personal" : "/entrar?modo=criar"}
                variant={featured ? "primary" : "secondary"}
                className="mt-6 w-full"
                onClick={() => track("landing_cta_clicked", { where: "pricing", porta: p.id === "coach" ? "criar_painel" : "solo", plan: p.id, yearly })}
              >
                {p.id === "free" ? "Começar grátis" : p.id === "pro" ? "Começar e testar o Pro" : "Criar meu painel de personal"}
              </LinkButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}
