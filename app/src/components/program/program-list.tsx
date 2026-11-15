"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Copy, Download, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Dialog, Empty, LinkButton, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { useLoad, fmtDate } from "@/lib/hooks";
import { getSystem } from "@/lib/domain/systems";
import { GOAL_LABEL } from "@/lib/domain/generator";
import { programToCsv, downloadText } from "@/lib/domain/export";
import { uid } from "@/lib/domain/ids";
import { PLANS } from "@/lib/domain/plans";
import { track } from "@/lib/analytics";
import type { Program } from "@/lib/domain/types";

const SOURCE: Record<Program["source"], string> = { ia: "IA", manual: "Manual", modelo: "Modelo", personal: "Personal" };

export function ProgramList({ ownerId, basePath, newHref, canExport }: { ownerId: string; basePath: string; newHref: string; canExport: boolean }) {
  const { repo, user } = useApp();
  const { data, loading, error, reload } = useLoad(() => repo.listPrograms(ownerId), [ownerId, repo]);
  const [confirm, setConfirm] = useState<Program | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (loading) return <Skeleton className="h-48" />;
  if (error) return <Alert tone="error">{error}</Alert>;
  const programs = data ?? [];
  const limit = user?.role === "coach" ? Infinity : PLANS[user?.plan ?? "free"].maxPrograms;

  if (!programs.length) {
    return (
      <Empty
        title="Nenhuma ficha ainda"
        body="Gere com IA no sistema que preferir (ABC, Upper/Lower, PPL, 5×5…) ou monte exercício por exercício."
        action={
          <LinkButton href={newHref} icon={<Sparkles className="size-4" />}>
            Criar ficha
          </LinkButton>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {msg ? <Alert tone="done">{msg}</Alert> : null}
      <ul className="space-y-3">
        {programs.map((p) => {
          const sys = getSystem(p.system);
          return (
            <li key={p.id} className="rounded-[8px] border border-rule bg-paper">
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                <Link href={`${basePath}/${p.id}`} className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{p.name}</span>
                    {p.active ? (
                      <Badge tone="done">
                        <CheckCircle2 className="size-3" /> Ativa
                      </Badge>
                    ) : null}
                    <Badge>{SOURCE[p.source]}</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm text-steel">
                    {sys.name} · {GOAL_LABEL[p.goal]} · {p.days.length} dias · atualizada {fmtDate(p.updatedAt)}
                  </span>
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  {!p.active ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await repo.setActiveProgram(ownerId, p.id);
                        setMsg(`“${p.name}” agora é a ficha ativa.`);
                        void reload();
                      }}
                    >
                      Ativar
                    </Button>
                  ) : null}
                  <LinkButton href={`${basePath}/${p.id}`} size="sm" variant="ghost" icon={<Pencil className="size-4" />}>
                    Editar
                  </LinkButton>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Duplicar ficha"
                    disabled={programs.length >= limit}
                    title={programs.length >= limit ? "Limite de fichas do plano Grátis" : undefined}
                    onClick={async () => {
                      const now = new Date().toISOString();
                      await repo.saveProgram({ ...p, id: uid(), name: `${p.name} (cópia)`, active: false, createdAt: now, updatedAt: now, createdBy: user!.id, days: p.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, uid: uid() })) })) });
                      void reload();
                    }}
                    icon={<Copy className="size-4" />}
                  />
                  {canExport ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Exportar planilha"
                      icon={<Download className="size-4" />}
                      onClick={() => {
                        downloadText(`ficha-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, programToCsv(p));
                        track("export_downloaded", { kind: "program" });
                      }}
                    />
                  ) : null}
                  <Button size="sm" variant="ghost" aria-label="Excluir ficha" className="text-plate-red-ink" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(p)} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {programs.length >= limit ? (
        <Alert tone="warn">
          Você atingiu {limit} fichas do plano Grátis.{" "}
          <Link href="/conta#planos" className="font-semibold underline" onClick={() => track("paywall_viewed", { where: "programs_limit" })}>
            Conheça o Pro
          </Link>{" "}
          para fichas ilimitadas.
        </Alert>
      ) : null}

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Excluir ficha?">
        <p className="text-[0.9375rem] text-steel">“{confirm?.name}” será apagada. Os treinos já registrados continuam no histórico.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (confirm) await repo.deleteProgram(confirm.id);
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
