"use client";

import { useState } from "react";
import { SYSTEMS } from "@/lib/domain/systems";
import { GROUP_LABEL } from "@/lib/domain/exercises";
import { LinkButton, cx } from "@/components/ui";
import { track } from "@/lib/analytics";

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function SystemPicker() {
  const [id, setId] = useState(SYSTEMS[2]!.id);
  const s = SYSTEMS.find((x) => x.id === id)!;
  return (
    <div>
      <div role="tablist" aria-label="Sistemas de treino" className="-mx-4 flex gap-0 overflow-x-auto px-4 pb-px sm:mx-0 sm:px-0">
        {SYSTEMS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === id}
            onClick={() => setId(x.id)}
            className={cx(
              "plate-type -mb-px shrink-0 rounded-t-[8px] border px-4 py-2.5 text-[0.95rem] transition-colors",
              x.id === id ? "border-rule-strong border-b-paper bg-paper text-iron" : "border-transparent text-steel hover:text-iron",
            )}
          >
            {x.short}
          </button>
        ))}
      </div>
      <div className="rounded-b-[10px] rounded-tr-[10px] border border-rule-strong bg-paper p-5 sm:p-7">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_1.2fr]">
          <div>
            <h3 className="plate-type text-2xl">{s.name}</h3>
            <p className="mt-2 text-[0.9375rem] text-steel">{s.description}</p>
            <p className="mt-3 text-[0.9375rem]">
              <span className="font-semibold">Para quem:</span> {s.bestFor}
            </p>
            <ol className="mt-5 grid grid-cols-7 gap-1" aria-label="Semana de exemplo">
              {WEEK.map((w, i) => {
                const k = s.week[i] ?? "–";
                const rest = k === "–";
                return (
                  <li key={w} className="text-center">
                    <span className="block text-[0.6875rem] font-semibold uppercase text-steel">{w}</span>
                    <span
                      className={cx(
                        "plate-type mt-1 grid h-11 place-items-center rounded text-[0.8rem] leading-none",
                        rest ? "border border-dashed border-rule-strong text-pencil" : "bg-iron text-chalk",
                      )}
                    >
                      {rest ? "off" : k.replace("Push", "Pu").replace("Pull", "Pl").replace("Legs", "Lg")}
                    </span>
                  </li>
                );
              })}
            </ol>
            <LinkButton href="/entrar?modo=criar" className="mt-6" onClick={() => track("landing_cta_clicked", { where: "systems", system: s.id })}>
              Gerar minha ficha {s.short} com IA
            </LinkButton>
          </div>
          <ul className="ruled self-start rounded-[8px] border border-rule">
            {s.templates.map((t) => (
              <li key={t.key} className="flex items-baseline gap-4 px-4 py-3">
                <span className="plate-type w-14 shrink-0 text-lg text-plate-red">{t.key}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{t.title}</span>
                  <span className="block text-sm text-steel">{t.focus.map((g) => GROUP_LABEL[g]).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
