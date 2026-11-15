/**
 * Calculadora de anilhas. Cores pelo padrão de competição (IWF/IPF):
 * 25 vermelho · 20 azul · 15 amarelo · 10 verde · 5 branco · 2,5 vermelho pequeno · 1,25 cromado.
 */
export interface Plate {
  kg: number;
  color: string;
  label: string;
  /** Altura relativa do desenho (anilhas menores são mais baixas). */
  size: number;
}

export const PLATES: Plate[] = [
  { kg: 25, color: "var(--plate-red)", label: "25", size: 1 },
  { kg: 20, color: "var(--plate-blue)", label: "20", size: 1 },
  { kg: 15, color: "var(--plate-yellow)", label: "15", size: 0.92 },
  { kg: 10, color: "var(--plate-green)", label: "10", size: 0.84 },
  { kg: 5, color: "var(--plate-white)", label: "5", size: 0.66 },
  { kg: 2.5, color: "var(--plate-red)", label: "2,5", size: 0.52 },
  { kg: 1.25, color: "var(--plate-chrome)", label: "1,25", size: 0.44 },
];

export interface PlateResult {
  bar: number;
  perSide: Plate[];
  remainder: number;
  total: number;
}

export function platesFor(totalKg: number, barKg = 20, available: number[] = PLATES.map((p) => p.kg)): PlateResult {
  const perSide: Plate[] = [];
  let side = Math.max(0, (totalKg - barKg) / 2);
  const sorted = PLATES.filter((p) => available.includes(p.kg)).sort((a, b) => b.kg - a.kg);
  for (const plate of sorted) {
    while (side + 1e-9 >= plate.kg) {
      perSide.push(plate);
      side -= plate.kg;
    }
  }
  const loaded = barKg + perSide.reduce((a, p) => a + p.kg, 0) * 2;
  return { bar: barKg, perSide, remainder: Math.round((totalKg - loaded) * 100) / 100, total: loaded };
}
