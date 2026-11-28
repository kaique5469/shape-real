"use client";

import { useState } from "react";
import { Check, CircleAlert, Copy } from "lucide-react";
import { Button, Textarea, cx } from "@/components/ui";

/**
 * A cópia falhou (sem permissão de área de transferência, navegador sem suporte): nada é registrado e o texto diz o que
 * fazer (rodada 3, R3-3). Aqui e não em domain/delivery.ts: este botão também está no questionário, que não carrega o
 * catálogo de exercícios (spec-m §5).
 */
export const TEXTO_COPIA_FALHOU = "Não deu para copiar. Use Enviar no WhatsApp ou segure o texto abaixo para copiar.";

/**
 * Copia um texto (mensagem do WhatsApp) e mostra "Copiado" por 2 s. `onCopied` só roda depois da cópia concluída.
 * Se a cópia falhar, `onCopied` não roda (nada é registrado como copiado) e uma linha logo abaixo do botão diz o que
 * fazer; `onFailed` avisa quem chama. Ícone e frase inteira: a falha não depende só da cor.
 * O botão e a linha ficam num bloco que ocupa o lugar do botão na fila (`flex-1`): a linha quebra embaixo do botão em
 * qualquer fila (com ou sem flex-wrap), sem empurrar o botão vizinho nem vazar a 360 px.
 * Na falha, a mensagem inteira (link incluído) aparece logo abaixo, num campo só de leitura que se seleciona no toque:
 * é o "texto abaixo" que a frase manda segurar (correção da revisão: os diálogos mostravam só uma prévia, sem o link).
 * `ph-no-capture`: a mensagem leva nome e o link com a ficha. `disabled`: envio ainda não liberado (nada a copiar).
 * Movido de transfer-share.tsx sem mudar o comportamento (fundação do questionário).
 */
export function CopyButton({ text, label = "Copiar mensagem", disabled = false, onCopied, onFailed }: { text: string; label?: string; disabled?: boolean; onCopied?: () => void; onFailed?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-1 flex-col">
      <Button
        variant="secondary"
        className="w-full whitespace-nowrap"
        disabled={disabled}
        icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        onClick={async () => {
          if (disabled) return;
          let ok = false;
          try {
            if (!navigator.clipboard?.writeText) throw new Error("sem área de transferência");
            await navigator.clipboard.writeText(text);
            ok = true;
          } catch {
            setCopied(false);
            setFailed(true);
            onFailed?.();
          }
          // Fora do try: um erro de quem chama (no registro do toque) nunca vira "Não deu para copiar".
          if (!ok) return;
          setFailed(false);
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copiado" : label}
      </Button>
      <CopiaFalhou failed={failed} text={text} />
    </div>
  );
}

/**
 * Embaixo do botão: a frase da falha numa região viva sempre montada (vazia, fica fora do fluxo e não abre espaço) e, na
 * falha, a mensagem inteira num campo só de leitura (o "texto abaixo" da frase).
 */
export function CopiaFalhou({ failed, text }: { failed: boolean; text: string }) {
  return (
    <>
      <span role="status" className={cx("mt-1.5 flex items-start gap-1.5 text-sm text-danger", !failed && "sr-only")}>
        {failed ? (
          <>
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">{TEXTO_COPIA_FALHOU}</span>
          </>
        ) : null}
      </span>
      {failed ? (
        <Textarea
          readOnly
          rows={4}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Mensagem completa para copiar"
          className="ph-no-capture mt-2 min-h-0 w-full resize-none"
        />
      ) : null}
    </>
  );
}
