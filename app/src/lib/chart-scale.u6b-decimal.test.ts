import { describe, expect, it } from "vitest";
import { niceTicks, tickDigits } from "./chart-scale";

/** Peso corporal tem 1 casa: o eixo não pode pedir 2 ("54,50 · 54,75 · 55,00 · 55,25"). */
describe("passo decimal do eixo Y (U6b)", () => {
  it("54,5 a 55,4 kg: passo 0,5, uma casa", () => {
    const ticks = niceTicks(54.5, 55.4);
    expect(ticks).toEqual([54.5, 55]);
    expect(tickDigits(ticks)).toBeLessThanOrEqual(1);
  });
  it("nenhum intervalo decimal comum pede 2 casas", () => {
    for (const [a, b] of [
      [54.5, 55.4],
      [60.1, 61.2],
      [3.9, 5.1],
      [0.4, 1.3],
      [72.2, 73.1],
    ] as const)
      expect(tickDigits(niceTicks(a, b))).toBeLessThanOrEqual(1);
  });
  it("a partir de 1, o passo 2,5 continua (117,5 · 120 …)", () => {
    expect(niceTicks(110, 120)).toEqual([110, 112.5, 115, 117.5, 120]);
  });
});
