"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, Trash2, Trophy } from "lucide-react";
import { Alert, Button, Dialog, Empty, LinkButton, Skeleton, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtNum, useLoad } from "@/lib/hooks";
import { completedSets, weekStart } from "@/lib/domain/progression";
import { downloadText, sessionsToCsv } from "@/lib/domain/export";
import { track } from "@/lib/analytics";
import type { Session } from "@/lib/domain/types";

const FEELING = ["", "Péssimo", "Ruim", "Ok", "Bom", "Ótimo"];

export function HistoryView({ userId, editable, canExport }: { userId: string; editable: boolean; canExport: boolean }) {
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
              const minutes = s.finishedAt ? Math.round((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 60000) : null;
              return (
                <li key={s.id} className="overflow-hidden rounded-[8px] border border-rule bg-paper">
                  <button onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="plate-type grid h-10 min-w-10 place-items-center rounded bg-iron px-1.5 text-chalk">{s.dayKey ?? "L"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{s.dayTitle?.trim() || (s.dayKey ? `Treino ${s.dayKey}` : "Treino livre")}</span>
                      <span className="num block text-xs text-steel">
                        {new Date(s.startedAt).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                        {minutes ? ` · ${minutes} min` : ""} · {fmtNum(s.volumeKg, 0)} kg
                        {s.feeling ? ` · ${FEELING[s.feeling]}` : ""}
                      </span>
                    </span>
                    {s.prs.length ? (
                      <span className="flex items-center gap-1 rounded bg-plate-red px-1.5 py-0.5 text-xs font-bold text-white">
                        <Trophy className="size-3" /> {s.prs.length}
                      </span>
                    ) : null}
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
                                {s.prs.includes(e.exerciseId) ? <Trophy className="ml-1.5 inline size-3.5 text-plate-red" aria-label="recorde" /> : null}
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
                      {editable ? (
                        <div className="flex justify-end border-t border-rule px-4 py-2">
                          <Button size="sm" variant="ghost" className="text-plate-red-ink" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(s)}>
                            Excluir treino
                          </Button>
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
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
