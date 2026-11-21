"use client";

import Link from "next/link";
import { Suspense, use, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ClipboardList, Eye, MessageCircle, MoreHorizontal, Pencil, Plus, Ruler, Salad, Trophy, UserMinus } from "lucide-react";
import { ProgramList } from "@/components/program/program-list";
import { StudentForm } from "@/components/student-form";
import { DietView } from "@/components/views/diet-view";
import { EvolutionView } from "@/components/views/evolution-view";
import { HistoryView } from "@/components/views/history-view";
import { ActionSheet, Alert, Badge, Button, Dialog, IconButton, LinkButton, Panel, Segmented, Skeleton, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtDate, fmtNum, relativeDay, useLoad } from "@/lib/hooks";
import { firstName, programValidity, waLink, waPhone } from "@/lib/domain/format";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { weekStart } from "@/lib/domain/progression";
import { track } from "@/lib/analytics";
import type { BodyMetric, Equipment, Profile, Program, Session } from "@/lib/domain/types";
import { useStudent } from "./student";

type Tab = "resumo" | "ficha" | "dieta" | "evolucao" | "historico";
const TABS: { value: Tab; label: string }[] = [
  { value: "resumo", label: "Resumo" },
  { value: "ficha", label: "Ficha" },
  { value: "dieta", label: "Dieta" },
  { value: "evolucao", label: "Evolução" },
  { value: "historico", label: "Histórico" },
];
const EQUIPMENT_LABEL: Record<Equipment, string> = { academia: "Academia", home: "Em casa", peso_corporal: "Sem equipamento" };

export default function AlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Aluno id={id} />
    </Suspense>
  );
}

function Aluno({ id }: { id: string }) {
  const { user, repo, mode, actAs } = useApp();
  const router = useRouter();
  const search = useSearchParams();
  const { data: student, loading, setData } = useStudent(id);
  const requested = search.get("aba") as Tab | null;
  const tab: Tab = TABS.some((t) => t.value === requested) ? requested! : "resumo";
  const justCreated = Boolean(search.get("novo"));
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"view" | "remove" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Skeleton className="h-96" />;
  if (!student)
    return (
      <div className="space-y-4">
        <Alert tone="error">Aluno não encontrado ou não vinculado a você.</Alert>
        <LinkButton href="/alunos" variant="secondary" icon={<ArrowLeft className="size-4" />}>
          Voltar para alunos
        </LinkButton>
      </div>
    );

  const first = firstName(student.name);
  const managed = student.managedBy === user?.id;
  const phone = waPhone(student.phone);
  const facts = [
    student.goal && GOAL_LABEL[student.goal],
    student.level && LEVEL_LABEL[student.level],
    student.daysPerWeek && `${student.daysPerWeek}x/semana`,
    student.sessionMinutes && `${student.sessionMinutes} min`,
    student.equipment && EQUIPMENT_LABEL[student.equipment],
  ].filter(Boolean);

  const setTab = (t: Tab) => router.replace(`/alunos/${id}${t === "resumo" ? "" : `?aba=${t}`}`, { scroll: false });

  async function viewAs() {
    setBusy("view");
    setErr(null);
    try {
      await actAs(id);
      router.push("/hoje");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível abrir o app do aluno.");
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      if (managed) await repo.deleteAccount(id);
      else await repo.unlinkStudent(user!.id, id);
      track("student_removed", { managed });
      router.replace("/alunos");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível remover o aluno.");
      setBusy(null);
      setConfirm(false);
    }
  }

  return (
    <>
      <Link href="/alunos" className="no-print mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron">
        <ArrowLeft className="size-4" /> Alunos
      </Link>

      <header className="no-print mb-5">
        <div className="flex items-start gap-3">
          <span className="plate-type grid size-14 shrink-0 place-items-center rounded-full bg-iron text-xl text-chalk">{student.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h1 className="plate-type break-words text-[1.6rem] leading-tight sm:text-[1.9rem]">{student.name}</h1>
            <p className="mt-0.5 text-sm text-steel">{facts.join(" · ") || "Perfil ainda incompleto"}</p>
            {student.sample ? <Badge className="mt-1.5">aluno de exemplo</Badge> : null}
          </div>
          <IconButton label="Mais opções" onClick={() => setMenu(true)} className="-mr-2">
            <MoreHorizontal className="size-5" />
          </IconButton>
        </div>
        {student.limitations ? (
          <p className="mt-3 rounded-[6px] border border-plate-red/30 bg-plate-red/5 px-3 py-2 text-sm">
            <span className="font-bold text-plate-red-ink">Limitação:</span> {student.limitations}
          </p>
        ) : null}
        {student.coachNotes ? (
          <details className="group mt-2 rounded-[6px] border border-rule bg-paper px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold marker:text-steel">Suas anotações</summary>
            <p className="mt-1.5 whitespace-pre-wrap text-steel">{student.coachNotes}</p>
          </details>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {mode === "local" ? (
            <Button onClick={viewAs} loading={busy === "view"} icon={<Eye className="size-4" />} className="flex-1 whitespace-nowrap px-3 sm:flex-none sm:px-4">
              Ver como aluno
            </Button>
          ) : null}
          {phone ? (
            <a
              href={waLink(`Oi, ${first}.`, student.phone)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("student_contacted", { where: "pagina_aluno" })}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] border border-rule-strong bg-paper px-3 text-[0.9375rem] font-semibold hover:border-iron sm:flex-none sm:px-4"
            >
              <MessageCircle className="size-4" aria-hidden /> WhatsApp
            </a>
          ) : null}
        </div>
      </header>

      {err ? (
        <Alert tone="error" className="mb-4">
          {err}
        </Alert>
      ) : null}

      <div className="no-print -mx-4 mb-5 overflow-x-auto px-4">
        <Segmented label="Seção do aluno" value={tab} onChange={setTab} size="sm" className="min-w-max" options={TABS} />
      </div>

      {tab === "resumo" ? <Summary student={student} justCreated={justCreated} onTab={setTab} onEdit={() => setEdit(true)} /> : null}
      {tab === "ficha" ? (
        <div className="space-y-4">
          <div className="no-print flex justify-end">
            <LinkButton href={`/alunos/${id}/ficha/nova`} icon={<Plus className="size-4" />}>
              Nova ficha para {first}
            </LinkButton>
          </div>
          <ProgramList ownerId={id} basePath={`/alunos/${id}/ficha`} newHref={`/alunos/${id}/ficha/nova`} canExport student={student} />
        </div>
      ) : null}
      {tab === "dieta" ? <DietView owner={student} mode="coach" /> : null}
      {tab === "evolucao" ? <EvolutionView userId={id} editable byCoach /> : null}
      {tab === "historico" ? <HistoryView userId={id} editable={false} canExport /> : null}

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={student.name}
        actions={[
          ...(managed ? [{ label: "Editar dados do aluno", icon: <Pencil className="size-5" />, onSelect: () => setEdit(true) }] : []),
          {
            label: managed ? "Remover aluno" : "Desvincular aluno",
            icon: <UserMinus className="size-5" />,
            tone: "danger" as const,
            hint: managed ? "Apaga a ficha, os treinos e as medidas deste aluno." : "Você deixa de acompanhar; o aluno mantém a conta.",
            onSelect: () => setConfirm(true),
          },
        ]}
      />

      <StudentForm
        open={edit}
        onClose={() => setEdit(false)}
        student={student}
        onSaved={(p) => {
          setData(p);
          setEdit(false);
        }}
      />

      <Dialog open={confirm} onClose={() => setConfirm(false)} title={managed ? `Remover ${first}?` : `Desvincular ${first}?`}>
        <p className="text-[0.9375rem] text-steel">
          {managed
            ? "A ficha, a dieta, os treinos registrados, as medidas e as fotos deste aluno são apagados. Não dá para desfazer."
            : "Você perde o acesso aos treinos, medidas e fotos. O aluno mantém a conta e os dados dele."}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
          <Button variant="danger" loading={busy === "remove"} onClick={remove}>
            {managed ? "Remover aluno" : "Desvincular"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

interface SummaryData {
  sessions: Session[];
  programs: Program[];
  metrics: BodyMetric[];
  hasDiet: boolean;
}

/** O que o personal confere antes da aula: frequência, último treino, medidas e validade da ficha. */
function Summary({ student, justCreated, onTab, onEdit }: { student: Profile; justCreated: boolean; onTab: (t: Tab) => void; onEdit: () => void }) {
  const { repo, mode } = useApp();
  const id = student.id;
  const { data, loading, error } = useLoad<SummaryData>(async () => {
    const [sessions, programs, metrics, diet] = await Promise.all([repo.listSessions(id), repo.listPrograms(id), repo.listMetrics(id), repo.getDiet(id)]);
    return { sessions, programs, metrics, hasDiet: Boolean(diet?.meals.some((m) => m.items.length)) };
  }, [id, repo]);

  const weeks = useMemo(() => {
    const out: { start: string; count: number }[] = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 86_400_000);
      const start = weekStart(d.toISOString());
      out.push({ start, count: (data?.sessions ?? []).filter((s) => weekStart(s.startedAt) === start).length });
    }
    return out;
  }, [data]);

  if (loading) return <Skeleton className="h-72" />;
  if (error || !data) return <Alert tone="error">{error ?? "Não foi possível carregar o resumo."}</Alert>;

  const first = firstName(student.name);
  const active = data.programs.find((p) => p.active) ?? null;
  const validity = active ? programValidity(active.createdAt, active.durationWeeks) : null;
  const last = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  const target = student.daysPerWeek ?? 0;
  // Só cobra frequência das semanas em que o aluno já estava cadastrado.
  const since = weekStart(student.createdAt);
  const sortedMetrics = [...data.metrics].sort((a, b) => b.date.localeCompare(a.date));
  const latest = (key: "weightKg" | "bodyFatPct" | "waistCm") => {
    const rows = sortedMetrics.filter((m) => m[key]);
    const cur = rows[0]?.[key] ?? null;
    const prev = rows[1]?.[key] ?? null;
    return { value: cur ?? (key === "weightKg" ? (student.weightKg ?? null) : null), delta: cur && prev ? Math.round((cur - prev) * 10) / 10 : null, date: rows[0]?.date ?? null };
  };
  const measures = [
    { label: "Peso", unit: "kg", ...latest("weightKg") },
    { label: "% gordura", unit: "%", ...latest("bodyFatPct") },
    { label: "Cintura", unit: "cm", ...latest("waistCm") },
  ];
  const hasMeasures = measures.some((m) => m.value);
  const minutes = last?.finishedAt ? Math.round((new Date(last.finishedAt).getTime() - new Date(last.startedAt).getTime()) / 60000) : null;

  const todo = [
    !active && { key: "ficha", icon: <ClipboardList className="size-5" />, title: `Montar a ficha de ${first}`, body: "Gere uma base pelo perfil ou monte do zero.", href: `/alunos/${id}/ficha/nova` },
    !sortedMetrics.length && { key: "aval", icon: <Ruler className="size-5" />, title: "Registrar a avaliação inicial", body: "Peso, % de gordura e circunferências para comparar depois.", tab: "evolucao" as Tab },
    !data.hasDiet && { key: "dieta", icon: <Salad className="size-5" />, title: "Definir metas e orientações de dieta", body: "Calorias, proteína e um cardápio base.", tab: "dieta" as Tab },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; title: string; body: string; href?: string; tab?: Tab }[];

  return (
    <div className="space-y-4">
      {justCreated ? (
        <Alert tone="done">
          Cadastro de {first} concluído. O próximo passo é montar a ficha.
        </Alert>
      ) : null}

      {todo.length ? (
        <Panel title="Próximos passos" pad={false}>
          <ul className="ruled">
            {todo.map((t) => {
              const inner = (
                <>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-rule-strong">{t.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.title}</span>
                    <span className="block text-sm text-steel">{t.body}</span>
                  </span>
                </>
              );
              return (
                <li key={t.key}>
                  {t.href ? (
                    <Link href={t.href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-chalk">
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => onTab(t.tab!)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-chalk">
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Frequência nas últimas 4 semanas">
          <ul className="space-y-2">
            {weeks.map((w, i) => {
              const slots = Math.max(target, w.count, 1);
              return (
                <li key={w.start} className="flex items-center gap-3 text-sm">
                  <span className="num w-24 shrink-0 text-steel">{i === 3 ? "Esta semana" : fmtDate(w.start, { day: "2-digit", month: "2-digit" })}</span>
                  <span className="flex flex-1 flex-wrap gap-1" aria-hidden>
                    {Array.from({ length: slots }, (_, k) => (
                      <span key={k} className={cx("h-3.5 w-5 rounded-[3px] border", k < w.count ? "border-plate-green bg-plate-green" : "border-rule-strong bg-transparent")} />
                    ))}
                  </span>
                  <span className={cx("num shrink-0 font-semibold", target > 0 && w.count < target && i < 3 && w.start >= since && "text-plate-red-ink")}>
                    {w.count}
                    {target ? ` de ${target}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          {!target ? (
            <p className="mt-3 text-sm text-steel">
              Informe quantos dias por semana {first} treina em{" "}
              <button type="button" onClick={onEdit} className="font-semibold text-iron underline">
                dados do aluno
              </button>{" "}
              para comparar com a meta.
            </p>
          ) : null}
        </Panel>

        <Panel title="Último treino">
          {last ? (
            <div>
              <p className="font-bold">
                {last.dayKey ? `${last.dayKey} — ` : ""}
                {last.dayTitle ?? "Treino livre"}
              </p>
              <p className="num mt-0.5 text-sm text-steel">
                {relativeDay(last.startedAt)}
                {minutes ? ` · ${minutes} min` : ""}
                {last.volumeKg ? ` · ${fmtNum(last.volumeKg, 0)} kg de volume` : ""}
              </p>
              {last.prs.length ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded bg-plate-red px-2 py-1 text-sm font-bold text-white">
                  <Trophy className="size-4" aria-hidden /> {last.prs.length} {last.prs.length === 1 ? "recorde" : "recordes"}
                </p>
              ) : null}
              {last.note ? <p className="mt-2 text-sm text-steel">“{last.note}”</p> : null}
              <button type="button" onClick={() => onTab("historico")} className="mt-3 block min-h-11 text-sm font-semibold underline">
                Ver todos os treinos
              </button>
            </div>
          ) : (
            <p className="text-sm text-steel">
              {first} ainda não registrou treino.{mode === "local" ? " Toque em “Ver como aluno” para registrar um e ver como fica." : " Os treinos aparecem aqui assim que forem registrados no app."}
            </p>
          )}
        </Panel>

        <Panel
          title="Ficha ativa"
          action={
            active ? (
              <Link href={`/alunos/${id}/ficha/${active.id}`} className="-my-2 inline-flex min-h-10 items-center text-sm font-semibold underline">
                Abrir ficha
              </Link>
            ) : null
          }
        >
          {active ? (
            <div>
              <p className="font-bold">{active.name}</p>
              <p className="num mt-0.5 text-sm text-steel">
                {active.days.length} {active.days.length === 1 ? "treino" : "treinos"} · criada em {fmtDate(active.createdAt, { day: "2-digit", month: "short" })}
              </p>
              {validity ? (
                <p className={cx("mt-2 text-sm font-semibold", validity.state === "expired" ? "text-plate-red-ink" : validity.state === "soon" ? "text-iron" : "text-steel")}>
                  Ficha {validity.label}
                  {validity.state !== "ok" ? ". Hora de renovar o estímulo." : ""}
                </p>
              ) : (
                <p className="mt-2 text-sm text-steel">Sem validade definida. Você pode definir ao editar a ficha.</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-steel">{first} ainda não tem ficha.</p>
              <LinkButton href={`/alunos/${id}/ficha/nova`} size="sm" className="mt-3" icon={<Plus className="size-4" />}>
                Montar ficha
              </LinkButton>
            </div>
          )}
        </Panel>

        <Panel
          title="Medidas"
          action={
            <button type="button" onClick={() => onTab("evolucao")} className="-my-2 inline-flex min-h-10 items-center text-sm font-semibold underline">
              {hasMeasures ? "Ver evolução" : "Registrar"}
            </button>
          }
        >
          {hasMeasures ? (
            <dl className="grid grid-cols-3 gap-2 text-center">
              {measures.map((m) => (
                <div key={m.label}>
                  <dt className="text-xs text-steel">{m.label}</dt>
                  <dd className="num plate-type text-xl">{m.value ? fmtNum(m.value) : <span className="text-pencil">—</span>}</dd>
                  {m.delta ? (
                    <dd className="num text-xs text-steel">
                      {m.delta > 0 ? "+" : "−"}
                      {fmtNum(Math.abs(m.delta))} {m.unit}
                    </dd>
                  ) : m.value ? (
                    <dd className="text-xs text-steel">{m.unit}</dd>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-steel">Sem avaliação registrada. Com peso e medidas você acompanha o resultado além da carga.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
