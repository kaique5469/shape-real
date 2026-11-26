"use client";

import type { ReactNode } from "react";
import { CalendarClock, CalendarX, CheckCircle2 } from "lucide-react";
import { DeliveryLine } from "@/components/delivery-status";
import { Badge, PageHeader, cx } from "@/components/ui";
import { fichaDeliveryLines } from "@/lib/domain/delivery";
import { firstName, type Validity } from "@/lib/domain/format";
import type { Profile } from "@/lib/domain/types";
import { validityIcon, validityTone } from "@/lib/ui/tone";
import { useFichaDelivery } from "@/lib/use-ficha-link";

/**
 * Cabeçalho do editor de fichas (U5 §3.2): de quem é a ficha e o que isso muda, antes dos campos.
 * Ordem: título (`h1`) com a linha de situação → faixa de segurança da anamnese (vaga; o conteúdo vem de lá) →
 * nota → linha de envio. Tudo `no-print`: o papel tem o próprio cabeçalho.
 */
export function FichaContextHeader({ title, status, safety, note, delivery }: { title: string; status: ReactNode; safety?: ReactNode; note?: string | null; delivery?: ReactNode }) {
  return (
    // O PageHeader traz mb-6 para telas soltas; aqui o espaço é o do grupo.
    <div className="no-print space-y-3 [&>header]:mb-0">
      <PageHeader title={title} sub={status} />
      {safety}
      {note ? <p className="max-w-[60ch] text-sm text-iron">{note}</p> : null}
      {delivery}
    </div>
  );
}

const VALIDITY_ICON = { CalendarX, CalendarClock } as const;

/**
 * Linha de situação: selo, sistema, validade (atenção = texto iron + ícone warn-ink, nunca só cor) e "Tornar ativa"
 * com 44 px de altura quando a ficha está inativa e não é modelo.
 */
export function FichaStatusLine({ badge, system, validity, onActivate }: { badge: "modelo" | "ativa" | "inativa"; system: string; validity: Validity | null; onActivate?: () => void }) {
  const vIcon = validityIcon(validity);
  const VIcon = vIcon ? VALIDITY_ICON[vIcon] : null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {badge === "modelo" ? (
        <Badge>Modelo</Badge>
      ) : badge === "ativa" ? (
        <Badge tone="done">
          <CheckCircle2 className="size-3" aria-hidden /> Ativa
        </Badge>
      ) : (
        <Badge>Inativa</Badge>
      )}
      <span>{system}</span>
      {validity ? (
        <span className={cx("whitespace-nowrap font-semibold", validityTone(validity) === "warn" && "text-iron")}>
          {VIcon ? <VIcon className="mr-1 inline-block size-4 align-[-0.1875rem] text-warn-ink" aria-hidden /> : null}
          {validity.label}
        </span>
      ) : null}
      {onActivate ? (
        <button type="button" onClick={onActivate} className="min-h-11 font-semibold text-iron underline">
          Tornar ativa
        </button>
      ) : null}
    </span>
  );
}

/**
 * Linha de envio do cabeçalho: a manchete (M) da U2b para a ficha ativa de um aluno real, no modo local. Nada
 * quando a situação é desconhecida. `version` relê o aparelho (depois de salvar e de cada envio feito na tela).
 */
export function EditorDeliveryLine({ student, version }: { student: Profile; version: number }) {
  const d = useFichaDelivery(student, version);
  const lines = d ? fichaDeliveryLines(d, firstName(student.name)) : null;
  if (!lines?.page) return null;
  return (
    <p className="text-sm">
      <DeliveryLine icon={lines.pageIcon ?? "pendente"}>{lines.page}</DeliveryLine>
    </p>
  );
}

/** Linhas do painel de envio (M com ícone e D), no máximo duas, como no diálogo de envio da página do aluno. */
export function PanelDeliveryLines({ student, version, className }: { student: Profile; version: number; className?: string }) {
  const d = useFichaDelivery(student, version);
  const lines = d ? fichaDeliveryLines(d, firstName(student.name)) : null;
  if (!lines?.dialog.length) return null;
  return (
    <div className={cx("space-y-1 text-sm", className)}>
      <DeliveryLine icon={lines.dialogIcon ?? "pendente"}>{lines.dialog[0]}</DeliveryLine>
      {/* Alinhado ao texto da manchete (ícone de 1,05em + o vão da DeliveryLine). */}
      {lines.dialog[1] ? <p className="pl-[calc(1.05em+0.375rem)] text-steel">{lines.dialog[1]}</p> : null}
    </div>
  );
}
