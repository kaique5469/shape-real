import { Trophy } from "lucide-react";

import { cx } from "@/lib/cx";
import { recordText } from "@/lib/ui/tone";

/**
 * Marca única de recorde (U7 §3.3): sempre troféu + palavra (visível ou só para leitor de tela), em `record`.
 * Não é interativa. `data-record` marca o elemento para a verificação de cor no navegador.
 *  - `variant="pill"` (padrão): selo "3 recordes". Com `compact`, mostra só o número e a palavra fica `sr-only`.
 *    Com `count` ≤ 0 (ou inválido), não renderiza nada.
 *  - `variant="icon"`: só o troféu, com "recorde" em `sr-only`. `label={false}` tira o `sr-only` quando o texto
 *    ao lado já diz "recorde" (ex.: "Recordes recentes", "N recordes pessoais").
 */
export function RecordMark({
  count = 1,
  variant = "pill",
  compact = false,
  label = true,
  className,
}: {
  count?: number;
  variant?: "pill" | "icon";
  compact?: boolean;
  label?: boolean;
  className?: string;
}) {
  if (variant === "icon") {
    return (
      <span data-record className={cx("inline-flex shrink-0 items-center text-record", className)}>
        <Trophy className="size-4" aria-hidden />
        {label ? <span className="sr-only">recorde</span> : null}
      </span>
    );
  }
  const text = recordText(count);
  if (!text) return null;
  return (
    <span data-record className={cx("inline-flex items-center gap-1 rounded bg-record px-1.5 py-0.5 text-xs font-bold text-on-record", className)}>
      <Trophy className="size-3" aria-hidden />
      {compact ? (
        <>
          <span className="num">{count}</span>
          <span className="sr-only">{count === 1 ? " recorde" : " recordes"}</span>
        </>
      ) : (
        <span>{text}</span>
      )}
    </span>
  );
}
