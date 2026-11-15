"use client";

import { DietView } from "@/components/views/diet-view";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";

export default function DietaPage() {
  const { user } = useApp();
  return (
    <>
      <PageHeader title="Dieta" sub="Metas calculadas para o seu objetivo, cardápio e análise do que você comeu." />
      <DietView owner={user!} mode="self" />
    </>
  );
}
