"use client";

import { useMemo, useState } from "react";
import { parseDietText, sumItems } from "@/lib/domain/nutrition";
import { Textarea } from "@/components/ui";

const SAMPLE = "Café da manhã: 2 ovos, 1 pão francês, café\nAlmoço: 150g de arroz, 1 concha de feijão, 130g de frango, salada\nLanche: iogurte natural, 1 banana\nJantar: 200g de batata-doce e 120g de patinho";

/** Demonstração real do leitor de dieta (roda no navegador, com a mesma base de alimentos do app). */
export function DietDemo() {
  const [text, setText] = useState(SAMPLE);
  const { meals, unknown } = useMemo(() => parseDietText(text), [text]);
  const t = sumItems(meals.flatMap((m) => m.items));
  const target = { kcal: 2300, proteinG: 160 };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Escreva o que você comeu, do seu jeito</span>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="min-h-40 text-[0.9375rem]" />
      </label>
      <div className="rounded-[8px] border border-rule bg-paper">
        <div className="grid grid-cols-4 divide-x divide-rule border-b border-rule">
          {[
            ["kcal", t.kcal, target.kcal],
            ["proteína", t.proteinG, target.proteinG],
            ["carbo", t.carbsG, null],
            ["gordura", t.fatG, null],
          ].map(([label, v, goal]) => (
            <div key={label as string} className="px-3 py-3">
              <p className="num plate-type text-xl">{Math.round(v as number)}</p>
              <p className="text-xs text-steel">
                {label as string}
                {goal ? ` / ${goal}` : ""}
              </p>
            </div>
          ))}
        </div>
        <ul className="ruled max-h-48 overflow-y-auto text-sm">
          {meals.flatMap((m) =>
            m.items.map((i) => (
              <li key={i.uid} className="flex justify-between gap-3 px-3 py-2">
                <span className="truncate">
                  <span className="text-steel">{m.name} · </span>
                  {i.name}
                </span>
                <span className="num shrink-0 text-steel">
                  {i.grams} g · {i.proteinG.toLocaleString("pt-BR")} g prot
                </span>
              </li>
            )),
          )}
          {unknown.length ? <li className="px-3 py-2 text-plate-red-ink">Não reconheci: {unknown.join(", ")}</li> : null}
        </ul>
        <p className="border-t border-rule px-3 py-2 text-xs text-pencil">Base de alimentos com valores aproximados (TACO). No app, a dieta compara com as suas metas e mostra o que ajustar.</p>
      </div>
    </div>
  );
}
