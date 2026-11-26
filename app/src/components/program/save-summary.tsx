"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Loader2, MessageCircle, X } from "lucide-react";
import { DeliveryLine, StatusRegion } from "@/components/delivery-status";
import { Alert, Button, IconButton, cx } from "@/components/ui";
import type { FichaLinkWhere } from "@/lib/analytics";
import { prepStatusText, type DeliveryIcon, type PrepVia } from "@/lib/domain/delivery";
import { firstName, waLink } from "@/lib/domain/format";
import type { Profile } from "@/lib/domain/types";
import { useFichaLink } from "@/lib/use-ficha-link";

/**
 * Barra depois de salvar a ficha (U5 §3.6 e §3.8). Fica no lugar da barra fixa de "não salvo".
 *  - O contêiner fica SEMPRE montado (vazio quando fechada): a região `role="status"` precisa existir antes do
 *    texto para o leitor de tela anunciar. Só o título e a frase ficam na região viva; os botões ficam fora.
 *  - Aberta, é uma `section` com o título como nome. `focusRequest` (contador) leva o foco ao título: quem chama
 *    sobe o contador quando o foco estava num controle que sumiu ("Salvar ficha", o envio da própria barra).
 *  - "Fechar resumo" devolve o foco ao contêiner (o botão some), para o próximo Tab seguir dali.
 *  - Sem animação.
 */
export function PostSaveBar({
  open,
  title,
  text,
  textIcon,
  action,
  focusRequest,
  onClose,
}: {
  open: boolean;
  title: string;
  /** Frase do próximo passo (ou o estado depois de um envio pela barra). */
  text?: string | null;
  /** Com ícone, a frase vira uma linha de estado (texto + ícone, nunca só cor). */
  textIcon?: DeliveryIcon;
  /** O controle de envio, fora da região viva. */
  action?: ReactNode;
  focusRequest: number;
  onClose: () => void;
}) {
  const titleId = useId();
  const box = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const handled = useRef(focusRequest);

  useEffect(() => {
    if (focusRequest === handled.current) return;
    handled.current = focusRequest;
    // Sem rolar: a barra é fixa no rodapé; focar com rolagem fazia a página pular ~600 px depois de salvar.
    if (open) titleRef.current?.focus({ preventScroll: true });
  }, [focusRequest, open]);

  return (
    <section
      ref={box}
      tabIndex={-1}
      aria-labelledby={open ? titleId : undefined}
      className={cx("outline-none", open && "rounded-[var(--radius-ficha)] border border-rule bg-paper p-3 shadow-lift")}
    >
      <div className="flex items-start gap-2">
        <div role="status" className="min-w-0 flex-1 self-center">
          {open ? (
            <>
              <p id={titleId} ref={titleRef} tabIndex={-1} className="text-[0.9375rem] font-bold leading-snug">
                {title}
              </p>
              {text ? (
                textIcon ? (
                  <DeliveryLine icon={textIcon} className="mt-0.5 text-sm">
                    {text}
                  </DeliveryLine>
                ) : (
                  <p className="mt-0.5 text-sm text-steel">{text}</p>
                )
              ) : null}
            </>
          ) : null}
        </div>
        {open ? (
          <IconButton
            label="Fechar resumo"
            className="-my-1.5 -mr-1.5"
            onClick={() => {
              box.current?.focus({ preventScroll: true });
              onClose();
            }}
          >
            <X className="size-5" />
          </IconButton>
        ) : null}
      </div>
      {open && action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

/**
 * Envio da ficha por link no editor (anamnese §8.6, na forma mínima): "Enviar link no WhatsApp" (âncora com o link
 * já montado, para o toque abrir o WhatsApp na hora) e "Copiar mensagem". O link é montado por `useFichaLink`
 * quando `enabled` liga e de novo quando `version` muda (depois de cada salvamento: um link montado antes levaria a
 * versão velha); até lá os dois ficam desabilitados. O toque grava o registro único `sr:sent:{aluno}:ficha` (no
 * hook, sem gravar nada na ficha) e mostra o que o aparelho viu ("Envio iniciado às 14:02…"), nunca que chegou.
 * `compact` (barra depois de salvar): os dois numa linha, "Copiar" só com ícone abaixo de sm (nome acessível igual).
 * `status={false}`: quem chama mostra o estado do toque (a barra mostra na própria região viva).
 */
export function SendFichaLink({
  student,
  where,
  enabled,
  version = 0,
  compact = false,
  status = true,
  onSent,
  className,
}: {
  student: Profile;
  where: FichaLinkWhere;
  enabled: boolean;
  version?: number;
  compact?: boolean;
  status?: boolean;
  onSent?: (via: PrepVia, at: string) => void;
  className?: string;
}) {
  const first = firstName(student.name);
  const { estado, erro, toque, aoEnviar } = useFichaLink(student, enabled, { where, version });
  const [copyFailed, setCopyFailed] = useState(false);
  const ready = enabled && Boolean(estado?.programa);
  const building = enabled && !estado && !erro;

  function sent(via: PrepVia) {
    const t = aoEnviar(via);
    if (t) onSent?.(t.via, t.at);
  }

  return (
    <div className={className}>
      {erro && enabled ? (
        <Alert tone="error" className="mb-2">
          {erro}
        </Alert>
      ) : null}
      <div className={cx("flex gap-2", !compact && "flex-wrap")}>
        <a
          href={ready ? waLink(estado!.texto, student.phone) : undefined}
          // Sem href (link ainda não montado ou envio desligado) o <a> não é link: o papel e o estado ficam explícitos.
          role={ready ? undefined : "link"}
          aria-disabled={!ready || undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!ready) return e.preventDefault();
            sent("whatsapp");
          }}
          className={cx(
            "inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] bg-plate-green px-4 font-semibold text-white hover:bg-plate-green-ink",
            // Na barra (uma linha, "Copiar" só com ícone) o link pode encolher; no painel ele mantém o texto inteiro e
            // "Copiar mensagem" desce para a linha de baixo quando os dois não cabem (a 360 px o texto era cortado).
            compact && "min-w-0",
            !ready && "pointer-events-none opacity-50",
          )}
        >
          {building ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MessageCircle className="size-4" aria-hidden />} Enviar link no WhatsApp
        </a>
        <CopyMessage text={ready ? estado!.texto : null} compact={compact} onCopied={() => sent("copy")} onFailed={setCopyFailed} />
      </div>
      {copyFailed ? <p className="mt-2 text-sm text-steel">Não consegui copiar automaticamente. Use “Enviar link no WhatsApp”.</p> : null}
      {status ? <StatusRegion className="mt-2" text={toque ? prepStatusText(toque.via, toque.at, first, "personal") : null} icon={toque?.via === "copy" ? "copia" : "whatsapp"} /> : null}
    </div>
  );
}

function CopyMessage({ text, compact, onCopied, onFailed }: { text: string | null; compact: boolean; onCopied: () => void; onFailed: (failed: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      variant="secondary"
      disabled={!text}
      className={cx("whitespace-nowrap", compact ? "w-11 shrink-0 px-0! sm:w-auto sm:px-4!" : "flex-1")}
      icon={copied ? <Check className="size-4 shrink-0" aria-hidden /> : <Copy className="size-4 shrink-0" aria-hidden />}
      onClick={async () => {
        if (!text) return;
        onFailed(false);
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onCopied();
        } catch {
          onFailed(true);
        }
      }}
    >
      {/* Na barra estreita só o ícone aparece; o nome acessível continua o texto. */}
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{copied ? "Copiado" : "Copiar mensagem"}</span>
    </Button>
  );
}
