"use client";

import { ErrorScreen } from "@/components/error-screen";
import { useApp } from "@/lib/app-context";

/** Erro numa tela do painel: o menu continua visível e os dados, intactos. */
export default function PainelError({ error, retry }: { error: unknown; retry: () => void }) {
  const { user } = useApp();
  return <ErrorScreen error={error} retry={retry} where="painel" home={user?.role === "coach" ? "/alunos" : "/hoje"} />;
}
