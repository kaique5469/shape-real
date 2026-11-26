"use client";

import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Button, Dialog } from "@/components/ui";
import { QTEXTO } from "@/lib/questionario-flow";

/**
 * "Deu certo?" (spec §5.4, passos 5 e 6): diálogo modal que aparece ao voltar do WhatsApp e pelo botão "Já enviei".
 * O foco vai para o título; Esc (e o X do diálogo) valem "Não enviou". "Não enviou: tentar de novo" é uma âncora com o
 * link já pronto: o WhatsApp abre no próprio toque (sem bloqueio no Safari). O rascunho só some em "Sim, enviei" (quem
 * chama). Usa o `Dialog` do app (ui.tsx): todo diálogo herda o papel claro (U7, regra f).
 */
export function DeuCerto({
  open,
  personal,
  href,
  texto,
  offline,
  onSim,
  onTentar,
  onCopiar,
  onFechar,
}: {
  open: boolean;
  personal: string;
  /** Link do WhatsApp com a mensagem pronta (null enquanto o pacote é montado de novo). */
  href: string | null;
  /** Mensagem completa, para "Copiar mensagem". */
  texto: string | null;
  offline: boolean;
  onSim: () => void;
  onTentar: () => void;
  onCopiar: () => void;
  /** Esc ou toque fora: "Não enviou", sem abrir o WhatsApp. */
  onFechar: () => void;
}) {
  const conteudo = useRef<HTMLDivElement>(null);

  // O diálogo do app (ui.tsx) põe o foco no primeiro botão ao abrir; a spec pede o título (o leitor de tela lê a
  // pergunta antes das opções). O efeito do filho roda antes do showModal do pai: o foco vai no próximo tique.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const h = conteudo.current?.closest("dialog")?.querySelector<HTMLElement>("h2");
      if (!h) return;
      h.tabIndex = -1;
      h.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Dialog open={open} onClose={onFechar} title={QTEXTO.deuCertoTitulo}>
      <div ref={conteudo} className="space-y-4">
        <p className="text-steel">{QTEXTO.deuCertoTexto(personal)}</p>
        <div className="grid gap-2">
          <Button size="lg" className="w-full" onClick={onSim}>
            {QTEXTO.simEnviei}
          </Button>
          {href && !offline ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onTentar}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-4 font-semibold text-iron hover:border-iron"
            >
              <MessageCircle className="size-4" aria-hidden /> {QTEXTO.tentarDeNovo}
            </a>
          ) : (
            <Button variant="secondary" className="h-12 w-full" onClick={onFechar}>
              {QTEXTO.tentarDeNovo}
            </Button>
          )}
          {offline ? <p className="text-[0.9375rem] text-steel">{QTEXTO.semInternet}</p> : null}
          {texto ? (
            <div className="flex">
              <CopyButton text={texto} label={QTEXTO.copiar} onCopied={onCopiar} />
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
