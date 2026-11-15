"use client";

import { HistoryView } from "@/components/views/history-view";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { PLANS } from "@/lib/domain/plans";

export default function HistoricoPage() {
  const { user } = useApp();
  return (
    <>
      <PageHeader title="Histórico" sub="Cada treino com séries, cargas e repetições." />
      <HistoryView userId={user!.id} editable canExport={PLANS[user!.plan].export} />
    </>
  );
}
