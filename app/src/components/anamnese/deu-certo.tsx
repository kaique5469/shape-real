"use client";

import { useEffect, useId, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui";
import { QTEXTO } from "@/lib/questionario-flow";

/**
 * "Deu certo?" (spec §5.4, passos 5 e 6): diálogo modal que aparece ao voltar do WhatsApp e pelo botão "Já enviei".
 * O foco vai para o título; Esc vale "Não enviou". "Não enviou: tentar de novo" é uma âncora com o link já pronto: o
 * WhatsApp abre no próprio toque (sem bloqueio no Safari). O rascunho só some em "Sim, enviei" (quem chama).
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
  const ref = useRef<HTMLDialogElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const tituloId = useId();
  const textoId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal põe o foco no primeiro botão; a spec pede o título (o leitor de tela lê a pergunta antes das opções).
      titulo.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-surface="light"
      aria-labelledby={tituloId}
      aria-describedby={textoId}
      onCancel={(e) => {
        e.preventDefault();
        onFechar();
      }}
      onClick={(e) => e.target === ref.current && onFechar()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-[10px] border border-rule bg-paper p-0 text-iron shadow-lift backdrop:bg-iron/45"
    >
      <div className="space-y-4 p-5">
        <h2 id={tituloId} ref={titulo} tabIndex={-1} className="text-[1.375rem] font-bold leading-tight outline-none focus-visible:outline-2">
          {QTEXTO.deuCertoTitulo}
        </h2>
        <p id={textoId} className="text-steel">
          {QTEXTO.deuCertoTexto(personal)}
        </p>
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
    </dialog>
  );
}
