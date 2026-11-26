import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BarbellView, Logo, PLATES, PlateChip } from "@/components/brand";
import { FichaDay } from "@/components/ficha";
import type { PlannedExercise, WorkoutDay } from "@/lib/domain/types";

/**
 * U7b: marca, anilhas e folha da ficha. O vermelho vivo só aparece dentro de `[data-brand]` (identidade) ou
 * `[data-plate]` (código das anilhas), e estado/ênfase ficam em `iron` (U7 R1, R3; critérios 1 e 15).
 */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const RED = /plate-red/;
// React escreve o atributo booleano como data-x="true"; o seletor [data-x] do navegador casa com qualquer valor.
const ATTR = (name: string) => `${name}="[^"]*"`;

describe("marca e anilhas (U7b)", () => {
  it("Logo: raiz com data-brand e o ponto em text-brand, sem classe plate-red", () => {
    const out = html(createElement(Logo));
    expect(out).toMatch(new RegExp(`^<span ${ATTR("data-brand")}`));
    expect(out).toContain('<span class="text-brand">·</span>');
    expect(out).toContain('fill="var(--color-brand)"');
    expect(out).not.toMatch(RED);
  });

  it("PlateChip e o <figure> da barra montada têm data-plate", () => {
    const plate = PLATES.find((p) => p.kg === 25)!;
    expect(html(createElement(PlateChip, { plate }))).toMatch(new RegExp(`^<span ${ATTR("data-plate")}`));
    expect(html(createElement(BarbellView, { totalKg: 105 }))).toMatch(new RegExp(`^<figure ${ATTR("data-plate")}`));
  });

  it('"faltam X kg" é atenção em texto iron (nunca vermelho)', () => {
    // 21 kg numa barra de 20 kg: sobra 0,5 kg por lado, que nenhuma anilha fecha.
    const out = html(createElement(BarbellView, { totalKg: 21 }));
    expect(out).toContain('<span class="block text-xs font-semibold text-iron">faltam ');
    expect(out).not.toMatch(RED);
  });
});

describe("folha da ficha (U7b)", () => {
  const ex = (uid: string, technique: PlannedExercise["technique"], name: string): PlannedExercise => ({
    uid,
    exerciseId: uid,
    name,
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSec: 60,
    technique,
  });
  const day: WorkoutDay = {
    key: "A",
    title: "Peito e tríceps",
    focus: ["peito"],
    exercises: [ex("1", "bi_set", "Supino reto"), ex("2", "bi_set", "Crucifixo"), ex("3", "normal", "Tríceps corda")],
  };

  it("a letra do treino é identidade (bg-brand + data-brand) e a técnica fica em iron", () => {
    const out = html(createElement(FichaDay, { day }));
    expect(out).toMatch(new RegExp(`<span ${ATTR("data-brand")} class="[^"]*\\bbg-brand\\b[^"]*">A</span>`));
    expect(out).toMatch(/<span class="font-semibold text-iron">[^<]+<\/span>/);
    expect(out).not.toMatch(RED);
  });
});
