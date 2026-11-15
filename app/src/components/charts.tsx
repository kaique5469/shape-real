"use client";

import { useId, useState } from "react";

/**
 * Gráficos SVG leves (sem biblioteca): linha para tendências e barras para volume.
 * Um único tom por série; eixo e grade discretos; valor exato no hover/toque.
 */

export interface Point {
  date: string;
  value: number;
}

const fmtDate = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
const fmtNum = (v: number, digits = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function LineChart({
  data,
  unit = "",
  height = 200,
  color = "var(--color-iron)",
  highlightMax = true,
  label,
}: {
  data: Point[];
  unit?: string;
  height?: number;
  color?: string;
  highlightMax?: boolean;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  if (data.length === 0) return null;
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 14, t: 14, b: 26 };
  const vals = data.map((d) => d.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const margin = (max - min) * 0.15 || Math.max(1, max * 0.05);
  min -= margin;
  max += margin;
  const x = (i: number) => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(data.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const maxIdx = vals.indexOf(Math.max(...vals));
  const ticks = niceTicks(min, max);
  const h = hover ?? data.length - 1;
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`${label}: de ${fmtNum(data[0]!.value)}${unit} para ${fmtNum(data[data.length - 1]!.value)}${unit}`}
        onPointerMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.12" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-rule)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="num fill-steel text-[11px]">
              {fmtNum(t, 0)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={d.date + i} x={x(i)} y={H - 6} textAnchor={i === 0 && data.length > 1 ? "start" : i === data.length - 1 && data.length > 1 ? "end" : "middle"} className="fill-steel text-[11px]">
              {fmtDate(d.date)}
            </text>
          ) : null,
        )}
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {highlightMax && data.length > 1 ? <circle cx={x(maxIdx)} cy={y(vals[maxIdx]!)} r="5" fill="var(--color-plate-red)" stroke="#fff" strokeWidth="2" /> : null}
        <line x1={x(h)} x2={x(h)} y1={pad.t} y2={H - pad.b} stroke="var(--color-rule-strong)" strokeDasharray="3 3" />
        <circle cx={x(h)} cy={y(data[h]!.value)} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
      </svg>
      <figcaption className="mt-1 flex items-baseline justify-between text-sm">
        <span className="text-steel">{fmtDate(data[h]!.date)}</span>
        <span className="num font-bold">
          {fmtNum(data[h]!.value)}
          {unit}
        </span>
      </figcaption>
    </figure>
  );
}

export function BarChart({ data, label, unit = "", height = 160, format }: { data: { label: string; value: number; sub?: string }[]; label: string; unit?: string; height?: number; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (W - pad.l - pad.r) / data.length;
  const f = format ?? ((v: number) => fmtNum(v, 0) + unit);
  const h = hover ?? data.length - 1;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--color-rule-strong)" />
        {data.map((d, i) => {
          const bh = ((H - pad.t - pad.b) * d.value) / max;
          const active = i === h;
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <rect
                x={pad.l + i * bw + bw * 0.18}
                y={H - pad.b - bh}
                width={bw * 0.64}
                height={Math.max(bh, d.value > 0 ? 2 : 0)}
                rx="3"
                fill={active ? "var(--color-iron)" : "var(--color-rule-strong)"}
              />
              <text x={pad.l + i * bw + bw / 2} y={H - 7} textAnchor="middle" className="fill-steel text-[11px]">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex items-baseline justify-between text-sm">
        <span className="text-steel">{data[h]?.sub ?? data[h]?.label}</span>
        <span className="num font-bold">{data[h] ? f(data[h]!.value) : "—"}</span>
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
