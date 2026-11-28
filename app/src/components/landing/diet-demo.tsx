"use client";

import { useMemo, useState } from "react";
import { itensAConferir, parseDietText, sumItems } from "@/lib/domain/nutrition";
import { Textarea } from "@/components/ui";

const SAMPLE = "Café da manhã: 2 ovos, 1 pão francês, café\nAlmoço: 150g de arroz, 1 concha de feijão, 130g de frango, salada\nLanche: iogurte natural, 1 banana\nJantar: 200g de batata-doce e 120g de patinho";

const conta = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Total parcial: 1 item não reconhecido e 1 item para conferir." ou "" quando tudo foi lido. */
export function rotuloParcial(naoLidos: number, conferir: number): string {
  const p = [naoLidos ? conta(naoLidos, "item não reconhecido", "itens não reconhecidos") : null, conferir ? conta(conferir, "item para conferir", "itens para conferir") : null].filter(Boolean);
  return p.length ? `Total parcial: ${p.join(" e ")}.` : "";
}

/** Demonstração real do leitor de dieta (roda no navegador, com a mesma base de alimentos do app). */
export function DietDemo() {
  const [text, setText] = useState(SAMPLE);
  const lido = useMemo(() => parseDietText(text), [text]);
  const { meals, unknown } = lido;
  const t = sumItems(meals.flatMap((m) => m.items));
  const parcial = rotuloParcial(unknown.length, itensAConferir(lido).length);
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
        {/* R3-5: com trecho não lido ou item a conferir, o total é só o que foi lido. */}
        <p role="status" className={parcial ? "border-b border-rule px-3 py-2 text-sm font-semibold" : "sr-only"}>
          {parcial}
        </p>
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
