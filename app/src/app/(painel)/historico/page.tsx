"use client";

import { useState } from "react";
import { SendToCoach, usePendingWorkouts, useSessionDelivery } from "@/components/transfer-share";
import { HistoryView } from "@/components/views/history-view";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { firstName } from "@/lib/domain/format";
import { PLANS } from "@/lib/domain/plans";
import { useLoad } from "@/lib/hooks";

export default function HistoricoPage() {
  const { user, plan, repo, returnTo } = useApp();
  const { data, reload } = useLoad(() => repo.listSessions(user!.id), [user?.id, repo]);
  // Depois de um toque de envio (cabeçalho ou linha), relê o aparelho: pendentes e estado de cada treino.
  const [tick, setTick] = useState(0);
  // O botão do cabeçalho continua montado depois do envio: o diálogo não fecha sozinho quando os pendentes somem.
  const [headerSent, setHeaderSent] = useState(false);
  const sessions = returnTo ? undefined : (data ?? undefined);
  const { toSend: pending } = usePendingWorkouts(sessions, tick);
  const delivery = useSessionDelivery(sessions, tick);
  const coach = user?.remoteCoach;
  return (
    <>
      <PageHeader
        title="Histórico"
        sub="Cada treino com séries, cargas e repetições."
        actions={
          pending.length || headerSent ? (
            <SendToCoach
              sessions={pending}
              where="historico"
              onSent={() => {
                setHeaderSent(true);
                setTick((t) => t + 1);
              }}
            />
          ) : undefined
        }
      />
      <HistoryView
        userId={user!.id}
        editable
        canExport={PLANS[plan].export}
        // Treino excluído sai também dos pendentes do cabeçalho (senão o botão mandaria um treino que não existe mais).
        onDeleted={() => void reload()}
        delivery={delivery.enabled && coach ? { stateOf: delivery.stateOf, coachFirst: firstName(coach.name), onResent: () => setTick((t) => t + 1) } : undefined}
      />
    </>
  );
}
