"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PLANS, brl } from "@/lib/domain/plans";
import { LinkButton, Segmented, cx } from "@/components/ui";
import { track } from "@/lib/analytics";

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
          { value: "ano", label: "Anual (2 meses grátis)" },
        ]}
        size="sm"
      />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const featured = p.id === "pro";
          const monthly = yearly && p.priceYearly ? p.priceYearly / 12 : p.priceMonthly;
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
              <p className="num mt-1 h-5 text-xs text-steel">{p.priceMonthly > 0 && yearly && p.priceYearly ? `cobrado ${brl(p.priceYearly)} por ano` : p.priceMonthly > 0 ? "cancele quando quiser" : "para sempre"}</p>
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
