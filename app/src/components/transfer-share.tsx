"use client";

import { useId, useState } from "react";
import { MessageCircle, Smartphone } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { DeliveryLine, StatusRegion } from "@/components/delivery-status";
import { Alert, Button, Dialog, Skeleton } from "@/components/ui";
import type { FichaLinkWhere } from "@/lib/analytics";
import { fichaDeliveryLines, prepStatusText, type PrepVia } from "@/lib/domain/delivery";
import { firstName, waLink } from "@/lib/domain/format";
import type { Profile } from "@/lib/domain/types";
import { useFichaDelivery, useFichaLink } from "@/lib/use-ficha-link";

/** Envio da ficha por link e a situação do envio (U2b; hooks em @/lib/use-ficha-link). */
export { useFichaDelivery, useFichaLink };

/**
 * Aluno → personal (pendência, estado de cada treino e o envio): em send-to-coach.tsx desde a rodada 3 (Fundação).
 * Reexportados aqui para nenhum importador mudar.
 */
export { SendToCoach, usePendingWorkouts, useSessionDelivery, type EnvioVia, type PendingWorkouts, type TreinoPreparado } from "@/components/send-to-coach";

/**
 * Personal → celular do aluno. Monta um link com a ficha ativa e a dieta (`useFichaLink`); o aluno abre e passa a
 * treinar pelo app no próprio celular, sem cadastro. O toque grava o registro único do envio
 * (`sr:sent:{aluno}:ficha`, com as versões que foram) e o diálogo mostra o que o aparelho viu: "Envio iniciado",
 * "Mensagem copiada", nunca que a mensagem saiu ou chegou (U2 §3.5 personal 1–2).
 * `showLines="page"`: uma linha de situação sob o botão (M da U2 §3.3), ligada a ele por `aria-describedby`.
 * `open`/`onOpenChange` + `hideTrigger`: o diálogo aberto por outra tela (passo "Enviar a ficha" dos próximos passos).
 */
export function SendToStudent({
  student,
  where,
  showLines = "none",
  disabled,
  className,
  variant = "secondary",
  version = 0,
  onSent,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  student: Profile;
  /** Medição (`ficha_link_sent.where`). */
  where: FichaLinkWhere;
  showLines?: "page" | "none";
  disabled?: boolean;
  className?: string;
  variant?: "primary" | "secondary";
  /** Contador que sobe quando a ficha ou a dieta podem ter mudado fora daqui (relê a linha de situação). */
  version?: number;
  /** Depois do toque: canal e a hora gravada no registro. */
  onSent?: (via: PrepVia, at: string) => void;
  /** Diálogo controlado por quem chama (com `onOpenChange`). Sem a prop, o próprio botão abre. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Só o diálogo, sem o botão (quem chama tem o próprio gatilho). */
  hideTrigger?: boolean;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setOpenState(o);
    onOpenChange?.(o);
  };
  const [tick, setTick] = useState(0);
  const first = firstName(student.name);
  const { estado, erro, entrega, toque, aoEnviar } = useFichaLink(student, open, { where });
  // `version` (contador de quem chama) e `tick` (toques aqui) só sobem: a soma muda sempre que um dos dois muda.
  const delivery = useFichaDelivery(student, version + tick);
  const lineId = useId();
  const pageLine = showLines === "page" && delivery ? fichaDeliveryLines(delivery, first) : null;
  const dialogLines = entrega ? fichaDeliveryLines(entrega, first) : null;
  const empty = estado && !estado.programa && !estado.dieta;

  function sent(via: PrepVia) {
    const t = aoEnviar(via);
    if (!t) return;
    setTick((n) => n + 1);
    onSent?.(t.via, t.at);
  }

  return (
    <>
      {hideTrigger ? null : (
        <Button variant={variant} className={className} disabled={disabled} icon={<Smartphone className="size-4" />} onClick={() => setOpen(true)} aria-describedby={pageLine?.page ? lineId : undefined}>
          Enviar para o celular de {first}
        </Button>
      )}
      {!hideTrigger && pageLine?.page ? (
        <p className="mt-1.5 text-sm">
          <DeliveryLine id={lineId} icon={pageLine.pageIcon ?? "pendente"}>
            {pageLine.page}
          </DeliveryLine>
        </p>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Enviar para o celular de ${first}`}>
        <div className="space-y-4">
          <p className="text-[0.9375rem] text-steel">
            {first} abre o link no celular {student.sex === "F" ? "dela" : "dele"} e passa a treinar pelo app, sem cadastro. Depois de cada treino, {student.sex === "F" ? "ela" : "ele"} manda o resultado de volta e você registra no painel com um toque.
          </p>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          {!estado && !erro ? <Skeleton className="h-24" /> : null}
          {estado ? (
            <>
              <ul className="ruled rounded-[var(--radius-ficha)] border border-rule bg-chalk text-[0.9375rem]">
                <li className="flex justify-between gap-3 px-3 py-2">
                  <span className="text-steel">Ficha</span>
                  <span className="min-w-0 truncate text-right font-semibold">{estado.programa?.name ?? "nenhuma ativa"}</span>
                </li>
                <li className="flex justify-between gap-3 px-3 py-2">
                  <span className="text-steel">Dieta</span>
                  <span className="min-w-0 truncate text-right font-semibold">{estado.dieta?.name ?? "não enviada"}</span>
                </li>
              </ul>
              {empty ? (
                <Alert tone="warn">Monte a ficha ou a dieta de {first} antes de enviar.</Alert>
              ) : (
                <>
                  {/* Situação de antes do toque: manchete (com ícone) e detalhe, no máximo duas linhas. Depois do toque
                      sai de cena: "ainda não foi para o app" ao lado de "Envio iniciado" se contradizia. */}
                  {!toque && dialogLines?.dialog.length ? (
                    <div className="space-y-1 text-sm">
                      <DeliveryLine icon={dialogLines.dialogIcon ?? "pendente"}>{dialogLines.dialog[0]}</DeliveryLine>
                      {/* Alinhado ao texto da manchete (ícone de 1,05em + o vão da DeliveryLine). */}
                      {dialogLines.dialog[1] ? <p className="pl-[calc(1.05em+0.375rem)] text-steel">{dialogLines.dialog[1]}</p> : null}
                    </div>
                  ) : null}
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={waLink(estado.texto, student.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => sent("whatsapp")}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] bg-plate-green px-4 font-semibold text-white hover:bg-plate-green-ink"
                      >
                        <MessageCircle className="size-4" aria-hidden /> Enviar no WhatsApp
                      </a>
                      <CopyButton text={estado.texto} onCopied={() => sent("copy")} />
                    </div>
                    {/* Montada junto com os botões, antes de qualquer toque; só o texto muda. */}
                    <StatusRegion className="mt-2" text={toque ? prepStatusText(toque.via, toque.at, first, "personal") : null} icon={toque?.via === "copy" ? "copia" : "whatsapp"} />
                  </div>
                  {/* R3-17: o que vai no link e quem consegue ler. */}
                  <p className="text-sm text-steel">{estado.aviso}</p>
                  <p className="text-sm text-steel">Mudou a ficha ou a dieta? Envie de novo: o celular de {first} atualiza, e os treinos já registrados continuam lá.</p>
                </>
              )}
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
