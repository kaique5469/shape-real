"use client";

import { useEffect, useId, useLayoutEffect, useState } from "react";
import { fmtTick, niceTicks, tickDigits, xLabelIndexes } from "@/lib/chart-scale";
import { fmtDayMonth } from "@/lib/domain/format";

/**
 * Gráficos SVG leves (sem biblioteca): linha para tendências e barras para volume.
 * Desenhados na largura real do contêiner (1 unidade do SVG = 1 px), para o texto dos eixos ter 12 px de verdade
 * também no celular (U6 §3.3 C). Um único tom por série; eixo e grade discretos; valor exato no hover/toque.
 */

export interface Point {
  date: string;
  value: number;
}

/** Largura mínima do desenho, e a usada até a primeira medida (o SVG encolhe até medir; a altura já fica reservada). */
const MIN_W = 240;
const UNMEASURED_W = 640;
/** Largura aproximada de um caractere a 12 px com algarismos tabulares: dá a margem do eixo Y. */
const CHAR_W = 7.2;

const fmtNum = (v: number, digits = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });

/** useLayoutEffect no navegador (mede antes de pintar); no servidor não há o que medir. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Largura real do contêiner em px (ResizeObserver): no mínimo 240; 640 até medir. */
function useChartWidth() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useIsoLayoutEffect(() => {
    if (!el) return;
    const read = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setMeasured(w);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl, width: Math.max(MIN_W, measured ?? UNMEASURED_W) };
}

/** Âncora do rótulo do eixo X: o primeiro encosta à esquerda e o último à direita, para não sair do desenho. */
const anchorOf = (i: number, n: number) => (n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle");

export function LineChart({
  data,
  unit = "",
  height = 180,
  color = "var(--color-iron)",
  highlightMax = true,
  label,
  summary,
}: {
  data: Point[];
  unit?: string;
  /** Altura em px reais. */
  height?: number;
  color?: string;
  /** Ponto do máximo em `record` (a Evolução passa false: a melhor marca já está em palavras no cartão). */
  highlightMax?: boolean;
  label: string;
  /** Texto para leitor de tela. Sem ela: "{label}: de X para Y". */
  summary?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const { ref, width: W } = useChartWidth();
  if (data.length === 0) return null;
  const n = data.length;
  const H = height;
  const vals = data.map((d) => d.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const margin = (hi - lo) * 0.15 || Math.max(1, Math.abs(hi) * 0.05);
  const min = lo - margin;
  const max = hi + margin;
  const ticks = niceTicks(min, max);
  const digits = tickDigits(ticks);
  const tickLabels = ticks.map((t) => fmtTick(t, digits));
  const pad = { l: Math.ceil(Math.max(2, ...tickLabels.map((t) => t.length)) * CHAR_W) + 10, r: 12, t: 10, b: 26 };
  const plotW = W - pad.l - pad.r;
  const x = (i: number) => pad.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(n - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const maxIdx = vals.indexOf(hi);
  const labeled = xLabelIndexes(n, plotW);
  // A lista pode ter encolhido (outro exercício): o ponto em foco volta para o último.
  const h = hover !== null && hover < n ? hover : n - 1;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = n === 1 ? 0 : Math.round(((px - pad.l) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <figure ref={ref}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ height: H }}
        className="block touch-pan-y select-none"
        role="img"
        aria-label={summary ?? `${label}: de ${fmtNum(data[0]!.value)}${unit} para ${fmtNum(data[n - 1]!.value)}${unit}`}
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.12" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-rule)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="num fill-steel text-[12px]">
              {tickLabels[i]}
            </text>
          </g>
        ))}
        {labeled.map((i) => (
          <text key={i} x={x(i)} y={H - 7} textAnchor={anchorOf(i, n)} className="num fill-steel text-[12px]">
            {fmtDayMonth(data[i]!.date)}
          </text>
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {highlightMax && n > 1 ? <circle data-record cx={x(maxIdx)} cy={y(hi)} r="5" fill="var(--color-record)" stroke="var(--color-paper)" strokeWidth="2" /> : null}
        <line x1={x(h)} x2={x(h)} y1={pad.t} y2={H - pad.b} stroke="var(--color-rule-strong)" strokeDasharray="3 3" />
        <circle cx={x(h)} cy={y(data[h]!.value)} r="4.5" fill={color} stroke="var(--color-paper)" strokeWidth="2" />
      </svg>
      <figcaption className="mt-1 flex items-baseline justify-between text-sm">
        <span className="num text-steel">{fmtDayMonth(data[h]!.date)}</span>
        <span className="num font-bold">
          {fmtNum(data[h]!.value)}
          {unit}
        </span>
      </figcaption>
    </figure>
  );
}

export function BarChart({
  data,
  label,
  summary,
  unit = "",
  height = 180,
  format,
}: {
  data: { label: string; value: number; sub?: string }[];
  label: string;
  /** Texto para leitor de tela. Sem ela, vale `label`. */
  summary?: string;
  unit?: string;
  /** Altura em px reais. */
  height?: number;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, width: W } = useChartWidth();
  if (data.length === 0) return null;
  const n = data.length;
  const H = height;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (W - pad.l - pad.r) / n;
  // Distância entre o centro da primeira e o da última barra: é nela que os rótulos precisam caber.
  const labeled = new Set(xLabelIndexes(n, bw * (n - 1)));
  const f = format ?? ((v: number) => fmtNum(v, 0) + unit);
  const h = hover !== null && hover < n ? hover : n - 1;
  return (
    <figure ref={ref}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ height: H }} className="block select-none" role="img" aria-label={summary ?? label} onPointerLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--color-rule-strong)" />
        {data.map((d, i) => {
          const bh = ((H - pad.t - pad.b) * d.value) / max;
          const active = i === h;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <rect
                x={pad.l + i * bw + bw * 0.18}
                y={H - pad.b - bh}
                width={bw * 0.64}
                height={Math.max(bh, d.value > 0 ? 2 : 0)}
                rx="3"
                fill={active ? "var(--color-iron)" : "var(--color-rule-strong)"}
              />
              {labeled.has(i) ? (
                <text x={pad.l + i * bw + bw / 2} y={H - 7} textAnchor="middle" className="num fill-steel text-[12px]">
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-steel">{data[h]?.sub ?? data[h]?.label}</span>
        <span className="num shrink-0 font-bold">{data[h] ? f(data[h]!.value) : "—"}</span>
      </figcaption>
    </figure>
  );
}

/** Barras horizontais simples (séries por grupo muscular). */
export function HBars({ rows, max, target }: { rows: { label: string; value: number }[]; max?: number; target?: [number, number] }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value), target?.[1] ?? 0);
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const inRange = target ? r.value >= target[0] && r.value <= target[1] : false;
        return (
          <li key={r.label} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="relative h-2.5 rounded-full bg-chalk-2">
              {target ? <span className="absolute inset-y-0 rounded-full bg-plate-green/15" style={{ left: `${(target[0] / m) * 100}%`, width: `${((target[1] - target[0]) / m) * 100}%` }} /> : null}
              <span className={`absolute inset-y-0 left-0 rounded-full ${inRange ? "bg-plate-green" : "bg-iron"}`} style={{ width: `${Math.min(100, (r.value / m) * 100)}%` }} />
            </span>
            <span className="num text-right font-semibold">{fmtNum(r.value, 1)}</span>
          </li>
        );
      })}
    </ul>
  );
}
