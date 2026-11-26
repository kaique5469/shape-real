/**
 * Escala dos gráficos SVG (U6 §3.3 C). Puro, para teste: o componente desenha em pixels reais e pede aqui os
 * valores do eixo Y, as casas decimais dos rótulos e quais datas do eixo X cabem sem se encavalar.
 */

/** Tira o resto de ponto flutuante (53 × 0,2 = 10,600000000000001 → 10,6). */
const clean = (v: number) => Number(v.toPrecision(12)) || 0;

/**
 * Valores "redondos" do eixo Y dentro de [min, max]: passo de 1, 2, 2,5 ou 5 × 10^k (2,5 só a partir de 2,5), com cerca de `count`
 * intervalos. `niceTicks(99, 119)` → 100, 105, 110, 115; `niceTicks(10.6, 11.2)` → 10,6, 10,8, 11, 11,2.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min > max) [min, max] = [max, min];
  if (min === max) return [clean(min)];
  const step0 = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  // Abaixo de 1, sem o 2,5 (passo 0,25 forçaria 2 casas: "54,50 · 54,75" para um peso com 1 casa).
  const mults = mag < 1 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = mults.map((m) => m * mag).find((s) => s >= step0 * (1 - 1e-9)) ?? 10 * mag;
  const out: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k <= Math.floor(max / step + 1e-9); k++) out.push(clean(k * step));
  return out.length ? out : [clean(min), clean(max)];
}

/**
 * Casas decimais dos rótulos (0, 1 ou 2): a menor que escreve cada valor exato. Valores distintos escritos
 * exatos nunca se repetem ("11 · 11 · 11" vira "10,6 · 10,8 · 11,0 · 11,2").
 */
export function tickDigits(ticks: readonly number[]): 0 | 1 | 2 {
  for (const d of [0, 1] as const) {
    const f = 10 ** d;
    if (ticks.every((t) => Math.abs(Math.round(t * f) / f - t) <= 1e-9 * Math.max(1, Math.abs(t)))) return d;
  }
  return 2;
}

/** Rótulo do eixo Y em pt-BR com exatamente `digits` casas ("117,5", "11,0", "120"). */
export function fmtTick(v: number, digits: 0 | 1 | 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Índices dos pontos que ganham rótulo no eixo X: sempre o primeiro e o último, no máximo `floor(widthPx / minGapPx)`
 * rótulos, espalhados por igual e com pelo menos `minGapPx` entre dois vizinhos. `widthPx` é a distância em pixels
 * entre o primeiro e o último ponto. `xLabelIndexes(14, 294)` → 0, 3, 7, 10, 13.
 */
export function xLabelIndexes(n: number, widthPx: number, minGapPx = 56): number[] {
  if (!Number.isFinite(n) || n <= 0) return [];
  if (n === 1) return [0];
  const room = Math.max(2, Math.floor(widthPx / minGapPx));
  // Menor salto (em pontos) que deixa dois rótulos vizinhos a pelo menos minGapPx um do outro.
  const step = Math.max(1, Math.ceil((minGapPx * (n - 1)) / Math.max(1, widthPx)));
  const k = Math.max(2, Math.min(n, room, Math.floor((n - 1) / step) + 1));
  // Arredondar j·(n−1)/(k−1) mantém o salto mínimo: o salto real é ≥ step, e o arredondado nunca fica abaixo do piso dele.
  return Array.from({ length: k }, (_, j) => Math.round((j * (n - 1)) / (k - 1)));
}
