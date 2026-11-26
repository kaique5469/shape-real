"use client";

import { useState } from "react";
import { Check, Copy, Download, MessageCircle, Printer } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { downloadText, programToCsv } from "@/lib/domain/export";
import { waLink, waPhone } from "@/lib/domain/format";
import { programToText } from "@/lib/domain/program-share";
import { track } from "@/lib/analytics";
import type { Profile, Program } from "@/lib/domain/types";

/** Quem assina e quem recebe a ficha compartilhada. */
export function shareNames(user: Profile | null, student?: Profile | null): { studentName?: string; studentLabel: string; coachName?: string; coachCref?: string } {
  const coach = user && user.role === "coach" && user.name.trim() && user.name !== "Personal" ? user.name : undefined;
  // O CREF só acompanha o nome: sem quem assine, a ficha não leva assinatura (programToText usa coachSignature).
  const coachCref = coach ? user?.cref?.trim() || undefined : undefined;
  return { studentName: student?.name, studentLabel: student?.sex === "F" ? "Aluna" : "Aluno", coachName: coach, coachCref };
}

export const fileSlug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "ficha";

/**
 * Ações de envio da ficha: WhatsApp (abre a conversa do aluno quando há telefone), copiar texto,
 * imprimir / salvar PDF e planilha.
 * `secondary`: quando o link para o app é a ação principal ao lado ("Outras formas" do editor), o texto pelo WhatsApp
 * vira "Mandar como texto" com o estilo secundário, para o painel ter um verde só.
 */
export function ProgramShare({
  program,
  student,
  canExport,
  onPrint,
  disabled,
  secondary = false,
  className,
}: {
  program: Program;
  student?: Profile | null;
  canExport: boolean;
  onPrint: () => void;
  disabled?: boolean;
  secondary?: boolean;
  className?: string;
}) {
  const { user } = useApp();
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);
  const text = programToText(program, shareNames(user, student));
  const direct = Boolean(waPhone(student?.phone));
  const waLabel = secondary ? "Mandar como texto" : "Enviar pelo WhatsApp";

  async function copy() {
    setCopyErr(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track("program_shared", { via: "copy" });
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopyErr(true);
    }
  }

  return (
    <div className={cx("no-print", className)}>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <a
          href={disabled ? undefined : waLink(text, student?.phone)}
          aria-disabled={disabled}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => !disabled && track("program_shared", { via: "whatsapp", direct })}
          className={cx(
            "col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-[6px] px-4 text-[0.9375rem] font-semibold",
            secondary ? "border border-rule-strong bg-paper text-iron hover:border-iron" : "bg-plate-green text-white hover:bg-plate-green-ink",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <MessageCircle className="size-4" aria-hidden /> {waLabel}
        </a>
        <Button variant="secondary" onClick={copy} disabled={disabled} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
          {copied ? "Copiado" : "Copiar texto"}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled}
          icon={<Printer className="size-4" />}
          onClick={() => {
            track("program_shared", { via: "print" });
            onPrint();
          }}
        >
          Imprimir / PDF
        </Button>
        {canExport ? (
          <Button
            variant="secondary"
            disabled={disabled}
            className="col-span-2"
            icon={<Download className="size-4" />}
            onClick={() => {
              downloadText(`ficha-${fileSlug(program.name)}.csv`, programToCsv(program));
              track("export_downloaded", { kind: "program" });
            }}
          >
            Planilha (Excel)
          </Button>
        ) : null}
      </div>
      {copyErr ? <p className="mt-2 text-sm text-plate-red-ink">Não consegui copiar automaticamente. Use “{waLabel}” ou “Imprimir / PDF”.</p> : null}
      {!disabled && !direct && student ? <p className="mt-2 text-sm text-steel">Sem WhatsApp cadastrado: o envio abre a sua lista de contatos. Cadastre o número em “Editar dados do aluno” para abrir direto na conversa.</p> : null}
    </div>
  );
}
