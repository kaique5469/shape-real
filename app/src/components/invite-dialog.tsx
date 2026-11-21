"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { firstName, waLink } from "@/lib/domain/format";
import type { Invite, Profile } from "@/lib/domain/types";

/**
 * Convite do personal. Geral: qualquer aluno cria a conta e fica vinculado.
 * De um cadastro (`student`): quem aceitar recebe a ficha, a dieta, os treinos e as medidas que o personal já lançou.
 */
export function InviteDialog({ open, onClose, invite, student }: { open: boolean; onClose: () => void; invite: Invite | null; student?: Profile | null }) {
  const [copied, setCopied] = useState(false);
  const link = invite ? `${typeof window !== "undefined" ? location.origin : ""}/convite/${invite.code}` : "";
  const name = student ? firstName(student.name) : null;
  const text = !invite
    ? ""
    : name
      ? `Oi, ${name}! Sua ficha de treino já está no Shape Real. Crie sua conta por este link para ver o treino, registrar as cargas e acompanhar a evolução: ${link}`
      : `Oi! Vou acompanhar seus treinos pelo Shape Real. Crie sua conta por este link: ${link} (ou use o código ${invite.code}).`;

  return (
    <Dialog open={open} onClose={onClose} title={name ? `Convidar ${name} para o app` : "Convite para aluno"}>
      {invite ? (
        <div className="space-y-4">
          <p className="text-[0.9375rem] text-steel">
            {name
              ? `Ao criar a conta por este link, ${name} recebe a ficha, a dieta, os treinos e as medidas que você já registrou. O link vale por 7 dias e serve só para esta pessoa.`
              : "Envie o link ou o código. Ele vale por 7 dias e serve para um aluno."}
          </p>
          <p className="plate-type rounded-[8px] border-2 border-dashed border-rule-strong bg-chalk py-4 text-center text-[2.2rem] tracking-[0.25em]">{invite.code}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={waLink(text, student?.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] bg-plate-green px-4 font-semibold text-white hover:bg-plate-green-ink"
            >
              <MessageCircle className="size-4" aria-hidden /> Enviar no WhatsApp
            </a>
            <Button
              variant="secondary"
              className="flex-1 whitespace-nowrap"
              icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={async () => {
                await navigator.clipboard?.writeText(text).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copiado" : "Copiar mensagem"}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
