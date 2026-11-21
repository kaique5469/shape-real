"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Copy, MessageCircle, Search, Trash2, UserPlus, X } from "lucide-react";
import { StudentForm } from "@/components/student-form";
import { Alert, Badge, Button, Dialog, Empty, Input, PageHeader, Skeleton, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtNum, relativeDay, useLoad } from "@/lib/hooks";
import { normalize } from "@/lib/domain/exercises";
import { firstName, programValidity, waLink, waPhone } from "@/lib/domain/format";
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

/** Parado: treinou e sumiu, ou foi cadastrado há dias e ainda não registrou nada. */
function isInactive(s: StudentSummary) {
  return s.lastSessionAt ? daysSince(s.lastSessionAt) >= INACTIVE_DAYS : daysSince(s.linkedAt) >= INACTIVE_DAYS;
}

function attention(s: StudentSummary) {
  const v = s.activeProgram ? programValidity(s.activeProgram.createdAt, s.activeProgram.durationWeeks) : null;
  return (s.activeProgram ? 0 : 4) + (v?.state === "expired" ? 3 : v?.state === "soon" ? 1 : 0) + (isInactive(s) ? 2 : 0);
}

function Alunos() {
  const { user, repo, plan, isTester, startSolo } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const { data, loading, error, reload } = useLoad(() => repo.listStudents(user!.id), [user?.id, repo]);
  const [welcome, setWelcome] = useState(() => Boolean(params.get("bemvindo")));
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmSamples, setConfirmSamples] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [goingSolo, setGoingSolo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canManage = repo.capabilities.managedStudents;
  const maxStudents = PLANS[plan].maxStudents || 3;
  const students = useMemo(
    () => [...(data ?? [])].sort((a, b) => attention(b) - attention(a) || daysSince(b.lastSessionAt) - daysSince(a.lastSessionAt) || a.profile.name.localeCompare(b.profile.name)),
    [data],
  );
  const shown = query.trim() ? students.filter((s) => normalize(s.profile.name).includes(normalize(query))) : students;
  const inactive = students.filter(isInactive);
  const activeWeek = students.filter((s) => s.sessions7d > 0).length;
  const samples = students.filter((s) => s.profile.sample);
  const full = !isTester && students.length >= maxStudents;

  function dismissWelcome() {
    setWelcome(false);
    router.replace("/alunos", { scroll: false });
  }

  async function newInvite() {
    setInviting(true);
    setErr(null);
    try {
      const inv = await repo.createInvite(user!.id);
      setInvite(inv);
      setInviteOpen(true);
      track("student_invited", { count: students.length });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível gerar o convite.");
    } finally {
      setInviting(false);
    }
  }

  async function removeSamples() {
    setRemoving(true);
    setErr(null);
    try {
      for (const s of samples) await repo.deleteAccount(s.profile.id);
      track("student_removed", { count: samples.length, sample: true });
      setConfirmSamples(false);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível remover os exemplos.");
    } finally {
      setRemoving(false);
    }
  }

  async function trySolo() {
    setGoingSolo(true);
    try {
      const p = await startSolo();
      router.push(p.onboarded ? "/hoje" : "/onboarding");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível abrir o modo aluno.");
      setGoingSolo(false);
    }
  }

  const addAction = canManage ? (
    <Button onClick={() => setFormOpen(true)} icon={<UserPlus className="size-4" />} disabled={full}>
      Adicionar aluno
    </Button>
  ) : (
    <Button onClick={newInvite} loading={inviting} icon={<UserPlus className="size-4" />} disabled={full}>
      Convidar aluno
    </Button>
  );

  const link = invite ? `${typeof window !== "undefined" ? location.origin : ""}/convite/${invite.code}` : "";
  const inviteText = invite ? `Oi! Vou acompanhar seus treinos pelo Shape Real. Crie sua conta por este link: ${link} (ou use o código ${invite.code}).` : "";

  return (
    <>
      <PageHeader title="Alunos" sub="Quem treinou, quem está com a ficha vencendo e quem precisa de um empurrão." actions={addAction} />

      {welcome && isTester ? (
        <section aria-label="Por onde começar" className="mb-6 rounded-[8px] border border-rule-strong bg-paper">
          <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
            <div>
              <h2 className="text-lg font-bold">Você está no painel do personal</h2>
              <p className="mt-0.5 text-sm text-steel">Sem cadastro: tudo fica salvo neste aparelho.{samples.length ? (samples.length === 1 ? " O aluno marcado como exemplo abaixo é fictício, para você explorar." : ` Os ${samples.length} alunos marcados como exemplo abaixo são fictícios, para você explorar.`) : ""}</p>
            </div>
            <button type="button" onClick={dismissWelcome} aria-label="Fechar instruções" className="-mr-1.5 -mt-1 grid size-11 shrink-0 place-items-center rounded-[6px] hover:bg-chalk-2">
              <X className="size-5" />
            </button>
          </div>
          <ol className="ruled">
            {[
              { n: 1, title: "Cadastre um aluno", body: "Nome, objetivo, rotina e limitações. Leva um minuto.", action: () => setFormOpen(true), cta: "Adicionar" },
              { n: 2, title: "Monte a ficha e a dieta", body: "Gere uma base e ajuste, ou monte do zero. Depois envie pelo WhatsApp ou imprima.", action: null, cta: "" },
              { n: 3, title: "Veja o app como o aluno", body: "Na página do aluno, toque em “Ver como aluno” e registre um treino. Na versão final, o aluno entra com a própria conta no celular dele.", action: null, cta: "" },
            ].map((s) => (
              <li key={s.n} className="flex items-center gap-3 px-4 py-3">
                <span className="plate-type num grid size-8 shrink-0 place-items-center rounded-full border border-rule-strong text-sm">{s.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-sm text-steel">{s.body}</span>
                </span>
                {s.action ? (
                  <Button size="sm" variant="secondary" onClick={s.action} className="shrink-0">
                    {s.cta}
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-3">
            <p className="text-sm text-steel">Quer ver o lado de quem treina sem personal?</p>
            <Button size="sm" variant="ghost" onClick={trySolo} loading={goingSolo}>
              Testar como aluno que treina sozinho
            </Button>
          </div>
        </section>
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
            canManage
              ? "Cadastre seu primeiro aluno. Depois é só montar a ficha e a dieta e enviar pelo WhatsApp."
              : "Convide seu primeiro aluno. Ele cria a conta pelo link e cai direto no seu painel."
          }
          action={addAction}
        />
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-3 divide-x divide-rule rounded-[8px] border border-rule bg-paper py-3 text-center">
            <div className="px-1">
              <dt className="text-xs text-steel">Alunos</dt>
              <dd className="num plate-type text-2xl">
                {students.length}
                {isTester ? null : <span className="text-sm text-steel">/{maxStudents}</span>}
              </dd>
            </div>
            <div className="px-1">
              <dt className="text-xs text-steel">Treinaram na semana</dt>
              <dd className="num plate-type text-2xl">{activeWeek}</dd>
            </div>
            <div className="px-1">
              <dt className="text-xs text-steel">Parados há {INACTIVE_DAYS}+ dias</dt>
              <dd className={cx("num plate-type text-2xl", inactive.length > 0 && "text-plate-red")}>{inactive.length}</dd>
            </div>
          </dl>

          {inactive.length ? (
            <Alert tone="warn">
              <p>
                <strong>{inactive.map((s) => firstName(s.profile.name)).join(", ")}</strong> {inactive.length > 1 ? "estão" : "está"} sem treinar há {INACTIVE_DAYS} dias ou mais. Uma mensagem agora costuma
                trazer o aluno de volta.
              </p>
              {inactive.some((s) => waPhone(s.profile.phone)) ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {inactive
                    .filter((s) => waPhone(s.profile.phone))
                    .map((s) => (
                      <a
                        key={s.profile.id}
                        href={waLink(`Oi, ${firstName(s.profile.name)}. Senti sua falta nos treinos esta semana. Bora retomar? Se precisar ajustar a ficha ou os horários, me avisa.`, s.profile.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => track("student_contacted", { where: "alerta_parados" })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-rule-strong bg-paper px-3 text-sm font-semibold hover:border-iron"
                      >
                        <MessageCircle className="size-4" aria-hidden /> Chamar {firstName(s.profile.name)}
                      </a>
                    ))}
                </div>
              ) : null}
            </Alert>
          ) : null}

          {students.length > 6 ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aluno" aria-label="Buscar aluno" className="pl-9" />
            </div>
          ) : null}

          {shown.length ? (
            <ul className="space-y-2">
              {shown.map((s) => (
                <StudentRow key={s.profile.id} s={s} />
              ))}
            </ul>
          ) : (
            <p className="rounded-[8px] border border-dashed border-rule-strong px-4 py-8 text-center text-steel">Nenhum aluno com “{query}”.</p>
          )}

          {samples.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-steel">
              <p>
                {samples.length === 1 ? "1 aluno de exemplo" : `${samples.length} alunos de exemplo`} com treinos e medidas fictícios.
              </p>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmSamples(true)}>
                Remover exemplos
              </Button>
            </div>
          ) : null}

          {!isTester && plan !== "coach" ? (
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

      <StudentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(p) => {
          setFormOpen(false);
          router.push(`/alunos/${p.id}?novo=1`);
        }}
      />

      <Dialog open={confirmSamples} onClose={() => setConfirmSamples(false)} title="Remover os alunos de exemplo?">
        <p className="text-[0.9375rem] text-steel">As fichas, treinos, medidas e dietas dos exemplos são apagados deste aparelho. Os alunos que você cadastrou continuam aqui.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmSamples(false)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={removing} onClick={removeSamples}>
            Remover exemplos
          </Button>
        </div>
      </Dialog>

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Convite para aluno">
        {invite ? (
          <div className="space-y-4">
            <p className="text-[0.9375rem] text-steel">Envie o link ou o código. Ele vale por 7 dias e serve para um aluno.</p>
            <p className="plate-type rounded-[8px] border-2 border-dashed border-rule-strong bg-chalk py-4 text-center text-[2.2rem] tracking-[0.25em]">{invite.code}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={waLink(inviteText)}
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
                  await navigator.clipboard?.writeText(inviteText).catch(() => undefined);
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
  const late = isInactive(s);
  const validity = s.activeProgram ? programValidity(s.activeProgram.createdAt, s.activeProgram.durationWeeks) : null;
  const target = s.profile.daysPerWeek;
  return (
    <li>
      <Link href={`/alunos/${s.profile.id}`} className="flex items-center gap-3 rounded-[8px] border border-rule bg-paper px-3 py-3 hover:border-iron sm:px-4">
        <span className="plate-type grid size-11 shrink-0 place-items-center rounded-full bg-iron text-chalk">{s.profile.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-bold">{s.profile.name}</span>
            {s.profile.sample ? <Badge className="shrink-0">exemplo</Badge> : null}
          </span>
          <span className="block truncate text-sm text-steel">
            {s.activeProgram ? (
              <>
                {s.activeProgram.name}
                {validity && validity.state !== "ok" ? <span className={cx("font-semibold", validity.state === "expired" ? "text-plate-red-ink" : "text-iron")}> · {validity.label}</span> : null}
              </>
            ) : (
              <>
                <span className="font-semibold text-plate-red-ink">Sem ficha</span>
                {s.profile.goal ? ` · ${GOAL_LABEL[s.profile.goal]}` : ""}
              </>
            )}
          </span>
          <span className="num block truncate text-sm text-steel">
            {s.sessions7d}
            {target ? ` de ${target}` : ""} na semana · <span className={cx(late && "font-semibold text-plate-red-ink")}>{s.lastSessionAt ? relativeDay(s.lastSessionAt) : "sem treinos"}</span>
          </span>
        </span>
        {s.latestWeightKg ? (
          <span className="hidden text-right text-sm sm:block">
            <span className="num block font-semibold">{fmtNum(s.latestWeightKg)} kg</span>
            <span className="num block text-steel">{s.weightDelta28d ? `${s.weightDelta28d > 0 ? "+" : "−"}${fmtNum(Math.abs(s.weightDelta28d))} em 28 dias` : "peso atual"}</span>
          </span>
        ) : null}
        <ChevronRight className="size-5 shrink-0 text-steel" aria-hidden />
      </Link>
    </li>
  );
}
