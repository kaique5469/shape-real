"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { BarbellView } from "@/components/brand";
import { cx } from "@/components/ui";

/** Ficha ilustrativa da primeira dobra: a carga antiga é riscada e a nova "carimbada". */
const DAYS = [
  {
    key: "A",
    title: "Peito, ombros e tríceps",
    rows: [
      { name: "Supino reto com barra", scheme: "4 × 6–8", from: 50, to: 52.5, last: "8 · 8 · 8 · 8", up: true },
      { name: "Supino inclinado com halteres", scheme: "3 × 8–12", from: 20, to: 20, last: "12 · 11 · 9", up: false },
      { name: "Desenvolvimento com halteres", scheme: "3 × 8–12", from: 16, to: 18, last: "12 · 12 · 12", up: true },
      { name: "Elevação lateral", scheme: "3 × 10–15", from: 8, to: 8, last: "15 · 13 · 12", up: false },
      { name: "Tríceps na polia com corda", scheme: "3 × 10–15", from: 20, to: 22.5, last: "15 · 15 · 15", up: true },
    ],
  },
  {
    key: "B",
    title: "Costas e bíceps",
    rows: [
      { name: "Puxada frontal na polia", scheme: "3 × 8–12", from: 55, to: 60, last: "12 · 12 · 12", up: true },
      { name: "Remada curvada com barra", scheme: "4 × 6–8", from: 50, to: 50, last: "8 · 7 · 7 · 6", up: false },
      { name: "Remada baixa sentada", scheme: "3 × 8–12", from: 45, to: 47.5, last: "12 · 12 · 12", up: true },
      { name: "Rosca direta com barra", scheme: "3 × 10–15", from: 25, to: 25, last: "13 · 12 · 10", up: false },
      { name: "Rosca martelo", scheme: "3 × 10–15", from: 12, to: 14, last: "15 · 15 · 15", up: true },
    ],
  },
  {
    key: "C",
    title: "Pernas e abdômen",
    rows: [
      { name: "Agachamento livre", scheme: "4 × 6–8", from: 80, to: 85, last: "8 · 8 · 8 · 8", up: true },
      { name: "Leg press 45°", scheme: "3 × 8–12", from: 160, to: 160, last: "12 · 10 · 9", up: false },
      { name: "Stiff com barra", scheme: "3 × 8–12", from: 50, to: 55, last: "12 · 12 · 12", up: true },
      { name: "Cadeira extensora", scheme: "3 × 10–15", from: 40, to: 40, last: "14 · 12 · 11", up: false },
      { name: "Panturrilha em pé", scheme: "3 × 10–15", from: 60, to: 65, last: "15 · 15 · 15", up: true },
    ],
  },
];

const kg = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function HeroFicha() {
  const [day, setDay] = useState(0);
  const [stamped, setStamped] = useState(false);
  const d = DAYS[day]!;
  const featured = d.rows[0]!;

  useEffect(() => {
    setStamped(false);
    const t = setTimeout(() => setStamped(true), 650);
    return () => clearTimeout(t);
  }, [day]);

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-[10px] border border-rule-strong bg-paper shadow-lift" aria-label="Exemplo de ficha de treino (dados ilustrativos)">
        <div className="flex items-stretch justify-between bg-iron text-chalk">
          <div className="min-w-0 px-4 py-3">
            <p className="truncate text-[0.95rem] font-bold">
              Treino {d.key} — {d.title}
            </p>
            <p className="mt-0.5 text-xs text-chalk/60">Ficha ABC · Hipertrofia</p>
          </div>
          <div className="flex" role="tablist" aria-label="Dias da ficha">
            {DAYS.map((x, i) => (
              <button
                key={x.key}
                role="tab"
                aria-selected={i === day}
                onClick={() => setDay(i)}
                className={cx("plate-type w-11 text-lg transition-colors", i === day ? "bg-plate-red text-white" : "text-chalk/55 hover:text-chalk")}
              >
                {x.key}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 border-b border-rule bg-chalk px-4 py-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_7rem]">
          <span className="col-head text-steel">Exercício</span>
          <span className="col-head text-steel">Séries</span>
          <span className="col-head text-right text-steel">Carga</span>
        </div>

        <ol className="ruled">
          {d.rows.map((r, i) => (
            <li key={d.key + r.name} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_5.5rem_7rem]">
              <div className="min-w-0">
                <p className="truncate text-[0.9rem] font-semibold">{r.name}</p>
                <p className="num truncate text-xs text-steel">Última: {kg(r.from)} kg × {r.last}</p>
              </div>
              <span className="num text-sm font-semibold">{r.scheme}</span>
              <span className="num flex items-center justify-end gap-1.5 text-right">
                {r.up ? (
                  <>
                    <span className={cx("text-sm transition-colors duration-300", stamped && "pencil-strike")}>{kg(r.from)}</span>
                    <span
                      className={cx("inline-flex items-center font-extrabold text-iron", stamped ? "animate-stamp" : "opacity-0")}
                      style={{ animationDelay: `${i * 90}ms` }}
                    >
                      {kg(r.to)}
                      <ArrowUpRight className="size-3.5 text-plate-red" aria-label="subiu" />
                    </span>
                  </>
                ) : (
                  <span className="font-bold">{kg(r.to)}</span>
                )}
                <span className="text-xs text-steel">kg</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-chalk/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[0.8125rem] text-steel">
            <Check className="size-4 text-plate-green" aria-hidden />
            Bateu o topo da faixa em todas as séries → a carga sobe.
          </p>
          <BarbellView totalKg={featured.to} className="hidden sm:flex" />
        </div>
      </div>
      <p className="mt-2 text-right text-xs text-pencil">Dados ilustrativos</p>
    </div>
  );
}
