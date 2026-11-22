"use client";

import { SendToCoach, usePendingWorkouts } from "@/components/transfer-share";
import { HistoryView } from "@/components/views/history-view";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { PLANS } from "@/lib/domain/plans";
import { useLoad } from "@/lib/hooks";

export default function HistoricoPage() {
  const { user, plan, repo, returnTo } = useApp();
  const { data, reload } = useLoad(() => repo.listSessions(user!.id), [user?.id, repo]);
  const pending = usePendingWorkouts(returnTo ? undefined : (data ?? undefined));
  return (
    <>
      <PageHeader
        title="Histórico"
        sub="Cada treino com séries, cargas e repetições."
        actions={pending.length ? <SendToCoach sessions={pending} onSent={() => void reload()} /> : undefined}
      />
      <HistoryView userId={user!.id} editable canExport={PLANS[plan].export} />
    </>
  );
}
