"use client";

// esqueleto: implementado pelo track E
import type { ReactElement } from "react";
import type { Diferenca, DiffLimitacoes, Escolhas } from "@/lib/domain/anamnese-types";

/** Escolha por campo entre o cadastro e a resposta (spec §8.2), na recepção das respostas. Raiz com `ph-no-capture`. */
export function ConferirDiferencas(props: { diferencas: Diferenca[]; limitacoes?: DiffLimitacoes; value: Escolhas; onChange: (v: Escolhas) => void }): ReactElement | null {
  return null;
}
