"use client";

// esqueleto: implementado pelo track E
import type { ReactElement } from "react";
import type { Profile } from "@/lib/domain/types";

/**
 * Pedir o questionário pelo WhatsApp (spec §5.3): link montado antes do toque, WhatsApp aberto no toque. Com aluno de
 * exemplo (`ehExemplo`), nenhum pedido real e nenhum evento. Raiz com `ph-no-capture`.
 */
export function PedirQuestionario(props: { open: boolean; onClose: () => void; student: Profile; de: "cadastro" | "aluno" | "passos" | "lembrete"; reavaliacao?: "saude" | "tudo"; onPedido?: (p: Profile) => void }): ReactElement | null {
  return null;
}
