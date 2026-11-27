"use client";

import Link from "next/link";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarClock, CalendarX, ClipboardList, Eye, FileText, MessageCircle, MoreHorizontal, Pencil, Plus, Send, Trash2, TriangleAlert, UserMinus } from "lucide-react";
import { ApagarRespostasDialog } from "@/components/anamnese/apagar-respostas-dialog";
import { PedirQuestionario } from "@/components/anamnese/pedir-questionario";
import { ProximosPassos } from "@/components/anamnese/proximos-passos";
import { ResumoAluno } from "@/components/anamnese/resumo-aluno";
import { ProgramList } from "@/components/program/program-list";
import { RecordMark } from "@/components/record-mark";
import { StudentForm, useQuestionarioLigado } from "@/components/student-form";
import { DietView } from "@/components/views/diet-view";
import { EvolutionView } from "@/components/views/evolution-view";
import { ReportView } from "@/components/views/report-view";
import { SendToStudent } from "@/components/transfer-share";
import { HistoryView } from "@/components/views/history-view";
import { ActionSheet, Alert, Badge, Button, Dialog, IconButton, LinkButton, Panel, Segmented, Skeleton, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtDate, fmtNum, relativeDay, useLoad } from "@/lib/hooks";
import { SECAO_TITULO, comNomes } from "@/lib/domain/anamnese";
import { avisoCadastroNovo, marcarVisto, rotuloFazerQuestionario, temRespostas, textoPelaMetade } from "@/lib/domain/anamnese-perfil";
import { ehExemplo, type WorkStyle } from "@/lib/domain/anamnese-types";
import { firstName, programValidity, waLink, waPhone } from "@/lib/domain/format";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { weekStart } from "@/lib/domain/progression";
import { summarize } from "@/lib/domain/resumo";
import { reportError, track } from "@/lib/analytics";
import { RECEBER_TEXTO } from "@/lib/questionario-receber";
import { validityIcon, validityTone } from "@/lib/ui/tone";
import { apagarRascunho, chaveRascunho, lerRascunho, type Rascunho } from "@/lib/questionario-client";
import { ctxDoJunto, secaoDoRascunho } from "@/lib/questionario-flow";
import { limparEndereco } from "@/lib/share-link";
import type { BodyMetric, Equipment, Profile, Program, Session } from "@/lib/domain/types";
import { useStudent } from "./student";

type Tab = "resumo" | "ficha" | "dieta" | "evolucao" | "historico" | "relatorio";
const TABS: { value: Tab; label: string }[] = [
  { value: "resumo", label: "Resumo" },
  { value: "ficha", label: "Ficha" },
  { value: "dieta", label: "Dieta" },
  { value: "evolucao", label: "Evolução" },
  { value: "historico", label: "Histórico" },
  { value: "relatorio", label: "Relatório" },
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

/**
 * Tira parâmetros da barra de endereço sem navegar (o Next sincroniza `useSearchParams` com o history nativo). Os
 * parâmetros que saem juntos vão numa chamada só: duas chamadas com o mesmo `search` devolveriam o primeiro.
 */
function semParametro(id: string, search: URLSearchParams, nomes: string | string[]) {
  const q = new URLSearchParams(search.toString());
  for (const nome of Array.isArray(nomes) ? nomes : [nomes]) q.delete(nome);
  const resto = q.toString();
  limparEndereco(`/alunos/${id}${resto ? `?${resto}` : ""}`);
}

function Aluno({ id }: { id: string }) {
  const { user, repo, mode, actAs } = useApp();
  const router = useRouter();
  const search = useSearchParams();
  const { data: student, loading, setData } = useStudent(id);
  const requested = search.get("aba") as Tab | null;
  const tab: Tab = TABS.some((t) => t.value === requested) ? requested! : "resumo";
  const justCreated = Boolean(search.get("novo"));
  // ?recebido=1 (vem do /receber depois de registrar): "Pronto. Se quiser, apague a mensagem…" e `summary_viewed`
  // com origem "receber". Lido uma vez: o parâmetro sai da barra; o aviso some ao trocar de aba.
  const [recebido, setRecebido] = useState(() => search.get("recebido") === "1");
  const questionario = useQuestionarioLigado();
  const [hoje] = useState(() => new Date());
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"view" | "remove" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Relê a situação do envio da ficha ao trocar de aba (a ficha ou a dieta podem ter mudado nas abas).
  const [deliveryTick, setDeliveryTick] = useState(0);
  // Questionário: menu "Fazer o questionário", pedido pelo WhatsApp, "Apagar respostas" e o rascunho do junto.
  const [questMenu, setQuestMenu] = useState(false);
  const [pedir, setPedir] = useState<"cadastro" | "aluno" | null>(null);
  const [apagar, setApagar] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);

  // ?pedir=1 (cadastro rápido com "Mandar pelo WhatsApp"): abre o pedido uma vez e tira o parâmetro.
  const pediu = useRef(false);
  useEffect(() => {
    if (pediu.current || !student || !questionario || search.get("pedir") !== "1") return;
    pediu.current = true;
    setPedir("cadastro");
    semParametro(id, search, "pedir");
  }, [student, questionario, search, id]);

  // ?questionario=novo (fim do junto ou recepção): rola até o resumo e tira o parâmetro (com o `recebido`, junto).
  const rolou = useRef(false);
  useEffect(() => {
    const novo = search.get("questionario") === "novo";
    if (rolou.current || !student || (!novo && !search.has("recebido"))) return;
    rolou.current = true;
    if (novo)
      requestAnimationFrame(() => {
        const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById("resumo-aluno")?.scrollIntoView({ block: "start", behavior: reduz ? "auto" : "smooth" });
      });
    semParametro(id, search, ["questionario", "recebido"]);
  }, [student, search, id]);

  // O personal viu o resumo: tira o selo "Respostas novas" (vistoEm), uma vez por aluno.
  const visto = useRef<string | null>(null);
  useEffect(() => {
    if (!student || tab !== "resumo" || visto.current === student.id) return;
    const next = marcarVisto(student, new Date().toISOString());
    if (next === student) return;
    visto.current = student.id;
    repo
      .saveProfile(next)
      .then(setData)
      .catch((e) => reportError(e, "resumo:visto"));
  }, [student, tab, repo, setData]);

  // Rascunho do junto neste aparelho ("Questionário pela metade"), relido ao voltar para a aba.
  useEffect(() => {
    setRascunho(questionario ? lerRascunho(chaveRascunho({ studentId: id })) : null);
  }, [questionario, id, tab]);

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
  const exemplo = ehExemplo(student);
  const phone = waPhone(student.phone);
  const facts = [
    student.goal && GOAL_LABEL[student.goal],
    student.level && LEVEL_LABEL[student.level],
    student.daysPerWeek && `${student.daysPerWeek}x/semana`,
    student.sessionMinutes && `${student.sessionMinutes} min`,
    student.equipment && EQUIPMENT_LABEL[student.equipment],
  ].filter(Boolean);

  const setTab = (t: Tab) => {
    setDeliveryTick((n) => n + 1);
    setRecebido(false);
    router.replace(`/alunos/${id}${t === "resumo" ? "" : `?aba=${t}`}`, { scroll: false });
  };

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

  // "Remover aluno" no modo local apaga também o rascunho do junto e grava `qapagado` das rodadas (deleteAccount).
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

  function descartarRascunho() {
    apagarRascunho(chaveRascunho({ studentId: id }));
    setRascunho(null);
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
          <p className="mt-3 flex gap-2 rounded-[6px] border border-warn-line bg-warn-surface px-3 py-2 text-sm text-iron">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-hidden />
            <span className="min-w-0 break-words">
              <span className="font-bold">Limitação:</span> {student.limitations}
            </span>
          </p>
        ) : null}
        {student.coachNotes ? (
          <details className="group mt-2 rounded-[6px] border border-rule bg-paper px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold marker:text-steel">Suas anotações</summary>
            <p className="mt-1.5 whitespace-pre-wrap text-steel">{student.coachNotes}</p>
          </details>
        ) : null}
        {mode === "local" && !student.sample ? (
          <SendToStudent student={student} where="pagina_aluno" showLines="page" version={deliveryTick} variant="primary" className="mt-3 w-full sm:w-auto" onSent={() => setDeliveryTick((n) => n + 1)} />
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {mode === "local" ? (
            <Button variant={student.sample ? "primary" : "secondary"} onClick={viewAs} loading={busy === "view"} icon={<Eye className="size-4" />} className="flex-1 whitespace-nowrap px-3 sm:flex-none sm:px-4">
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
        <Alert tone="error" className="no-print mb-4">
          {err}
        </Alert>
      ) : null}

      {/* Abaixo de sm, grade 3×2: as seis abas inteiras à vista a 320 e 360 px, sem arrastar (U8 3.9). */}
      <div className="no-print mb-5">
        <Segmented label="Seção do aluno" value={tab} onChange={setTab} size="md" columns={3} options={TABS} />
      </div>

      {tab === "resumo" ? (
        <Summary
          student={student}
          ws={user?.workStyle}
          hoje={hoje}
          justCreated={justCreated}
          recebido={recebido}
          questionario={questionario}
          version={deliveryTick}
          rascunho={rascunho}
          onDescartarRascunho={descartarRascunho}
          onTab={setTab}
          onEdit={() => setEdit(true)}
          onChange={setData}
          onFichaSent={() => setDeliveryTick((n) => n + 1)}
        />
      ) : null}
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
      {tab === "dieta" ? <DietView owner={student} mode="coach" onDeliveryChange={() => setDeliveryTick((n) => n + 1)} /> : null}
      {tab === "evolucao" ? <EvolutionView userId={id} editable byCoach student={student} onStudentChange={setData} /> : null}
      {tab === "historico" ? <HistoryView userId={id} editable={false} canExport /> : null}
      {tab === "relatorio" ? <ReportView subject={student} byCoach /> : null}

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={student.name}
        actions={[
          ...(managed ? [{ label: "Editar dados do aluno", icon: <Pencil className="size-5" />, onSelect: () => setEdit(true) }] : []),
          // Portas do questionário só com a chave; apagar respostas, sempre que houver (direito do aluno, spec §11.2).
          ...(managed && questionario ? [{ label: rotuloFazerQuestionario(student), icon: <ClipboardList className="size-5" />, onSelect: () => setQuestMenu(true) }] : []),
          ...(managed && temRespostas(student) ? [{ label: "Apagar respostas do questionário", icon: <Trash2 className="size-5" />, tone: "danger" as const, onSelect: () => setApagar(true) }] : []),
          {
            label: managed ? "Remover aluno" : "Desvincular aluno",
            icon: <UserMinus className="size-5" />,
            tone: "danger" as const,
            hint: managed ? "Apaga a ficha, os treinos e as medidas deste aluno." : "Você deixa de acompanhar; o aluno mantém a conta.",
            onSelect: () => setConfirm(true),
          },
        ]}
      />

      {/* "Fazer o questionário": junto (neste aparelho) ou pelo WhatsApp. Aluno de exemplo não recebe pedido. */}
      <ActionSheet
        open={questMenu}
        onClose={() => setQuestMenu(false)}
        title={rotuloFazerQuestionario(student)}
        actions={[
          { label: `Preencher agora com ${first}`, icon: <ClipboardList className="size-5" />, onSelect: () => router.push(`/questionario?aluno=${encodeURIComponent(id)}`) },
          // Na nuvem o /receber não registra respostas: o pedido por link não é oferecido (o diálogo também avisa).
          ...(exemplo || mode !== "local" ? [] : [{ label: "Mandar pelo WhatsApp", icon: <Send className="size-5" />, onSelect: () => setPedir("aluno") }]),
        ]}
      />

      <PedirQuestionario open={pedir !== null} onClose={() => setPedir(null)} student={student} de={pedir ?? "aluno"} onPedido={setData} />
      <ApagarRespostasDialog
        open={apagar}
        onClose={() => setApagar(false)}
        student={student}
        onSaved={(p) => {
          setData(p);
          // O rascunho do junto saiu com as respostas: o card "Questionário pela metade" some agora.
          setRascunho(questionario ? lerRascunho(chaveRascunho({ studentId: id })) : null);
        }}
      />

      <StudentForm
        open={edit}
        onClose={() => setEdit(false)}
        student={student}
        onSaved={(p) => {
          setData(p);
          setEdit(false);
          // A revogação apaga o rascunho do junto: relê para o card não oferecer retomar.
          setRascunho(questionario ? lerRascunho(chaveRascunho({ studentId: id })) : null);
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

/**
 * Aba Resumo: o questionário no topo (ResumoAluno, quando há respostas) e os próximos passos no lugar da lista de antes
 * (sempre; dentro do resumo, no bloco 2, quando ele aparece). Depois, o que o personal confere antes da aula:
 * frequência, último treino, medidas e validade da ficha (fora da impressão do resumo).
 */
function Summary({
  student,
  ws,
  hoje,
  justCreated,
  recebido,
  questionario,
  version,
  rascunho,
  onDescartarRascunho,
  onTab,
  onEdit,
  onChange,
  onFichaSent,
}: {
  student: Profile;
  ws?: WorkStyle;
  hoje: Date;
  justCreated: boolean;
  recebido: boolean;
  questionario: boolean;
  version: number;
  rascunho: Rascunho | null;
  onDescartarRascunho: () => void;
  onTab: (t: Tab) => void;
  onEdit: () => void;
  onChange: (p: Profile) => void;
  onFichaSent: () => void;
}) {
  const { repo, user } = useApp();
  const id = student.id;
  const { data, loading, error } = useLoad<SummaryData>(async () => {
    const [sessions, programs, metrics, diet] = await Promise.all([repo.listSessions(id), repo.listPrograms(id), repo.listMetrics(id), repo.getDiet(id)]);
    return { sessions, programs, metrics, hasDiet: Boolean(diet?.meals.some((m) => m.items.length)) };
  }, [id, repo]);
  const resumo = useMemo(() => summarize({ profile: student, ws, hoje }), [student, ws, hoje]);
  // Com respostas legíveis, os passos entram no resumo (bloco 2); senão, ficam no topo da aba.
  const passosNoResumo = Boolean(resumo && !resumo.problema);
  const parte = useMemo(() => {
    if (!rascunho) return "";
    const nomes = { personal: user?.name ?? "", aluno: student.name };
    return comNomes(SECAO_TITULO[secaoDoRascunho(rascunho, ctxDoJunto({ hoje, ...nomes, atendimento: ws?.atendimento }), "junto")], nomes);
  }, [rascunho, user?.name, student.name, hoje, ws?.atendimento]);

  const passos = loading ? (
    <Skeleton className="no-print h-32" />
  ) : data ? (
    <ProximosPassos
      student={student}
      ws={ws}
      activeProgram={data.programs.find((p) => p.active) ?? null}
      metricsCount={data.metrics.length}
      hasDiet={data.hasDiet}
      hoje={hoje}
      questionario={questionario}
      version={version}
      onChange={onChange}
      onTab={onTab}
      onFichaSent={onFichaSent}
    />
  ) : null;

  return (
    <div className="space-y-4">
      {justCreated ? (
        <Alert tone="done" className="no-print">
          {avisoCadastroNovo(student, questionario)}
        </Alert>
      ) : null}
      {recebido ? (
        <Alert tone="done" className="no-print">
          {RECEBER_TEXTO.pronto}
        </Alert>
      ) : null}

      {questionario && rascunho ? (
        <section aria-label="Questionário pela metade" className="no-print ph-no-capture flex flex-col gap-3 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex min-w-0 items-start gap-2 font-semibold">
            <ClipboardList className="mt-0.5 size-5 shrink-0 text-steel" aria-hidden />
            <span className="min-w-0">{textoPelaMetade(parte)}</span>
          </p>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <LinkButton href={`/questionario?aluno=${encodeURIComponent(id)}`} className="w-full sm:w-auto">
              Continuar
            </LinkButton>
            <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={onDescartarRascunho} className="w-full sm:w-auto">
              Descartar
            </Button>
          </div>
        </section>
      ) : null}

      <ResumoAluno student={student} ws={ws} hoje={hoje} origem={recebido ? "receber" : "aba"} onChange={onChange} passos={passosNoResumo ? passos : undefined} />
      {passosNoResumo ? null : passos}

      {loading ? (
        <Skeleton className="no-print h-72" />
      ) : error || !data ? (
        <Alert tone="error" className="no-print">
          {error ?? "Não foi possível carregar o resumo."}
        </Alert>
      ) : (
        <SummaryPanels student={student} data={data} onTab={onTab} onEdit={onEdit} />
      )}
    </div>
  );
}

/** Frequência, último treino, ficha ativa, medidas e o atalho do relatório (não entram na impressão do resumo). */
function SummaryPanels({ student, data, onTab, onEdit }: { student: Profile; data: SummaryData; onTab: (t: Tab) => void; onEdit: () => void }) {
  const { mode } = useApp();
  const id = student.id;

  const weeks = useMemo(() => {
    const out: { start: string; count: number }[] = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 86_400_000);
      const start = weekStart(d.toISOString());
      out.push({ start, count: data.sessions.filter((s) => weekStart(s.startedAt) === start).length });
    }
    return out;
  }, [data]);

  const first = firstName(student.name);
  const active = data.programs.find((p) => p.active) ?? null;
  const validity = active ? programValidity(active.createdAt, active.durationWeeks) : null;
  const vIcon = validityIcon(validity);
  const VIcon = vIcon === "CalendarX" ? CalendarX : vIcon === "CalendarClock" ? CalendarClock : null;
  const last = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  const target = student.daysPerWeek ?? 0;
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

  return (
    <div className="no-print space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={mode === "local" ? "Treinos recebidos nas últimas 4 semanas" : "Frequência nas últimas 4 semanas"}>
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
                  {/* Indicador sem cor de estado (U7 R6): os quadradinhos já mostram a proporção. */}
                  <span className="num shrink-0 font-semibold text-iron">
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
                <p className="mt-2">
                  <RecordMark count={last.prs.length} />
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
              <Link href={`/alunos/${id}/ficha/${active.id}`} className="-my-2 inline-flex min-h-10 items-center text-sm font-semibold underline pointer-coarse:min-h-11">
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
                // Atenção = ícone âmbar e texto iron (U7 R3); em dia, steel sem ícone.
                <p className={cx("mt-2 flex items-start gap-1.5 text-sm font-semibold", validityTone(validity) === "warn" ? "text-iron" : "text-steel")}>
                  {VIcon ? <VIcon className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-hidden /> : null}
                  <span className="min-w-0">
                    Ficha {validity.label}
                    {validity.state !== "ok" ? ". Hora de renovar o estímulo." : ""}
                  </span>
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
            <button type="button" onClick={() => onTab("evolucao")} className="-my-2 inline-flex min-h-10 items-center text-sm font-semibold underline pointer-coarse:min-h-11">
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

      {data.sessions.length || sortedMetrics.length ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-ficha)] border border-rule bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-bold">Relatório de evolução</h2>
            <p className="mt-0.5 text-sm text-steel">Presença, exercícios que melhoraram e medidas do período, prontos para enviar a {first} pelo WhatsApp ou em PDF.</p>
          </div>
          <Button variant="secondary" onClick={() => onTab("relatorio")} icon={<FileText className="size-4" />} className="shrink-0">
            Abrir relatório
          </Button>
        </div>
      ) : null}
    </div>
  );
}
