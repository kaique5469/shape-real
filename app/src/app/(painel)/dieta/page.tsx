"use client";

import { DietView } from "@/components/views/diet-view";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";

export default function DietaPage() {
  const { user } = useApp();
  return (
    <>
      <PageHeader title="Dieta" sub="Seu cardápio e as metas do dia. Você também pode conferir o que comeu." />
      <DietView owner={user!} mode="self" />
    </>
  );
}
