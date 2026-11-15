import { Check, Timer, Trophy } from "lucide-react";
import { BarbellView } from "@/components/brand";
import { LineChart } from "@/components/charts";

/** Celular desenhado em CSS com a tela de sessão ao vivo (ilustrativo). */
export function SessionPhone() {
  const sets = [
    { kg: "52,5", reps: 8, done: true },
    { kg: "52,5", reps: 8, done: true },
    { kg: "52,5", reps: 7, done: false, active: true },
    { kg: "52,5", reps: null, done: false },
  ];
  return (
    <div className="mx-auto w-[280px] rounded-[38px] border-[10px] border-iron bg-iron shadow-lift">
      <div className="overflow-hidden rounded-[28px] bg-chalk">
        <div className="flex items-center justify-between bg-iron px-4 pb-3 pt-4 text-chalk">
          <span className="text-xs text-chalk/70">Treino A · 3/5</span>
          <span className="num text-xs font-semibold">38:12</span>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <p className="text-[0.95rem] font-bold leading-tight">Supino reto com barra</p>
            <p className="num text-xs text-steel">4 × 6–8 · Última: 50 kg × 8 · 8 · 8 · 8</p>
          </div>
          <div className="flex items-center gap-2 rounded-[6px] bg-plate-red px-3 py-2 text-white">
            <Trophy className="size-4" aria-hidden />
            <span className="text-xs font-bold">Sugestão: subir para 52,5 kg</span>
          </div>
          <ol className="space-y-1.5">
            {sets.map((s, i) => (
              <li key={i} className={`num grid grid-cols-[1.25rem_1fr_1fr_2rem] items-center gap-2 rounded-[6px] border px-2 py-1.5 text-sm ${s.active ? "border-iron bg-paper" : "border-rule bg-paper/70"}`}>
                <span className="text-xs text-steel">{i + 1}</span>
                <span className="font-bold">{s.kg} kg</span>
                <span className="font-bold">{s.reps ?? "—"} reps</span>
                <span className={`grid size-7 place-items-center rounded ${s.done ? "bg-plate-green text-white" : "border border-rule-strong"}`}>{s.done ? <Check className="size-4" /> : null}</span>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between rounded-[6px] bg-iron px-3 py-2.5 text-chalk">
            <span className="flex items-center gap-1.5 text-xs text-chalk/70">
              <Timer className="size-4" aria-hidden /> Descanso
            </span>
            <span className="num plate-type text-2xl">1:24</span>
          </div>
          <BarbellView totalKg={52.5} />
        </div>
      </div>
    </div>
  );
}

const E1RM = [
  ["2026-01-06", 63.3], ["2026-01-13", 64.0], ["2026-01-20", 65.3], ["2026-01-27", 65.3], ["2026-02-03", 66.7], ["2026-02-10", 68.0],
  ["2026-02-17", 68.0], ["2026-02-24", 70.0], ["2026-03-03", 70.7], ["2026-03-10", 72.3], ["2026-03-17", 73.0], ["2026-03-24", 74.7],
] as const;

export function EvolutionMock() {
  return (
    <div className="rounded-[10px] border border-rule-strong bg-paper p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-bold">Supino reto com barra</p>
          <p className="text-sm text-steel">1RM estimado por treino</p>
        </div>
        <p className="num plate-type text-2xl">
          +11,4<span className="text-base"> kg</span>
        </p>
      </div>
      <div className="mt-3">
        <LineChart data={E1RM.map(([date, value]) => ({ date, value }))} unit=" kg" label="1RM estimado do supino" height={190} />
      </div>
      <table className="num mt-4 w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="col-head pb-2 font-bold text-steel">Medida</th>
            <th className="col-head pb-2 text-right text-steel">Jan</th>
            <th className="col-head pb-2 text-right text-steel">Mar</th>
            <th className="col-head pb-2 text-right text-steel">Δ</th>
          </tr>
        </thead>
        <tbody className="ruled">
          {[
            ["Peso", "82,4 kg", "81,1 kg", "−1,3"],
            ["Cintura", "89,0 cm", "86,2 cm", "−2,8"],
            ["Braço", "35,1 cm", "36,0 cm", "+0,9"],
          ].map(([m, a, b, d]) => (
            <tr key={m} className="border-t border-rule">
              <td className="py-2">{m}</td>
              <td className="py-2 text-right text-steel">{a}</td>
              <td className="py-2 text-right font-semibold">{b}</td>
              <td className="py-2 text-right font-bold">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-pencil">Dados ilustrativos</p>
    </div>
  );
}

/** Painel do personal (ilustrativo): aderência dos últimos 7 dias. */
export function CoachMock() {
  const rows = [
    { name: "Juliana Prado", program: "Upper/Lower · Emagrecimento", week: [1, 1, 0, 1, 1, 0, 0], last: "hoje", alert: false },
    { name: "Marcos Antunes", program: "5×5 · Força", week: [1, 0, 1, 0, 1, 0, 0], last: "ontem", alert: false },
    { name: "Beatriz Lima", program: "Full Body · Hipertrofia", week: [0, 0, 0, 0, 0, 0, 0], last: "há 9 dias", alert: true },
    { name: "Rafael Souza", program: "ABC · Hipertrofia", week: [1, 1, 1, 0, 1, 1, 0], last: "hoje", alert: false },
  ];
  return (
    <div className="overflow-hidden rounded-[10px] border border-white/15 bg-iron-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/10 px-4 py-2.5 sm:grid-cols-[1.3fr_1fr_auto_5rem]">
        <span className="col-head text-chalk/55">Aluno</span>
        <span className="col-head hidden text-chalk/55 sm:block">Ficha atual</span>
        <span className="col-head text-chalk/55">Últimos 7 dias</span>
        <span className="col-head hidden text-right text-chalk/55 sm:block">Último</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-0 sm:grid-cols-[1.3fr_1fr_auto_5rem]">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-chalk">{r.name}</span>
              {r.alert ? <span className="mt-0.5 block text-xs font-semibold text-plate-yellow">Sem treinar há 9 dias</span> : <span className="block truncate text-xs text-chalk/55 sm:hidden">{r.program}</span>}
            </span>
            <span className="hidden truncate text-sm text-chalk/70 sm:block">{r.program}</span>
            <span className="flex gap-1" aria-label={`${r.week.filter(Boolean).length} treinos na semana`}>
              {r.week.map((w, i) => (
                <span key={i} className={`size-3 rounded-full ${w ? "bg-plate-green" : "bg-white/12"}`} />
              ))}
            </span>
            <span className={`hidden text-right text-sm sm:block ${r.alert ? "text-plate-yellow" : "text-chalk/70"}`}>{r.last}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
