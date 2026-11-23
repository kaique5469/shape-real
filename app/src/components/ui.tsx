"use client";

import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";

import { cx } from "@/lib/cx";
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "record" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-iron text-chalk hover:bg-iron-2 active:translate-y-px shadow-press",
  secondary: "bg-paper text-iron border border-rule-strong hover:border-iron active:translate-y-px",
  ghost: "text-iron hover:bg-chalk-2",
  record: "bg-plate-red text-white hover:bg-plate-red-ink active:translate-y-px shadow-press",
  danger: "bg-paper text-plate-red-ink border border-plate-red/40 hover:border-plate-red hover:bg-plate-red/5",
};
const SIZE = { sm: "h-9 px-3 text-sm gap-1.5", md: "h-11 px-4 text-[0.9375rem] gap-2", lg: "h-14 px-6 text-base gap-2.5" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZE;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center rounded-[var(--radius-ficha)] font-semibold transition-[background,border,transform,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  icon,
  onClick,
}: {
  href: string;
  variant?: Variant;
  size?: keyof typeof SIZE;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cx("inline-flex items-center justify-center rounded-[var(--radius-ficha)] font-semibold transition-colors duration-150", VARIANT[variant], SIZE[size], className)}
    >
      {icon}
      {children}
    </Link>
  );
}

/**
 * Rótulo + controle. Para um conjunto de botões (Segmented, chips) use `group`: dentro de um <label>
 * o toque no texto ou no espaço entre as opções ativaria a primeira delas.
 */
export function Field({ label, hint, error, children, className, group }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; group?: boolean }) {
  const note = error ? <span className="mt-1 block text-sm text-plate-red-ink">{error}</span> : hint ? <span className="mt-1 block text-[0.8125rem] text-steel">{hint}</span> : null;
  if (group) {
    return (
      <div role="group" aria-label={label} className={cx("block", className)}>
        <span className="mb-1.5 block text-sm font-semibold text-iron">{label}</span>
        {children}
        {note}
      </div>
    );
  }
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-semibold text-iron">{label}</span>
      {children}
      {note}
    </label>
  );
}

const inputBase =
  "w-full rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-3 text-[0.9375rem] text-iron placeholder:text-pencil transition-colors focus:border-iron focus:outline-none focus-visible:outline-2 focus-visible:outline-plate-blue disabled:bg-chalk-2";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, "h-11", className)} {...rest} />;
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, "min-h-28 py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, "h-11 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2312151a' stroke-width='1.6' fill='none'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

/** Controle segmentado — escolhas mutuamente exclusivas com rótulo visível. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: string }[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-[var(--radius-ficha)] border text-left font-semibold transition-colors",
              size === "sm" ? "min-h-10 px-3 py-1.5 text-sm" : "min-h-11 px-3.5 py-2.5 text-[0.9375rem]",
              active ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper text-iron hover:border-iron",
            )}
          >
            <span className="block">{o.label}</span>
            {o.hint ? <span className={cx("mt-0.5 block text-xs font-normal", active ? "text-chalk/75" : "text-steel")}>{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "record" | "info" | "done" | "warn"; children: ReactNode; className?: string }) {
  const t = {
    neutral: "bg-chalk-2 text-iron",
    record: "bg-plate-red text-white",
    info: "bg-plate-blue/10 text-plate-blue-ink",
    done: "bg-plate-green/12 text-plate-green-ink",
    warn: "bg-plate-yellow/25 text-iron",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold", t, className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-[var(--radius-ficha)] bg-chalk-2", className)} aria-hidden />;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="plate-type text-[1.75rem] leading-[1.05] text-balance sm:text-[2.25rem]">{title}</h1>
        {sub ? <p className="mt-1.5 max-w-[60ch] text-[0.9375rem] text-steel">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/** Painel = folha da ficha: papel branco, pauta fina, sem sombra pesada. */
export function Panel({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("overflow-hidden rounded-[var(--radius-ficha)] border border-rule bg-paper", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
          <h2 className="text-[0.9375rem] font-bold">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className={pad ? "p-4" : undefined}>{children}</div>
    </section>
  );
}

export function Empty({ title, body, action, illustration }: { title: string; body: ReactNode; action?: ReactNode; illustration?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-ficha)] border border-dashed border-rule-strong bg-paper/60 p-6">
      {illustration}
      <h3 className="text-lg font-bold">{title}</h3>
      <div className="max-w-[52ch] text-[0.9375rem] text-steel">{body}</div>
      {action}
    </div>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "warn" | "error" | "done"; children: ReactNode; className?: string }) {
  const t = {
    info: "border-plate-blue/30 bg-plate-blue/5 text-iron",
    warn: "border-plate-yellow/60 bg-plate-yellow/12 text-iron",
    error: "border-plate-red/40 bg-plate-red/5 text-plate-red-ink",
    done: "border-plate-green/30 bg-plate-green/8 text-iron",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-[var(--radius-ficha)] border px-3.5 py-3 text-[0.9375rem]", t, className)}>
      {children}
    </div>
  );
}

/** Diálogo nativo (<dialog>) — foco preso e Esc de graça. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100%-1.5rem)] rounded-[10px] border border-rule bg-paper p-0 text-iron shadow-lift backdrop:bg-iron/45",
        wide ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {/* Fechar com 44×44 px que nunca encolhe com título longo; py-3 e -mr-2 mantêm a altura e o alinhamento do cabeçalho. */}
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <h2 id={titleId} className="min-w-0 text-lg font-bold">
          {title}
        </h2>
        <button type="button" onClick={onClose} className="-mr-2 grid size-11 shrink-0 place-items-center rounded hover:bg-chalk-2" aria-label="Fechar">
          <X className="size-5" />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 999, label, suffix }: { value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; label: string; suffix?: string }) {
  const v = value ?? 0;
  return (
    <div className="flex items-stretch overflow-hidden rounded-[var(--radius-ficha)] border border-rule-strong bg-paper">
      <button type="button" aria-label={`Diminuir ${label}`} onClick={() => onChange(Math.max(min, Math.round((v - step) * 100) / 100))} className="w-10 shrink-0 text-xl font-bold hover:bg-chalk-2">
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={value === null ? "" : String(value).replace(".", ",")}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          if (raw === "") return onChange(null);
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="num w-full min-w-0 border-x border-rule bg-transparent text-center text-lg font-bold focus:outline-none"
      />
      {suffix ? <span className="hidden" /> : null}
      <button type="button" aria-label={`Aumentar ${label}`} onClick={() => onChange(Math.min(max, Math.round((v + step) * 100) / 100))} className="w-10 shrink-0 text-xl font-bold hover:bg-chalk-2">
        +
      </button>
    </div>
  );
}

/** Botão só com ícone, com área de toque de 44 px e rótulo acessível obrigatório. */
export function IconButton({ label, children, className, tone = "neutral", ...rest }: { label: string; tone?: "neutral" | "danger" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "grid size-11 shrink-0 place-items-center rounded-[var(--radius-ficha)] transition-colors hover:bg-chalk-2 disabled:cursor-not-allowed disabled:opacity-30",
        tone === "danger" ? "text-plate-red-ink" : "text-iron",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface SheetAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "neutral" | "danger";
  hint?: string;
  disabled?: boolean;
}

/**
 * Folha de ações (lista de botões grandes num diálogo): o padrão do app para "mais opções".
 * Mais confiável no celular do que menus flutuantes.
 */
export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title: string; actions: SheetAction[] }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <ul className="-m-2 space-y-1">
        {actions.map((a) => (
          <li key={a.label}>
            <button
              type="button"
              disabled={a.disabled}
              onClick={() => {
                onClose();
                a.onSelect();
              }}
              className={cx(
                "flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-ficha)] px-3 py-2.5 text-left font-semibold transition-colors hover:bg-chalk disabled:cursor-not-allowed disabled:opacity-40",
                a.tone === "danger" ? "text-plate-red-ink" : "text-iron",
              )}
            >
              {a.icon ? <span className="grid size-5 shrink-0 place-items-center">{a.icon}</span> : null}
              <span className="min-w-0 flex-1">
                <span className="block">{a.label}</span>
                {a.hint ? <span className="block text-sm font-normal text-steel">{a.hint}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
