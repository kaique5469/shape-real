"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CalendarClock, CalendarX, Check, ChevronDown, MessageCircle, Play, Plus } from "lucide-react";
import { BackupReminder } from "@/components/backup-reminder";
import { ColarLink } from "@/components/colar-link";
import { FichaDay } from "@/components/ficha";
import { InstallCard } from "@/components/pwa";
import { RecordMark } from "@/components/record-mark";
import { SendToCoach, usePendingWorkouts } from "@/components/transfer-share";
import { TargetsList } from "@/components/views/diet-read";
import { estimateDayMinutes } from "@/lib/domain/generator";
import { Alert, Empty, LinkButton, Panel, Segmented, Skeleton, cx } from "@/components/ui";
import { track } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { coachContact, fmtDate, fmtNum, nextDayKey, recentRecords, relativeDay, returnNotice, useLoad, weekGoal } from "@/lib/hooks";
import { weekStart, weekStreak } from "@/lib/domain/progression";
import { targetsForProfile } from "@/lib/domain/nutrition";
import { programValidity } from "@/lib/domain/format";
import { useAI } from "@/lib/ai/client";
import { validityIcon, validityTone } from "@/lib/ui/tone";
import { draftProgressText, readDraftInfo, type DraftInfo } from "@/lib/workout-draft";

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function HojePage() {
  return (
    <Suspense>
      <Hoje />
    </Suspense>
  );
}

function Hoje() {
  const { user, repo, mode, returnTo } = useApp();
  const ai = useAI(mode === "supabase");
  const params = useSearchParams();
  const { data, loading, error } = useLoad(async () => {
    const [programs, sessions, coach, diet] = await Promise.all([repo.listPrograms(user!.id), repo.listSessions(user!.id), repo.getCoach(user!.id), repo.getDiet(user!.id)]);
    // O vínculo só traz id e nome; telefone e CREF vêm do cadastro do personal guardado neste aparelho.
    const coachProfile = coach && repo.mode === "local" ? await repo.getProfile(coach.id).catch(() => null) : null;
    return { program: programs.find((p) => p.active) ?? null, sessions, coach, coachProfile, diet };
  }, [user?.id, repo]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [sentTick, setSentTick] = useState(0);
  // sentTick faz reler o que já foi enviado depois de um envio.
  const pending = usePendingWorkouts(data?.sessions, sentTick);
  // Depois de um toque, o envio continua montado mesmo sem pendentes: a cópia deixa o diálogo aberto com
  // "Mensagem copiada às …", e a faixa sumir no meio fecharia o diálogo junto (mesma regra do Histórico).
  const [sentNow, setSentNow] = useState(false);
  // Treino começado e ainda não finalizado (fica guardado no aparelho).
  const [ongoing, setOngoing] = useState<DraftInfo | null>(null);
  useEffect(() => {
    if (user) setOngoing(readDraftInfo(user.id));
  }, [user]);

  const stats = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const thisWeek = weekStart(now.toISOString());
    const weekSessions = data.sessions.filter((s) => weekStart(s.startedAt) === thisWeek);
    const doneDays = new Set(weekSessions.map((s) => (new Date(s.startedAt).getDay() + 6) % 7));
    const month = data.sessions.filter((s) => now.getTime() - new Date(s.startedAt).getTime() < 30 * 86_400_000).length;
    // Cada recorde com a série que bateu a marca (a mesma do resumo do treino).
    const prs = recentRecords(data.sessions, 5);
    return { doneDays, streak: weekStreak(data.sessions), month, weekVolume: weekSessions.reduce((a, s) => a + s.volumeKg, 0), prs, back: returnNotice(data.sessions, now) };
  }, [data]);

  if (loading) return <LoadingHoje />;
  if (error || !data || !stats) return <Alert tone="error">{error ?? "Erro ao carregar."}</Alert>;

  const first = user!.name.split(" ")[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  // Metas da dieta salva (inclusive a enviada pelo personal) têm prioridade sobre o cálculo automático.
  const targets = data.diet?.targets ?? targetsForProfile(user!);
  const program = data.program;
  const dayKey = program ? (chosen ?? nextDayKey(program, data.sessions)) : null;
  const day = program?.days.find((d) => d.key === dayKey) ?? program?.days[0];
  const today = (new Date().getDay() + 6) % 7;
  const coachName = data.coach?.name && data.coach.name !== "Personal" ? data.coach.name : null;
  const coachFirst = coachName?.split(" ")[0] ?? null;
  const fromCoach = program && program.createdBy !== user!.id ? (coachName ? `ficha de ${coachName}` : "ficha do seu personal") : null;
  const validity = program ? programValidity(program.createdAt, program.durationWeeks) : null;
  const vIcon = validityIcon(validity);
  const VIcon = vIcon === "CalendarX" ? CalendarX : vIcon === "CalendarClock" ? CalendarClock : null;
  // Meta da semana: a mesma conta de /alunos (segunda a domingo ÷ dias da ficha ativa ou do perfil).
  const week = weekGoal(data.sessions, program?.daysPerWeek, user!.daysPerWeek);
  // Personal que acompanha: o do link (nome, telefone e CREF do pacote) ou o vinculado neste aparelho.
  const contact = coachContact(user!.remoteCoach, data.coachProfile ?? (data.coach ? { id: data.coach.id, name: data.coach.name } : null));
  // Aviso de volta depois de pausa: junto do "Começar treino" quando há treino montado; senão, no card da semana.
  const backInCard = Boolean(program && day && day.exercises.length);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-steel first-letter:uppercase">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="plate-type mt-1 text-[2rem] leading-tight sm:text-[2.4rem]">
          {hello}, {first}.
        </h1>
      </header>

      {params.get("nova") ? (
        <Alert tone="done">
          <strong>Sua ficha está pronta.</strong> No primeiro treino, escolha cargas em que sobrem 2 repetições — a partir daí o app sugere quando subir.
        </Alert>
      ) : null}
      {params.get("ficha") ? (
        <Alert tone="done">
          <strong>Ficha salva neste celular.</strong> Toque em “Começar treino” quando chegar na academia. No fim, o app monta a mensagem para você mandar o treino a {user!.remoteCoach?.name.split(" ")[0] ?? "seu personal"}.
        </Alert>
      ) : null}
      {params.get("dieta") ? (
        <Alert tone="done">
          <strong>Dieta salva neste celular.</strong>{" "}
          <Link href="/dieta" className="font-semibold underline">
            Ver a dieta
          </Link>
        </Alert>
      ) : null}
      {params.get("personal") ? (
        <Alert tone="done">
          Você agora é aluno de <strong>{params.get("personal")}</strong>. Quando a ficha e a dieta forem enviadas, elas aparecem aqui.
        </Alert>
      ) : null}

      {ongoing ? (
        <section aria-label="Treino em andamento" className="flex flex-col gap-3 rounded-[8px] border-2 border-iron bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="col-head text-iron">Treino em andamento</p>
            <p className="mt-1 truncate font-bold">{ongoing.dayKey ? `Treino ${ongoing.dayKey}${ongoing.dayTitle ? ` — ${ongoing.dayTitle}` : ""}` : "Treino livre"}</p>
            <p className="num text-sm text-steel">
              {draftProgressText(ongoing)} · iniciado {relativeDay(ongoing.startedAt)}. Ainda não está no histórico.
            </p>
          </div>
          <LinkButton href={ongoing.href} icon={<Play className="size-4" />} className="shrink-0">
            Continuar treino
          </LinkButton>
        </section>
      ) : null}

      {/* Próximo treino: a ação principal do app fica no topo, sem rolar */}
      {program && day ? (
        <section aria-labelledby="proximo" className="space-y-3 rounded-[8px] border border-rule bg-paper p-4">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <h2 id="proximo" className="text-lg font-bold">
                Próximo treino
              </h2>
              <p className="text-sm text-steel">
                {program.name}
                {fromCoach ? ` · ${fromCoach}` : ""}
                {validity && validity.state !== "ok" ? (
                  <>
                    {" · "}
                    {/* Atenção = âmbar no ícone, texto em iron (U7 R3); ícone e rótulo não se separam na quebra. */}
                    <span className={cx("whitespace-nowrap font-semibold", validityTone(validity) === "warn" && "text-iron")}>
                      {VIcon ? <VIcon className="mr-1 inline-block size-4 align-[-0.1875rem] text-warn-ink" aria-hidden /> : null}
                      {validity.label}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            {program.days.length > 1 ? (
              <div className="-mx-1 max-w-full overflow-x-auto px-1">
                <Segmented label="Escolher dia" size="sm" className="min-w-max flex-nowrap" value={day.key} onChange={setChosen} options={program.days.map((d) => ({ value: d.key, label: <span className="block min-w-5 text-center">{d.key}</span> }))} />
              </div>
            ) : null}
          </div>
          {day.exercises.length ? (
            <>
              <div className="flex items-center gap-3">
                <span data-brand className="plate-type grid size-14 shrink-0 place-items-center rounded-full bg-brand text-2xl text-white">{day.key.slice(0, 3)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[1.05rem] font-bold">{day.title || `Treino ${day.key}`}</p>
                  <p className="num text-sm text-steel">
                    {day.exercises.length} {day.exercises.length === 1 ? "exercício" : "exercícios"} · cerca de {estimateDayMinutes(day)} min
                  </p>
                </div>
              </div>
              <LinkButton href={`/sessao?p=${program.id}&d=${encodeURIComponent(day.key)}`} size="lg" className="w-full" icon={<Play className="size-4 fill-current" />}>
                Começar treino {day.key}
              </LinkButton>
              {stats.back ? <p className="text-sm leading-snug text-iron">{stats.back}</p> : null}
              <details className="group rounded-[6px] border border-rule">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-[0.9375rem] font-semibold">
                  Ver os exercícios
                  <ChevronDown className="size-4 text-steel transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="border-t border-rule p-2">
                  <FichaDay day={day} />
                </div>
              </details>
              {program.notes?.trim() ? (
                <details className="rounded-[6px] border border-rule px-3 text-[0.9375rem]">
                  <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Orientações da ficha</summary>
                  <p className="whitespace-pre-wrap pb-3 text-steel">{program.notes}</p>
                </details>
              ) : null}
              <div className="flex justify-center">
                <LinkButton href="/sessao" variant="ghost" size="sm">
                  Prefiro um treino livre
                </LinkButton>
              </div>
            </>
          ) : (
            <Alert tone="info">
              O treino {day.key} ainda não tem exercícios.{" "}
              {fromCoach ? "Seu personal ainda está montando esta parte da ficha." : (
                <Link href={`/treinos/${program.id}`} className="font-semibold underline">
                  Adicionar exercícios
                </Link>
              )}
            </Alert>
          )}
        </section>
      ) : (
        <Empty
          title={
            // Sem servidor, o app só sabe o que está neste aparelho: nunca afirma o que o personal fez ou deixou de fazer.
            data.coach
              ? mode === "local"
                ? `Nenhuma ficha ${coachFirst ? `de ${coachFirst}` : "do seu personal"} neste celular ainda`
                : "Seu personal ainda não enviou a ficha"
              : "Você ainda não tem ficha ativa"
          }
          body={
            data.coach
              ? mode === "local"
                ? `Quando a ficha ${coachFirst ? `de ${coachFirst}` : "do seu personal"} chegar pelo link, ela aparece aqui. Enquanto isso, você pode registrar um treino livre.`
                : `Quando ${coachName ?? "seu personal"} enviar a ficha, ela aparece aqui. Enquanto isso, você pode registrar um treino livre.`
              : ai.enabled
                ? "Monte uma ficha com IA em segundos, no sistema que você preferir, ou registre um treino livre."
                : "Monte sua ficha em um minuto, no sistema que você preferir, ou registre um treino livre."
          }
          action={
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {!data.coach ? (
                  <LinkButton href="/treinos/novo" icon={<Plus className="size-4" />}>
                    {ai.enabled ? "Montar ficha com IA" : "Montar ficha"}
                  </LinkButton>
                ) : null}
                <LinkButton href="/sessao" variant="secondary">
                  Treino livre
                </LinkButton>
              </div>
              {/* Ficha que chegou pelo WhatsApp e abriu fora do app (no iPhone, o Safari não divide os dados com o app). */}
              <ColarLink />
            </div>
          }
        />
      )}

      {pending.length || sentNow ? (
        // Sem pendentes (logo depois do envio), a faixa some mas o mesmo nó continua montado ("contents", sem caixa
        // nem nome de região), para o diálogo do envio não fechar sozinho.
        <section aria-label={pending.length ? "Treinos para enviar" : undefined} className={pending.length ? "flex flex-col gap-3 rounded-[8px] border border-rule bg-paper p-4 sm:flex-row sm:items-center sm:justify-between" : "contents"}>
          {pending.length ? (
            <div className="min-w-0">
              <h2 className="text-[0.9375rem] font-bold">{pending.length === 1 ? "1 treino ainda não enviado" : `${pending.length} treinos ainda não enviados`}</h2>
              <p className="text-sm text-steel">Mande para {user!.remoteCoach ? user!.remoteCoach.name.split(" ")[0] : "seu personal"} acompanhar suas cargas e ajustar a ficha.</p>
            </div>
          ) : null}
          <SendToCoach
            sessions={pending}
            where="hoje"
            className="shrink-0"
            onSent={() => {
              setSentNow(true);
              setSentTick((t) => t + 1);
            }}
          />
        </section>
      ) : null}

      {/* Quem acompanha: nome, CREF e o WhatsApp do personal. Fica abaixo do próximo treino, que segue sem rolar. */}
      {contact ? (
        <section aria-label="Seu personal" className="flex flex-col gap-3 rounded-[8px] border border-rule bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-[0.9375rem] leading-snug">
            {contact.name ? (
              <>
                Acompanhamento de <strong className="font-semibold">{contact.name}</strong>
              </>
            ) : (
              "Com acompanhamento do seu personal"
            )}
            {/* No celular o CREF desce inteiro para a linha de baixo, em vez de quebrar depois do "·". */}
            {contact.credential ? (
              <span className="num block text-sm text-steel sm:inline sm:text-[0.9375rem]">
                <span className="hidden sm:inline"> · </span>
                <span className="sr-only sm:hidden"> · </span>
                {contact.credential}
              </span>
            ) : null}
          </p>
          {contact.href ? (
            <a
              href={contact.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (!returnTo) track("student_coach_whatsapp_clicked", { where: "hoje", has_cref: Boolean(contact.credential) });
              }}
              className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-4 text-[0.9375rem] font-semibold hover:border-iron sm:w-auto"
            >
              <MessageCircle className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{contact.cta}</span>
            </a>
          ) : null}
        </section>
      ) : (
        // Sem personal, o histórico só existe neste celular: a linha decide sozinha se aparece (14+ dias sem cópia).
        <BackupReminder where="hoje" />
      )}
      {/* Ficha nova reenviada pelo personal: no iPhone o link abre no Safari, então quem usa o app da tela de início
          cola aqui (com ficha ainda não recebida, o "Colar aqui" já está no estado vazio, lá em cima). */}
      {program && user!.remoteCoach && !returnTo ? <ColarLink className="-mt-3" /> : null}

      {/* Semana: com meta, "N de M" no lugar do volume; sem meta, o card de sempre. Nunca vermelho, nunca cobrança. */}
      <section aria-label={week.goal ? undefined : "Sua semana"} aria-labelledby={week.goal ? "sua-semana" : undefined} className="rounded-[8px] border border-rule bg-paper p-4">
        {week.goal ? (
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="sua-semana" className="text-[0.9375rem] font-bold">
              Sua semana
            </h2>
            {week.met ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-iron">
                <Check className="size-4 shrink-0 text-steel" aria-hidden />
                Meta da semana batida
              </p>
            ) : null}
          </div>
        ) : null}
        <ol className="grid grid-cols-7 gap-1.5">
          {WEEK.map((w, i) => {
            const done = stats.doneDays.has(i);
            return (
              <li key={w} className="text-center">
                <span className={cx("block text-[0.6875rem] font-bold uppercase", i === today ? "text-iron" : "text-steel")}>{w}</span>
                <span
                  className={cx(
                    "mt-1.5 grid h-10 place-items-center rounded-[6px] text-sm font-bold",
                    done ? "bg-plate-green text-white" : i === today ? "border-2 border-iron" : "border border-dashed border-rule-strong",
                  )}
                  aria-label={done ? `${w}: treinou` : `${w}: sem treino`}
                >
                  {done ? <Check className="size-4" aria-hidden /> : null}
                </span>
              </li>
            );
          })}
        </ol>
        {stats.back && !backInCard ? <p className="mt-3 text-sm leading-snug text-iron">{stats.back}</p> : null}
        <dl className="mt-4 grid grid-cols-3 divide-x divide-rule border-t border-rule pt-3 text-center">
          <div>
            <dt className="text-xs text-steel">Semanas seguidas</dt>
            <dd className="num plate-type text-xl">{stats.streak}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel">Treinos em 30 dias</dt>
            <dd className="num plate-type text-xl">{stats.month}</dd>
          </div>
          {week.goal ? (
            <div>
              <dt className="text-xs text-steel">Treinos na semana</dt>
              <dd className="num plate-type text-xl">
                {week.done}
                <span className="text-sm"> de </span>
                {week.goal}
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-xs text-steel">Volume na semana</dt>
              <dd className="num plate-type text-xl">
                {fmtNum(stats.weekVolume / 1000, 1)}
                <span className="text-sm"> t</span>
              </dd>
            </div>
          )}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title="Recordes recentes"
          action={
            <Link href="/evolucao" className="-my-2 inline-flex min-h-10 items-center text-sm font-semibold text-plate-blue-ink hover:underline pointer-coarse:min-h-11">
              Evolução
            </Link>
          }
          pad={false}
        >
          {stats.prs.length ? (
            <ul className="ruled">
              {stats.prs.map((p, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <RecordMark variant="icon" label={false} />
                  <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{p.name}</span>
                  <span className="num shrink-0 text-sm font-bold">{p.mark ?? ""}</span>
                  <span className="w-14 text-right text-xs text-steel">{fmtDate(p.date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-steel">Seus recordes aparecem aqui quando você superar uma marca anterior.</p>
          )}
        </Panel>

        <Panel
          title="Dieta"
          action={
            <Link href="/dieta" className="-my-2 inline-flex min-h-11 items-center text-sm font-semibold text-plate-blue-ink hover:underline">
              Abrir dieta
            </Link>
          }
        >
          {targets ? (
            // Só as metas do dia (U3 §3.4): nada aqui diz o que a pessoa comeu.
            <TargetsList targets={targets} compact />
          ) : (
            <p className="text-sm text-steel">
              {/* Mesmo caminho (e mesma autorização) do formulário de /dieta: um só lugar para os dados de saúde. */}
              Informe sexo, idade, peso e altura na{" "}
              <Link href="/dieta" className="font-semibold text-iron underline">
                Dieta
              </Link>{" "}
              para calcular suas metas.
            </p>
          )}
        </Panel>
      </div>

      {data.sessions.length ? (
        <Link href="/historico" className="flex items-center justify-between rounded-[8px] border border-rule bg-paper px-4 py-3 text-[0.9375rem] font-semibold hover:border-iron">
          <span>
            Último treino: {data.sessions[0]!.dayKey ? `Treino ${data.sessions[0]!.dayKey}` : "treino livre"} · {relativeDay(data.sessions[0]!.startedAt)}
          </span>
          <span className="flex items-center gap-1 text-plate-blue-ink">
            Histórico <ArrowRight className="size-4" />
          </span>
        </Link>
      ) : null}

      <InstallCard variant="banner" where="hoje" />
    </div>
  );
}

function LoadingHoje() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-36" />
      <Skeleton className="h-72" />
    </div>
  );
}
