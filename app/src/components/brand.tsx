import { PLATES, platesFor, type Plate } from "@/lib/domain/plates";
import { cx } from "@/lib/cx";

/** Marca: anilha de 25 kg vista de frente + logotipo largo. */
export function PlateMark({ className, color = "var(--plate-red)" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill={color} />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="rgb(0 0 0 / .18)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="4.2" fill="var(--color-chalk)" />
      <circle cx="16" cy="16" r="4.2" fill="none" stroke="rgb(0 0 0 / .25)" strokeWidth="1" />
    </svg>
  );
}

/** Enquanto o app está em beta, o selo aparece junto do nome em todas as telas. */
export const BETA = true;

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <PlateMark className="size-7 shrink-0" />
      {!compact && (
        <span className="plate-type text-[1.05rem] leading-none tracking-[-0.01em]">
          SHAPE<span className="text-plate-red">·</span>REAL
        </span>
      )}
      {BETA && !compact ? <span className="col-head rounded-[4px] bg-plate-yellow px-1.5 py-[3px] leading-none text-iron">beta</span> : null}
    </span>
  );
}

/** Pastilha colorida de anilha (ex.: "20" azul). */
export function PlateChip({ plate, className }: { plate: Plate; className?: string }) {
  const light = plate.kg === 5 || plate.kg === 15 || plate.kg === 1.25;
  return (
    <span
      className={cx("num inline-grid size-7 place-items-center rounded-full text-[0.625rem] font-extrabold ring-1 ring-black/10", light ? "text-iron" : "text-white", className)}
      style={{ background: plate.color }}
      title={`${plate.label} kg`}
    >
      {plate.label}
    </span>
  );
}

/**
 * Barra montada: desenha um lado da barra com as anilhas na ordem de carregamento.
 * Assinatura do produto — responde "quanto coloco de cada lado?" no meio da série.
 */
export function BarbellView({ totalKg, barKg = 20, className }: { totalKg: number; barKg?: number; className?: string }) {
  const r = platesFor(totalKg, barKg);
  const h = 64;
  let x = 26;
  return (
    <figure className={cx("flex items-center gap-3", className)}>
      <svg viewBox={`0 0 220 ${h}`} className="h-16 w-full min-w-0 max-w-[220px] flex-1" role="img" aria-label={`${totalKg} kg: barra de ${barKg} kg e por lado ${r.perSide.map((p) => p.label).join(" + ") || "nenhuma anilha"}`}>
        <rect x="0" y={h / 2 - 3} width="220" height="6" rx="2" fill="#9aa0a7" />
        <rect x="18" y={h / 2 - 9} width="8" height="18" rx="1.5" fill="#6b7179" />
        {r.perSide.map((p, i) => {
          const ph = h * p.size;
          const w = p.kg >= 10 ? 13 : p.kg >= 2.5 ? 9 : 7;
          const el = (
            <g key={i}>
              <rect x={x} y={(h - ph) / 2} width={w} height={ph} rx="2.5" fill={p.color} stroke="rgb(0 0 0 / .22)" strokeWidth="1" />
            </g>
          );
          x += w + 1.5;
          return el;
        })}
        <rect x={x + 1} y={h / 2 - 6} width="6" height="12" rx="1.5" fill="#6b7179" />
      </svg>
      <figcaption className="shrink-0 whitespace-nowrap text-sm">
        <span className="block text-steel">por lado</span>
        <span className="num font-bold">{r.perSide.length ? r.perSide.map((p) => p.label).join(" + ") : "só a barra"}</span>
        {r.remainder > 0 ? <span className="block text-xs text-plate-red-ink">faltam {String(r.remainder).replace(".", ",")} kg</span> : null}
      </figcaption>
    </figure>
  );
}

export { PLATES };
