"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronRight, Copy, MessageCircle, UserPlus } from "lucide-react";
import { Alert, Button, Dialog, Empty, PageHeader, Skeleton, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtNum, relativeDay, useLoad } from "@/lib/hooks";
import { GOAL_LABEL } from "@/lib/domain/generator";
import { PLANS } from "@/lib/domain/plans";
import { track } from "@/lib/analytics";
import type { Invite, StudentSummary } from "@/lib/domain/types";

const INACTIVE_DAYS = 5;

export default function AlunosPage() {
  return (
    <Suspense>
      <Alunos />
    </Suspense>
  );
}

function daysSince(iso: string | null) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function Alunos() {
  const { user, repo } = useApp();
  const params = useSearchParams();
  const { data, loading, error } = useLoad(() => repo.listStudents(user!.id), [user?.id, repo]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const maxStudents = user!.plan === "coach" ? PLANS.coach.maxStudents : 3;
  const students = [...(data ?? [])].sort((a, b) => daysSince(b.lastSessionAt) - daysSince(a.lastSessionAt));
  const inactive = students.filter((s) => daysSince(s.lastSessionAt) >= INACTIVE_DAYS);
  const activeWeek = students.filter((s) => s.sessions7d > 0).length;

  async function newInvite() {
    setInviting(true);
    setErr(null);
    try {
      const inv = await repo.createInvite(user!.id);
      setInvite(inv);
      setOpen(true);
      track("student_invited", { count: students.length });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível gerar o convite.");
    } finally {
      setInviting(false);
    }
  }

  const link = invite ? `${typeof window !== "undefined" ? location.origin : ""}/convite/${invite.code}` : "";
  const waText = invite ? `Oi! Vou acompanhar seus treinos pelo Shape Real. Crie sua conta por este link: ${link} (ou use o código ${invite.code}).` : "";

  return (
    <>
      <PageHeader
        title="Alunos"
        sub="Quem treinou, quanto levantou e quem precisa de um empurrão."
        actions={
          <Button onClick={newInvite} loading={inviting} icon={<UserPlus className="size-4" />} disabled={students.length >= maxStudents}>
            Convidar aluno
          </Button>
        }
      />

      {params.get("boasvindas") ? (
        <Alert tone="done" className="mb-5">
          Seu painel está pronto. Gere um convite e mande pelo WhatsApp — quando o aluno entrar, você monta a ficha e a dieta dele por aqui.
        </Alert>
      ) : null}
      {err ? (
        <Alert tone="error" className="mb-5">
          {err}
        </Alert>
      ) : null}

      {loading ? (
        <Skeleton className="h-72" />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : !students.length ? (
        <Empty
          title="Nenhum aluno ainda"
          body={
            <>
              Convide seu primeiro aluno. Ele cria a conta pelo link, cai direto no seu painel e passa a usar os recursos Pro
              {user!.plan === "coach" ? " sem pagar nada" : ""}.
            </>
          }
          action={
            <Button onClick={newInvite} loading={inviting} icon={<UserPlus className="size-4" />}>
              Gerar convite
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-3 divide-x divide-rule rounded-[8px] border border-rule bg-paper py-3 text-center">
            <div>
              <dt className="text-xs text-steel">Alunos</dt>
              <dd className="num plate-type text-2xl">
                {students.length}
                <span className="text-sm text-steel">/{maxStudents}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-steel">Treinaram na semana</dt>
              <dd className="num plate-type text-2xl">{activeWeek}</dd>
            </div>
            <div>
              <dt className="text-xs text-steel">Parados há {INACTIVE_DAYS}+ dias</dt>
              <dd className={cx("num plate-type text-2xl", inactive.length > 0 && "text-plate-red")}>{inactive.length}</dd>
            </div>
          </dl>

          {inactive.length ? (
            <Alert tone="warn">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong>{inactive.map((s) => s.profile.name.split(" ")[0]).join(", ")}</strong> {inactive.length > 1 ? "estão" : "está"} sem treinar há {INACTIVE_DAYS} dias ou mais. Uma mensagem agora
                  evita o cancelamento.
                </span>
              </span>
            </Alert>
          ) : null}

          <ul className="space-y-2">
            {students.map((s) => (
              <StudentRow key={s.profile.id} s={s} />
            ))}
          </ul>

          {user!.plan !== "coach" ? (
            <Alert tone="info">
              Plano Grátis de personal: até 3 alunos.{" "}
              <Link href="/conta#planos" className="font-semibold underline" onClick={() => track("paywall_viewed", { where: "coach_students" })}>
                Plano Personal
              </Link>{" "}
              libera {PLANS.coach.maxStudents} alunos e recursos Pro para eles.
            </Alert>
          ) : null}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Convite para aluno">
        {invite ? (
          <div className="space-y-4">
            <p className="text-[0.9375rem] text-steel">Envie o link ou o código. Ele vale por 7 dias e serve para um aluno.</p>
            <p className="plate-type rounded-[8px] border-2 border-dashed border-rule-strong bg-chalk py-4 text-center text-[2.2rem] tracking-[0.25em]">{invite.code}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[6px] bg-plate-green px-4 font-semibold text-white hover:bg-plate-green-ink"
              >
                <MessageCircle className="size-4" /> Enviar no WhatsApp
              </a>
              <Button
                variant="secondary"
                className="flex-1"
                icon={<Copy className="size-4" />}
                onClick={async () => {
                  await navigator.clipboard?.writeText(waText).catch(() => undefined);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copiado" : "Copiar mensagem"}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function StudentRow({ s }: { s: StudentSummary }) {
  const days = daysSince(s.lastSessionAt);
  const late = days >= INACTIVE_DAYS;
  return (
    <li>
      <Link href={`/alunos/${s.profile.id}`} className="flex items-center gap-3 rounded-[8px] border border-rule bg-paper px-4 py-3 hover:border-iron">
        <span className="plate-type grid size-11 shrink-0 place-items-center rounded-full bg-iron text-chalk">{s.profile.name.slice(0, 1)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{s.profile.name}</span>
          <span className="block truncate text-sm text-steel">
            {s.activeProgramName ?? (
              <>
                <span className="font-semibold text-plate-red-ink">Sem ficha ativa</span>
                {s.profile.goal ? ` · ${GOAL_LABEL[s.profile.goal]}` : ""}
              </>
            )}
          </span>
        </span>
        <span className="hidden text-right text-sm sm:block">
          <span className="num block font-semibold">{s.sessions7d} treino{s.sessions7d === 1 ? "" : "s"} / 7 dias</span>
          <span className="num block text-steel">
            {s.latestWeightKg ? `${fmtNum(s.latestWeightKg)} kg` : ""}
            {s.weightDelta28d ? ` (${s.weightDelta28d > 0 ? "+" : ""}${fmtNum(s.weightDelta28d)})` : ""}
          </span>
        </span>
        <span className={cx("w-20 text-right text-sm font-semibold", late ? "text-plate-red-ink" : "text-steel")}>{relativeDay(s.lastSessionAt)}</span>
        <ChevronRight className="size-5 shrink-0 text-steel" aria-hidden />
      </Link>
    </li>
  );
}
