import { describe, expect, it } from "vitest";
import { fmtTick, niceTicks, tickDigits, xLabelIndexes } from "./chart-scale";

describe("eixo Y (niceTicks, tickDigits)", () => {
  it("intervalo curto: rótulos únicos e exatos (antes saía \"11 · 11 · 11\")", () => {
    const ticks = niceTicks(10.6, 11.2);
    expect(ticks).toEqual([10.6, 10.8, 11, 11.2]);
    const digits = tickDigits(ticks);
    expect(digits).toBe(1);
    const labels = ticks.map((t) => fmtTick(t, digits));
    expect(labels).toEqual(["10,6", "10,8", "11,0", "11,2"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("99 a 119: valores inteiros, escritos sem casa decimal", () => {
    const ticks = niceTicks(99, 119);
    expect(ticks).toEqual([100, 105, 110, 115]);
    expect(ticks.every(Number.isInteger)).toBe(true);
    expect(tickDigits(ticks)).toBe(0);
  });

  it("\"4 · 4 · 5 · 5\" não volta: 4 a 5 sai de 0,2 em 0,2 (ou 0,25), sempre único", () => {
    const ticks = niceTicks(3.9, 5.1);
    const labels = ticks.map((t) => fmtTick(t, tickDigits(ticks)));
    expect(new Set(labels).size).toBe(labels.length);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });

  it("passo de 2,5 ganha uma casa; passo de 0,25 ganha duas", () => {
    expect(tickDigits([10, 12.5, 15])).toBe(1);
    expect(tickDigits([1, 1.25, 1.5])).toBe(2);
    expect(tickDigits([])).toBe(0);
  });

  it("todos os valores ficam dentro do intervalo, sem resto de ponto flutuante", () => {
    for (const [a, b] of [[0.3, 0.9], [61.2, 63.4], [1180, 4520], [-2, 3]] as const) {
      const ticks = niceTicks(a, b);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      for (const t of ticks) {
        expect(t).toBeGreaterThanOrEqual(a);
        expect(t).toBeLessThanOrEqual(b);
        expect(String(t)).not.toMatch(/\d{6,}$/);
      }
    }
  });

  it("valor único, ordem trocada e não finito", () => {
    expect(niceTicks(72.5, 72.5)).toEqual([72.5]);
    expect(niceTicks(119, 99)).toEqual([100, 105, 110, 115]);
    expect(niceTicks(Number.NaN, 3)).toEqual([]);
  });
});

describe("eixo X (xLabelIndexes)", () => {
  it("14 treinos em 294 px: inclui o primeiro e o último, no máximo 5 rótulos", () => {
    const idx = xLabelIndexes(14, 294);
    expect(idx).toContain(0);
    expect(idx).toContain(13);
    expect(idx.length).toBeLessThanOrEqual(5);
    expect(idx).toEqual([0, 3, 7, 10, 13]);
  });

  it("dois vizinhos ficam a pelo menos 56 px, em qualquer largura e quantidade", () => {
    for (const n of [2, 3, 5, 8, 14, 19, 40, 120]) {
      for (const w of [186, 240, 294, 400, 586, 1100]) {
        const idx = xLabelIndexes(n, w);
        expect(idx[0]).toBe(0);
        expect(idx[idx.length - 1]).toBe(n - 1);
        expect(idx.length).toBeLessThanOrEqual(Math.max(2, Math.floor(w / 56)));
        for (let i = 1; i < idx.length; i++) {
          expect(idx[i]!).toBeGreaterThan(idx[i - 1]!);
          expect(((idx[i]! - idx[i - 1]!) * w) / (n - 1)).toBeGreaterThanOrEqual(56);
        }
      }
    }
  });

  it("poucos pontos com espaço: todos ganham rótulo; um ponto só ou nenhum", () => {
    expect(xLabelIndexes(3, 600)).toEqual([0, 1, 2]);
    expect(xLabelIndexes(1, 300)).toEqual([0]);
    expect(xLabelIndexes(0, 300)).toEqual([]);
  });
});
