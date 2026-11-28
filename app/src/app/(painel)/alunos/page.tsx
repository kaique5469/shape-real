"use client";

import Link from "next/link";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, CalendarX, ChevronRight, ClipboardList, Clock, FileText, Hourglass, Inbox, MessageCircle, OctagonX, Search, Trash2, UserPlus, X, type LucideIcon } from "lucide-react";
import { StudentForm, useQuestionarioLigado, type StudentSavedModo } from "@/components/student-form";
import { InviteDialog } from "@/components/invite-dialog";
import { InstallCard } from "@/components/pwa";
import { ColarLink } from "@/components/colar-link";
import { BackupReminder } from "@/components/backup-reminder";
import { Alert, Badge, Button, Dialog, Empty, Input, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtNum, relativeDay, textosDoPainel, useLoad } from "@/lib/hooks";
import { programValidity, waLink, type Validity } from "@/lib/domain/format";
import {
  LIST_TOOLS_MIN,
  calendarDaysSince,
  contactMessage,
  contactReason,
  daysWithoutNews,
  displayNames,
  inactiveThreshold,
  matchesQuery,
  namesList,
  pendingText,
  programLine,
  reasonLabel,
  resultsStatus,
  splitQueue,
  studentBand,
  topReason,
  type AttentionReason,
  type ContactReason,
} from "@/lib/domain/attention";
import { CARTAO_JEITO_KEY, CARTAO_JEITO_TEXTO, diasDePedidoPendente, mostrarCartaoJeito, seloDoAluno, type Selo } from "@/lib/domain/anamnese-perfil";
import { todayISO } from "@/lib/domain/ids";
import { textoParciais } from "@/lib/domain/session-time";
import { GOAL_LABEL } from "@/lib/domain/generator";
import { PLANS, studentQuota } from "@/lib/domain/plans";
import { welcomeRequested } from "@/lib/entry-points";
import { track } from "@/lib/analytics";
import { limparRascunhosVencidos } from "@/lib/questionario-client";
import { rotaDepoisDoCadastro } from "@/lib/student-form-state";
import type { Repository } from "@/lib/data/repository";
import type { Invite, Profile, StudentSummary } from "@/lib/domain/types";

/** Data (AAAA-MM-DD) da última vez que coach_list_viewed foi enviado: no máximo 1 vez por dia. */
const LIST_VIEWED_KEY = "sr:coach-list-viewed";
/** Âncora do "Ver todos" do alerta. */
const LIST_ID = "lista-alunos";
const QUEUE_TITLE_ID = "fila-alunos-titulo";

export default function AlunosPage() {
  return (
    <Suspense>
      <Alunos />
    </Suspense>
  );
}

/** Aluno com a semana (segunda a domingo) e a meta já resolvidas, a pendência do cartão e o motivo de chamar, se houver. */
interface Row {
  s: StudentSummary;
  /** Treinos recebidos de segunda a domingo; null se não deu para ler. */
  week: number | null;
  /** Meta da semana (ficha ativa ou perfil); null sem meta. */
  goal: number | null;
  /** Dias sem notícias, a partir do último treino recebido ou, sem nenhum, do vínculo ou da ficha (o mais recente). */
  newsDays: number;
  /** Parado: newsDays ≥ inactiveThreshold(meta). */
  quiet: boolean;
  validity: Validity | null;
  /** Pendência do cartão (sem ficha → sem notícias → vencida → vencendo); null quando não há. */
  top: AttentionReason | null;
  /** Motivo do "Chamar" da fila; aluno sem ficha só tem o do questionário pendente. */
  reason: ContactReason | null;
  /** Dias desde o pedido do questionário ainda sem resposta (só com a chave ligada); null sem pedido pendente. */
  pedidoDias: number | null;
  /** Selo do questionário (spec §6.1): um por linha, nunca nomeia condição. */
  selo: { selo: Selo; texto: string } | null;
  /** Urgência para ordenar a lista (maior primeiro). */
  score: number;
}

/** Ícone de cada selo do questionário: o texto diz o estado; o ícone e a cor só reforçam. */
const SELO_ICON: Record<Selo, { Icon: LucideIcon; tone: string }> = {
  nao_comecar: { Icon: OctagonX, tone: "text-danger" },
  liberacao_pendente: { Icon: FileText, tone: "text-warn-ink" },
  respostas_novas: { Icon: Inbox, tone: "text-info-ink" },
  questionario_pendente: { Icon: Hourglass, tone: "text-steel" },
};

/** Ícone de cada pendência do cartão (o de ficha é o mesmo de validityIcon). */
const REASON_ICON: Record<AttentionReason, LucideIcon> = {
  sem_ficha: ClipboardList,
  sem_noticias: Clock,
  ficha_vencida: CalendarX,
  ficha_vencendo: CalendarClock,
};

/**
 * Lista de alunos com a contagem da semana de segunda a domingo e a meta da ficha ativa (ou do perfil):
 * o mesmo "N de M" que o aluno vê no Hoje. A semana tem no máximo 14 treinos lidos por aluno.
 */
/** Semana e meta já vêm no resumo de cada aluno (summarizeStudent): uma consulta para a lista toda, sem N+1. */
async function loadStudents(repo: Repository, coachId: string) {
  const list = await repo.listStudents(coachId);
  return list.map((s) => ({ s, week: s.sessionsWeek, goal: s.weeklyGoal }));
}

/** `questionario`: chave ligada (o pedido pendente entra na fila de contato só com ela). */
function toRow({ s, week, goal }: { s: StudentSummary; week: number | null; goal: number | null }, now: Date, questionario: boolean): Row {
  const hasProgram = s.activeProgram !== null;
  const validity = s.activeProgram ? programValidity(s.activeProgram.createdAt, s.activeProgram.durationWeeks, now) : null;
  // Quem nunca mandou treino conta da ficha, se ela for mais nova que o vínculo: ficha recém-montada não nasce com alarme.
  const newsDays = daysWithoutNews({ lastSessionAt: s.lastSessionAt, linkedAt: s.linkedAt, programCreatedAt: s.activeProgram?.createdAt ?? null }, now);
  const quiet = newsDays >= inactiveThreshold(goal);
  const score = (hasProgram ? 0 : 4) + (validity?.state === "expired" ? 3 : validity?.state === "soon" ? 1 : 0) + (quiet ? 2 : 0);
  const pedidoDias = questionario ? diasDePedidoPendente(s.profile, now) : null;
  return {
    s,
    week,
    goal,
    newsDays,
    quiet,
    validity,
    top: topReason({ hasProgram, quiet, validity }),
    reason: contactReason(quiet, validity, hasProgram, pedidoDias),
    pedidoDias,
    selo: seloDoAluno(s.profile, now),
    score,
  };
}

/** Dias desde o último treino recebido; quem nunca mandou vem antes. */
function gap(s: StudentSummary, now: Date) {
  return s.lastSessionAt ? calendarDaysSince(s.lastSessionAt, now) : Infinity;
}

function Alunos() {
  const { user, repo, plan, isTester, isDemo, startSolo } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const { data, loading, error, reload } = useLoad(() => loadStudents(repo, user!.id), [user?.id, repo]);
  const [welcome, setWelcome] = useState(() => welcomeRequested(params));
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmSamples, setConfirmSamples] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [goingSolo, setGoingSolo] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** "{nome} foi salvo. Sem internet: …" (cadastro sem rede, spec §5.1). */
  const [savedOffline, setSavedOffline] = useState<string | null>(null);
  const questionario = useQuestionarioLigado();
  // Cartão do jeito de trabalhar: "Agora não" fica gravado neste aparelho (lido depois de montar).
  const [jeitoDispensado, setJeitoDispensado] = useState(true);
  useEffect(() => {
    try {
      setJeitoDispensado(localStorage.getItem(CARTAO_JEITO_KEY) === "0");
    } catch {
      setJeitoDispensado(false);
    }
    // Rascunhos do questionário vencidos (30 dias sem edição; 7 dias depois do toque em Enviar) saem ao abrir o painel.
    limparRascunhosVencidos(new Date());
  }, []);
  const showJeito = mostrarCartaoJeito(user, questionario, jeitoDispensado);

  const canManage = repo.capabilities.managedStudents;
  const local = repo.mode === "local";
  // R3-15: no modo local o personal só tem os treinos que o aluno mandou ("mandou treino", nunca "treinou").
  const textos = textosDoPainel(local);
  const rows = useMemo(() => {
    const now = new Date();
    return (data ?? [])
      .map((d) => toRow(d, now, questionario))
      .sort((a, b) => {
        const ga = gap(a.s, now);
        const gb = gap(b.s, now);
        // Quem está na fila "precisa de mensagem" (motivo de contato) vem antes: o "Ver todos" do alerta acha os "mais N"
        // no topo. Dentro de cada grupo, a urgência (score) de sempre.
        return Number(Boolean(b.reason)) - Number(Boolean(a.reason)) || b.score - a.score || (ga === gb ? 0 : gb > ga ? 1 : -1) || a.s.profile.name.localeCompare(b.s.profile.name);
      });
  }, [data, questionario]);
  const students = useMemo(() => rows.map((r) => r.s), [rows]);
  const listTools = students.length >= LIST_TOOLS_MIN;
  // Busca pelo início de cada palavra do nome, sem acento ("ana" acha Ana Souza, não Juliana). Sem o campo na tela
  // (ex.: abaixo de 7 depois de "Remover exemplos"), uma busca antiga não filtra nada.
  const activeQuery = listTools ? query : "";
  const shown = rows.filter((r) => matchesQuery(r.s.profile.name, activeQuery));
  const searching = activeQuery.trim().length > 0;
  // Só alunos com ficha: quem não tem ficha está na pendência "Sem ficha ativa", não em "sem notícias".
  const quietCount = rows.filter((r) => r.top === "sem_noticias").length;
  // Mesma semana do Hoje do aluno: segunda a domingo.
  const activeWeek = rows.filter((r) => (r.week ?? 0) > 0).length;
  // Fila de quem precisa de uma mensagem, na mesma ordem de urgência da lista.
  const queue = splitQueue(rows.filter((r) => r.reason));
  const queueNames = displayNames(queue.shown.map((r) => r.s.profile.name));
  const samples = students.filter((s) => s.profile.sample);
  // Modo local (beta): sem limite de alunos; exemplos não contam.
  const quota = studentQuota(students, { local, plan });
  const full = quota.full;

  // Quantos alunos os personais acompanham (faixa, sem nomes): no máximo 1 vez por dia, fora da demonstração.
  const band = loading || error ? null : studentBand(quota.count);
  useEffect(() => {
    if (!band || isDemo) return;
    try {
      const today = todayISO();
      if (localStorage.getItem(LIST_VIEWED_KEY) === today) return;
      localStorage.setItem(LIST_VIEWED_KEY, today);
    } catch {
      // Sem armazenamento não há como garantir 1 vez por dia: não envia.
      return;
    }
    track("coach_list_viewed", { faixa_alunos: band });
  }, [band, isDemo]);

  // Busca: o resultado vai para o leitor de tela 500 ms depois da última tecla, nunca na primeira renderização.
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refocusSearch = useRef(false);
  const [announce, setAnnounce] = useState("");
  useEffect(() => () => {
    if (announceTimer.current) clearTimeout(announceTimer.current);
  }, []);

  function changeQuery(value: string) {
    setQuery(value);
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnounce(resultsStatus(rows.filter((r) => matchesQuery(r.s.profile.name, value)).length)), 500);
  }

  function clearSearch() {
    refocusSearch.current = true;
    changeQuery("");
  }

  // Durante a busca a fila some (ela fica acima do campo). Se o campo com foco saiu da tela por isso, ele volta.
  // Depois de "Limpar busca", o foco volta ao campo já com a fila de volta no lugar.
  useLayoutEffect(() => {
    if (refocusSearch.current) {
      refocusSearch.current = false;
      searchRef.current?.focus();
      return;
    }
    const box = searchBoxRef.current;
    if (searching && box && box.contains(document.activeElement)) box.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [searching]);

  function dismissJeito() {
    setJeitoDispensado(true);
    try {
      localStorage.setItem(CARTAO_JEITO_KEY, "0");
    } catch {
      /* sem armazenamento: o cartão some agora e pode voltar na próxima visita */
    }
  }

  /** Depois de salvar no cadastro (spec §5.1): questionário, página do aluno ou, sem rede, o aviso aqui mesmo. */
  function afterSaved(p: Profile, modo: StudentSavedModo | undefined) {
    setFormOpen(false);
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const destino = rotaDepoisDoCadastro(p, modo ?? "completo", online);
    if ("href" in destino) {
      router.push(destino.href);
      return;
    }
    setSavedOffline(destino.aviso);
    void reload();
  }

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

  // Com contas na nuvem há dois caminhos: cadastrar o aluno direto (ele assume depois) ou mandar um convite para ele se cadastrar.
  const addAction = canManage ? (
    <>
      <Button onClick={() => setFormOpen(true)} icon={<UserPlus className="size-4" />} disabled={full}>
        Adicionar aluno
      </Button>
      {repo.capabilities.invites ? (
        <Button variant="secondary" onClick={newInvite} loading={inviting} disabled={full}>
          Convidar por link
        </Button>
      ) : null}
    </>
  ) : (
    <Button onClick={newInvite} loading={inviting} icon={<UserPlus className="size-4" />} disabled={full}>
      Convidar aluno
    </Button>
  );

  return (
    <>
      <PageHeader title="Alunos" sub={textos.sub} actions={addAction} />

      <div className="mb-4 space-y-2 empty:hidden">
        <ColarLink />
        <BackupReminder where="alunos" />
      </div>

      {!welcome ? (
        <div className="mb-4">
          <InstallCard variant="banner" where="alunos" />
        </div>
      ) : null}

      {welcome ? (
        <section aria-label="Por onde começar" className="mb-6 rounded-[8px] border border-rule-strong bg-paper">
          <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
            <div>
              <h2 className="text-lg font-bold">{isTester ? "Você está no painel do personal" : "Seu painel está pronto"}</h2>
              <p className="mt-0.5 text-sm text-steel">
                {local ? "Sem cadastro: tudo fica salvo neste aparelho." : "Seus alunos e fichas ficam salvos na sua conta."}
                {samples.length ? (samples.length === 1 ? " O aluno marcado como exemplo abaixo é fictício, para você explorar." : ` Os ${samples.length} alunos marcados como exemplo abaixo são fictícios, para você explorar.`) : ""}
              </p>
            </div>
            <button type="button" onClick={dismissWelcome} aria-label="Fechar instruções" className="-mr-1.5 -mt-1 grid size-11 shrink-0 place-items-center rounded-[6px] hover:bg-chalk-2">
              <X className="size-5" />
            </button>
          </div>
          <ol className="ruled">
            {[
              canManage
                ? {
                    n: 1,
                    title: "Cadastre um aluno",
                    body: questionario ? "Nome e WhatsApp. O questionário inicial, com o aluno do seu lado ou pelo WhatsApp, completa o resto." : "Nome, objetivo, rotina e limitações. Leva um minuto.",
                    action: () => setFormOpen(true),
                    cta: "Adicionar",
                  }
                : { n: 1, title: "Convide um aluno", body: "Ele cria a conta pelo link e cai direto no seu painel.", action: newInvite, cta: "Convidar" },
              { n: 2, title: "Monte a ficha e a dieta", body: "Gere uma base pelas regras do app e ajuste, ou monte do zero. Depois envie pelo WhatsApp ou imprima.", action: null, cta: "" },
              isTester
                ? { n: 3, title: "Veja o app como o aluno", body: "Na página do aluno, toque em “Ver como aluno” e registre um treino. O aluno de verdade recebe a ficha por link no WhatsApp, sem cadastro.", action: null, cta: "" }
                : local
                  ? { n: 3, title: "Envie para o celular do aluno", body: "Na página do aluno, toque em “Enviar para o celular”. Ele abre o link no WhatsApp e treina pelo app, sem cadastro.", action: null, cta: "" }
                  : { n: 3, title: "Veja o app como o aluno", body: "Na página do aluno, toque em “Ver como aluno”. O aluno entra com a própria conta, no celular dele.", action: null, cta: "" },
            ].map((s) => (
              <li key={s.n} className="flex items-center gap-3 px-4 py-3">
                <span className="plate-type num grid size-8 shrink-0 place-items-center rounded-full border border-rule-strong text-sm">{s.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-sm text-steel">{s.body}</span>
                </span>
                {s.action ? (
                  <Button variant="secondary" onClick={s.action} className="shrink-0">
                    {s.cta}
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
          {local ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-3">
              <p className="text-sm text-steel">Quer ver o lado de quem treina sem personal?</p>
              <Button variant="ghost" onClick={trySolo} loading={goingSolo}>
                Testar como aluno que treina sozinho
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {savedOffline ? (
        <Alert tone="done" className="mb-5">
          {savedOffline}
        </Alert>
      ) : null}

      {showJeito ? (
        <section aria-label="Seu jeito de trabalhar" className="ph-no-capture mb-5 flex flex-col gap-3 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-[0.9375rem]">{CARTAO_JEITO_TEXTO}</p>
          <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={dismissJeito}>
              Agora não
            </Button>
            <LinkButton href="/conta?jeito=1" variant="secondary">
              Responder
            </LinkButton>
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
                {quota.count}
                {quota.max === null ? null : <span className="text-sm text-steel">/{quota.max}</span>}
                {samples.length ? <span className="block text-xs font-normal tracking-normal text-steel [font-stretch:normal]">+{samples.length} de exemplo</span> : null}
              </dd>
            </div>
            <div className="px-1">
              <dt className="text-xs text-steel">{textos.semana}</dt>
              <dd className="num plate-type text-2xl">{activeWeek}</dd>
            </div>
            <div className="px-1">
              {/* Modo local: o personal só vê o treino que o aluno mandou. "Sem treinar" só vale na nuvem. */}
              <dt className="text-xs text-steel">{local ? "Sem notícias" : "Sem treinar"}</dt>
              <dd className="num plate-type text-2xl text-iron">{quietCount}</dd>
            </div>
          </dl>

          {/* Fila enxuta: até 3 nomes e "e mais N", um "Chamar" por nome (em linha própria no celular) e "Ver todos" para a lista.
              Some durante a busca: o resultado da busca é a lista. */}
          {queue.shown.length && !searching ? (
            <section aria-labelledby={QUEUE_TITLE_ID} className="rounded-[var(--radius-ficha)] border border-plate-yellow/60 bg-plate-yellow/12 px-3.5 py-3 text-[0.9375rem] text-iron">
              <h2 id={QUEUE_TITLE_ID}>
                <strong>{namesList(queueNames, queue.rest)}</strong> {queue.shown.length + queue.rest > 1 ? "precisam" : "precisa"} de uma mensagem.
              </h2>
              <ul className="mt-1 divide-y divide-plate-yellow/50">
                {queue.shown.map((r, i) => {
                  const reason = r.reason!;
                  const name = queueNames[i] ?? r.s.profile.name;
                  const daysLeft = r.validity?.days ?? 0;
                  return (
                    <li key={r.s.profile.id} className="flex flex-col gap-2 py-2.5 last:pb-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <p className="min-w-0 text-sm leading-snug">
                        <span className="font-semibold">{name}</span>
                        <span className="text-steel"> · {reasonLabel(reason, { lastSessionAt: r.s.lastSessionAt, daysLeft, daysWithoutNews: r.newsDays, pedidoDias: r.pedidoDias ?? undefined }, repo.mode)}</span>
                      </p>
                      <a
                        href={waLink(contactMessage(reason, r.s.profile.name, daysLeft), r.s.profile.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => track("student_contacted", { where: "alerta_parados", reason })}
                        className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-4 text-[0.9375rem] font-semibold hover:border-iron sm:w-auto"
                      >
                        <MessageCircle className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">Chamar {name}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
              {queue.rest > 0 ? (
                <a href={`#${LIST_ID}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-plate-blue-ink underline underline-offset-2 hover:text-iron">
                  Ver todos
                </a>
              ) : null}
            </section>
          ) : null}

          {/* Destino do "Ver todos": a lista já vem ordenada por urgência. scroll-mt: o cabeçalho fixo do celular não cobre o topo. */}
          <div id={LIST_ID} className="scroll-mt-20 space-y-5">
            {listTools ? (
              <div ref={searchBoxRef} className="relative scroll-mt-20">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" aria-hidden />
                <Input ref={searchRef} value={query} onChange={(e) => changeQuery(e.target.value)} placeholder="Buscar aluno" aria-label="Buscar aluno" className="pl-9" />
                <p role="status" className="sr-only">
                  {announce}
                </p>
              </div>
            ) : null}

            {shown.length ? (
              <ul className="space-y-2">
                {shown.map((r) => (
                  <StudentRow key={r.s.profile.id} row={r} mode={repo.mode} />
                ))}
              </ul>
            ) : (
              <div className="rounded-[8px] border border-dashed border-rule-strong px-4 py-6 text-center">
                <p className="text-steel">Nenhum aluno com “{query.trim()}”.</p>
                <Button variant="ghost" onClick={clearSearch} className="mt-2">
                  Limpar busca
                </Button>
              </div>
            )}
          </div>

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

          {quota.max !== null && plan !== "coach" ? (
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

      <StudentForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={(p, _created, modo) => afterSaved(p, modo)} />

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

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} invite={invite} />
    </>
  );
}

/**
 * Linha do aluno (um único Link, sem botões dentro), nesta ordem (U4 §3.4):
 *  1. nome e o selo "exemplo"; embaixo, o selo do questionário (ícone + texto, nunca nomeia condição);
 *  2. pendência, com ícone e sem corte (quebra em até 2 linhas): "Sem ficha ativa", "Sem notícias há 9 dias · …",
 *     "Ficha vencida há 5 dias", "Ficha vence em 3 dias";
 *  3. semana de segunda a domingo e a meta da ficha ativa ou do perfil (o mesmo "2 de 3" do Hoje do aluno) e o
 *     último retorno, que sai quando a pendência é "sem notícias" (ela já diz);
 *  4. ficha, com o estado ANTES do nome: o corte cai no nome, nunca em "Ficha vence em 2 dias".
 * O peso (a partir de sm) vem depois de tudo isso, em cinza normal.
 */
function StudentRow({ row, mode }: { row: Row; mode: "local" | "supabase" }) {
  const { s, week, goal, top, validity } = row;
  const last = s.lastSessionAt ? relativeDay(s.lastSessionAt) : mode === "local" ? "nada recebido ainda" : "nenhum treino ainda";
  // "2 de 4 na semana · 1 parcial" (R3-4 item 2): parcial = menos da metade das séries planejadas; só aparece com 1 ou mais.
  const parciais = week === null ? null : textoParciais(s.partialWeek);
  const summary = [week === null ? null : `${week}${goal ? ` de ${goal}` : ""} na semana`, parciais, top === "sem_noticias" ? null : last].filter(Boolean).join(" · ");
  const ficha = programLine({ programName: s.activeProgram?.name ?? null, goalLabel: s.profile.goal ? GOAL_LABEL[s.profile.goal] : null, validity, top });
  const Icon = top ? REASON_ICON[top] : null;
  const selo = row.selo ? { ...row.selo, ...SELO_ICON[row.selo.selo] } : null;
  return (
    <li>
      <Link href={`/alunos/${s.profile.id}`} className="flex items-center gap-3 rounded-[8px] border border-rule bg-paper px-3 py-3 hover:border-iron sm:px-4">
        <span className="plate-type grid size-11 shrink-0 place-items-center rounded-full bg-iron text-chalk">{s.profile.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-bold">{s.profile.name}</span>
            {s.profile.sample ? <Badge className="shrink-0">exemplo</Badge> : null}
          </span>
          {selo ? (
            // ph-no-capture: o toque no selo não vai para a medição (o selo é derivado de saúde, spec §11.3).
            <span data-selo={selo.selo} className="ph-no-capture num block text-sm font-semibold leading-snug text-iron">
              <selo.Icon className={`mr-1.5 inline-block size-4 align-[-3px] ${selo.tone}`} aria-hidden />
              {selo.texto}
            </span>
          ) : null}
          {top && Icon ? (
            // Ícone na linha do texto (não numa coluna à parte): a 2ª linha usa a largura toda e
            // "Sem notícias há 12 dias · último treino recebido em 11/11" cabe em 2 linhas a 360 px.
            <span data-pendencia={top} className="num block text-sm font-semibold leading-snug text-iron">
              <Icon className="mr-1.5 inline-block size-4 align-[-3px] text-warn-ink" aria-hidden />
              {pendingText(top, { lastSessionAt: s.lastSessionAt, daysWithoutNews: row.newsDays, validity }, mode)}
            </span>
          ) : null}
          {summary ? <span className="num block text-sm text-steel">{summary}</span> : null}
          {ficha ? (
            <span data-ficha className="flex min-w-0 items-baseline text-sm text-steel">
              {ficha.state ? (
                <span data-ficha-estado className="num max-w-full shrink-0 font-semibold text-iron">
                  {ficha.state}
                </span>
              ) : null}
              <span className="min-w-0 truncate">
                {ficha.state ? " · " : ""}
                {ficha.name}
              </span>
            </span>
          ) : null}
        </span>
        {s.latestWeightKg ? (
          <span className="hidden text-right text-sm font-normal text-steel sm:block">
            <span className="num block">{fmtNum(s.latestWeightKg)} kg</span>
            <span className="num block">{s.weightDelta28d ? `${s.weightDelta28d > 0 ? "+" : "−"}${fmtNum(Math.abs(s.weightDelta28d))} em 28 dias` : "peso atual"}</span>
          </span>
        ) : null}
        <ChevronRight className="size-5 shrink-0 text-steel" aria-hidden />
      </Link>
    </li>
  );
}
