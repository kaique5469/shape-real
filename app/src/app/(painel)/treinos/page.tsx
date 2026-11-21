"use client";

import { Plus } from "lucide-react";
import { ProgramList } from "@/components/program/program-list";
import { LinkButton, PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { PLANS } from "@/lib/domain/plans";

export default function TreinosPage() {
  const { user, plan } = useApp();
  const coach = user!.role === "coach";
  return (
    <>
      <PageHeader
        title={coach ? "Modelos de ficha" : "Fichas"}
        sub={
          coach
            ? "Suas fichas reutilizáveis. Monte uma vez e aplique a quantos alunos quiser, ajustando cargas e detalhes em cada um."
            : "A ficha ativa é a que aparece em Hoje. Edite qualquer exercício, série, repetição ou carga."
        }
        actions={
          <LinkButton href="/treinos/novo" icon={<Plus className="size-4" />}>
            {coach ? "Novo modelo" : "Nova ficha"}
          </LinkButton>
        }
      />
      <ProgramList ownerId={user!.id} basePath="/treinos" newHref="/treinos/novo" canExport={PLANS[plan].export} />
    </>
  );
}
