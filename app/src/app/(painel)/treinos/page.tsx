"use client";

import { Sparkles } from "lucide-react";
import { ProgramList } from "@/components/program/program-list";
import { LinkButton, PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { PLANS } from "@/lib/domain/plans";

export default function TreinosPage() {
  const { user } = useApp();
  return (
    <>
      <PageHeader
        title={user!.role === "coach" ? "Meus treinos" : "Fichas"}
        sub="A ficha ativa é a que aparece em Hoje. Edite qualquer exercício, série, repetição ou carga."
        actions={
          <LinkButton href="/treinos/novo" icon={<Sparkles className="size-4" />}>
            Nova ficha
          </LinkButton>
        }
      />
      <ProgramList ownerId={user!.id} basePath="/treinos" newHref="/treinos/novo" canExport={PLANS[user!.plan].export} />
    </>
  );
}
