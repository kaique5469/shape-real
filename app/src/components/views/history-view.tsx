"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, Trash2 } from "lucide-react";
import { DeliveryLine, StatusRegion } from "@/components/delivery-status";
import { RecordMark } from "@/components/record-mark";
import { SendToCoach } from "@/components/transfer-share";
import { Alert, Button, Dialog, Empty, LinkButton, Skeleton, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtNum, useLoad } from "@/lib/hooks";
import { completedSets, volumeDaSessao, weekStart } from "@/lib/domain/progression";
import { activeMinutes } from "@/lib/domain/session-time";
import { sessionDeliveryText, type SessionDelivery } from "@/lib/domain/delivery";
import { downloadText, sessionsToCsv } from "@/lib/domain/export";
import { track } from "@/lib/analytics";
import type { Session } from "@/lib/domain/types";

const FEELING = ["", "Péssimo", "Ruim", "Ok", "Bom", "Ótimo"];

/**
 * Estado de envio por treino (U2 §3.2), só no aparelho do aluno com personal remoto no modo local (quem chama
 * decide; sem a prop, nada de envio aparece: personal, "Ver como aluno", aluno sozinho, nuvem).
 */
export interface HistoryDelivery {
  stateOf(id: string): SessionDelivery | null;
  /** Primeiro nome do personal ("Enviar de novo para Rafael"). */
  coachFirst: string;
  /** Depois de um toque de envio numa linha: quem chama relê o aparelho (estados e pendentes). */
  onResent(): void;
}

export function HistoryView({
  userId,
  editable,
  canExport,
  delivery,
  onDeleted,
}: {
  userId: string;
  editable: boolean;
  canExport: boolean;
  delivery?: HistoryDelivery;
  /** Depois de excluir um treino (quem chama atualiza o que depende da lista, ex.: os pendentes de envio). */
  onDeleted?: () => void;
}) {
  const { repo } = useApp();
  const { data, loading, error, reload } = useLoad(() => repo.listSessions(userId), [userId, repo]);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Session | null>(null);

  const weeks = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of data ?? []) {
      const w = weekStart(s.startedAt);
      map.set(w, [...(map.get(w) ?? []), s]);
    }
    return [...map.entries()];
  }, [data]);

  if (loading) return <Skeleton className="h-64" />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data?.length)
    return (
      <Empty
        title="Nenhum treino registrado"
        body={editable ? "Quando você finalizar um treino, ele aparece aqui com cada série, carga e repetição." : "Este aluno ainda não registrou treinos."}
        action={editable ? <LinkButton href="/hoje">Ir para o treino de hoje</LinkButton> : undefined}
      />
    );

  return (
    <div className="space-y-6">
      {canExport ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            icon={<Download className="size-4" />}
            onClick={() => {
              downloadText("historico-shape-real.csv", sessionsToCsv(data));
              track("export_downloaded", { kind: "sessions" });
            }}
          >
            Exportar planilha
          </Button>
        </div>
      ) : null}
      {weeks.map(([week, sessions]) => (
        <section key={week}>
          <h2 className="col-head mb-2 text-steel">
            Semana de {new Date(week + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })} · {sessions.length} treino{sessions.length > 1 ? "s" : ""}
          </h2>
          <ul className="space-y-2">
            {sessions.map((s) => {
              const isOpen = open === s.id;
              // Minutos e volume pelas regras únicas (R3-4, R3-6 B), nunca fim − início nem o `volumeKg` gravado.
              const minutes = activeMinutes(s);
              const state = delivery?.stateOf(s.id) ?? null;
              const text = state && delivery ? sessionDeliveryText(state, delivery.coachFirst) : null;
              return (
                <li key={s.id} className="overflow-hidden rounded-[8px] border border-rule bg-paper">
                  <button onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="plate-type grid h-10 min-w-10 place-items-center rounded bg-iron px-1.5 text-chalk">{s.dayKey ?? "L"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{s.dayTitle?.trim() || (s.dayKey ? `Treino ${s.dayKey}` : "Treino livre")}</span>
                      <span className="num block text-xs text-steel">
                        {new Date(s.startedAt).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                        {minutes ? ` · ${minutes} min` : ""} · {fmtNum(volumeDaSessao(s), 0)} kg
                        {s.feeling ? ` · ${FEELING[s.feeling]}` : ""}
                      </span>
                      {/* Linha curta do envio: dentro do botão, entra no nome acessível ("…, Envio iniciado · 23/11"). */}
                      {text?.short ? (
                        <DeliveryLine icon={text.icon} className="mt-0.5 text-xs">
                          <span className="sr-only">, </span>
                          {text.short}
                        </DeliveryLine>
                      ) : null}
                    </span>
                    {s.prs.length ? <RecordMark count={s.prs.length} compact className="shrink-0" /> : null}
                    <ChevronDown className={cx("size-5 text-steel transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  {isOpen ? (
                    <div className="border-t border-rule">
                      <table className="num w-full text-sm">
                        <tbody className="ruled">
                          {s.exercises.map((e) => (
                            <tr key={e.uid} className="border-t border-rule first:border-0">
                              <td className="px-4 py-2 font-semibold">
                                {e.name}
                                {s.prs.includes(e.exerciseId) ? <RecordMark variant="icon" className="ml-1.5 align-[-0.125em]" /> : null}
                                {e.notes ? <span className="block text-xs font-normal text-steel">{e.notes}</span> : null}
                              </td>
                              <td className="px-4 py-2 text-right text-steel">
                                {completedSets(e)
                                  .map((x) => (x.loadKg ? `${fmtNum(x.loadKg)}×${x.reps}` : `${x.reps}`))
                                  .join(" · ")}
                                {e.unit === "seg" ? " seg" : e.unit === "min" ? " min" : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {s.note ? <p className="border-t border-rule px-4 py-2 text-sm text-steel">“{s.note}”</p> : null}
                      {text || editable ? (
                        <div className="border-t border-rule px-4 py-3">
                          {/* Texto longo do envio: região viva, para o novo estado ser anunciado depois do toque. */}
                          {text ? <StatusRegion text={text.long} icon={text.icon} /> : null}
                          {/* Reenvio à esquerda; "Excluir treino" (destrutivo) do lado oposto, mesmo quando a linha quebra. */}
                          <div className={cx("flex flex-wrap items-center gap-2", text && "mt-3")}>
                            {text && delivery ? (
                              <SendToCoach sessions={[s]} where="historico_item" variant="secondary" size="md" label={text.actionLabel} onSent={() => delivery.onResent()} />
                            ) : null}
                            {editable ? (
                              <Button
                                size="md"
                                variant="ghost"
                                // `!`: no CSS do Tailwind o text-iron do ghost viria depois do text-danger (ordem alfabética).
                                className="ml-auto text-danger! hover:bg-danger-surface"
                                icon={<Trash2 className="size-4" aria-hidden />}
                                onClick={() => setConfirm(s)}
                              >
                                Excluir treino
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Excluir treino?">
        <p className="text-[0.9375rem] text-steel">As séries deste treino saem do histórico e dos gráficos. Não dá para desfazer.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (confirm) await repo.deleteSession(confirm.id);
              setConfirm(null);
              void reload();
              onDeleted?.();
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
