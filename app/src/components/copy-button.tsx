"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Copia um texto (mensagem do WhatsApp) e mostra "Copiado" por 2 s. `onCopied` só roda depois da cópia concluída.
 * Sem área de transferência, nada acontece: o botão do WhatsApp ao lado continua.
 * Movido de transfer-share.tsx sem mudar o comportamento (fundação do questionário).
 */
export function CopyButton({ text, label = "Copiar mensagem", onCopied }: { text: string; label?: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="flex-1 whitespace-nowrap"
      icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* sem área de transferência: o botão do WhatsApp continua */
        }
      }}
    >
      {copied ? "Copiado" : label}
    </Button>
  );
}
