import type { ReactNode } from "react";
import { CheckCheck, CircleDashed, Copy, Send } from "lucide-react";

import { cx } from "@/lib/cx";
import type { DeliveryIcon } from "@/lib/domain/delivery";

/**
 * Linhas de estado de envio (U2 §3.6): sempre texto + ícone (`aria-hidden`), nunca só cor.
 * Tom neutro (`steel`) para "Ainda não enviado", "Envio iniciado" e "Mensagem copiada"; o tom de confirmação
 * (`done-ink` + CheckCheck) só para "está com a ficha atual", que tem evidência (o treino trouxe a versão de volta).
 */
const ICON = { pendente: CircleDashed, whatsapp: Send, copia: Copy, confirmado: CheckCheck } as const satisfies Record<DeliveryIcon, unknown>;
const TONE: Record<DeliveryIcon, string> = { pendente: "text-steel", whatsapp: "text-steel", copia: "text-steel", confirmado: "text-done-ink" };
/**
 * Dentro de `data-surface="dark"` (resumo do treino): texto chalk em qualquer estado. É prop, e não `className`,
 * porque no CSS do Tailwind `text-steel` vem depois de `text-chalk/…` (ordem alfabética) e ganharia.
 */
const ON_DARK = "text-chalk/85";

/**
 * Ícone + texto de um estado. É um `<span>` (cabe dentro de um botão: no Histórico, a linha curta faz parte do
 * nome acessível da linha fechada). O tamanho do ícone acompanha a letra de quem chama (`text-xs`, `text-sm`).
 */
export function DeliveryLine({ icon, children, id, className, onDark = false }: { icon: DeliveryIcon; children: ReactNode; id?: string; className?: string; onDark?: boolean }) {
  const Icon = ICON[icon];
  return (
    <span id={id} data-delivery={icon} className={cx("flex items-start gap-1.5", onDark ? ON_DARK : TONE[icon], className)}>
      <Icon className="mt-[0.2em] size-[1.05em] shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/**
 * Região `role="status"` SEMPRE montada; só o texto muda (leitor de tela pode não anunciar uma região viva que
 * já nasce com texto). Vazia, não ocupa espaço. O foco não se move. `className` vale para a linha com texto.
 */
export function StatusRegion({ text, icon, className, onDark = false }: { text: string | null; icon?: DeliveryIcon; className?: string; onDark?: boolean }) {
  return (
    <div role="status">
      {text ? (
        icon ? (
          <DeliveryLine icon={icon} onDark={onDark} className={cx("text-sm", className)}>
            {text}
          </DeliveryLine>
        ) : (
          <p className={cx("text-sm", onDark ? ON_DARK : "text-steel", className)}>{text}</p>
        )
      ) : null}
    </div>
  );
}
