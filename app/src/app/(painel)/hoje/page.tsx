"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, Play, Plus, Trophy } from "lucide-react";
import { FichaDay } from "@/components/ficha";
import { Alert, Empty, LinkButton, Panel, Segmented, Skeleton, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtDate, fmtNum, nextDayKey, relativeDay, useLoad } from "@/lib/hooks";
import { bestSet, weekStart, weekStreak } from "@/lib/domain/progression";
import { targetsForProfile } from "@/lib/domain/nutrition";
import { getExercise } from "@/lib/domain/exercises";
import { programValidity } from "@/lib/domain/format";
import { useAI } from "@/lib/ai/client";

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function HojePage() {
  return (
    <Suspense>
      <Hoje />
    </Suspense>
  );
}

function Hoje() {
  const { user, repo, mode } = useApp();
  const ai = useAI(mode === "supabase");
  const params = useSearchParams();
  const { data, loading, error } = useLoad(async () => {
    const [programs, sessions, coach, diet] = await Promise.all([repo.listPrograms(user!.id), repo.listSessions(user!.id), repo.getCoach(user!.id), repo.getDiet(user!.id)]);
    return { program: programs.find((p) => p.active) ?? null, sessions, coach, diet };
  }, [user?.id, repo]);
  const [chosen, setChosen] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const thisWeek = weekStart(now.toISOString());
    const weekSessions = data.sessions.filter((s) => weekStart(s.startedAt) === thisWeek);
    const doneDays = new Set(weekSessions.map((s) => (new Date(s.startedAt).getDay() + 6) % 7));
    const month = data.sessions.filter((s) => now.getTime() - new Date(s.startedAt).getTime() < 30 * 86_400_000).length;
    const prs = data.sessions
      .flatMap((s) => s.prs.map((id) => ({ s, id })))
      .slice(0, 5)
      .map(({ s, id }) => {
        const log = s.exercises.find((e) => e.exerciseId === id);
        return { date: s.startedAt, name: log?.name ?? getExercise(id)?.name ?? id, best: log ? bestSet(log) : null };
      });
    return { doneDays, streak: weekStreak(data.sessions), month, weekVolume: weekSessions.reduce((a, s) => a + s.volumeKg, 0), prs };
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
  const fromCoach = program && program.createdBy !== user!.id ? (data.coach?.name ?? "seu personal") : null;
  const validity = program ? programValidity(program.createdAt, program.durationWeeks) : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold capitalize text-steel">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="plate-type mt-1 text-[2rem] leading-tight sm:text-[2.4rem]">
          {hello}, {first}.
        </h1>
      </header>

      {params.get("nova") ? (
        <Alert tone="done">
          <strong>Sua ficha está pronta.</strong> No primeiro treino, escolha cargas em que sobrem 2 repetições — a partir daí o app sugere quando subir.
        </Alert>
      ) : null}
      {params.get("personal") ? (
        <Alert tone="done">
          Você agora é aluno de <strong>{params.get("personal")}</strong>. Quando a ficha e a dieta forem enviadas, elas aparecem aqui.
        </Alert>
      ) : null}

      {/* Semana */}
      <section aria-label="Sua semana" className="rounded-[8px] border border-rule bg-paper p-4">
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
        <dl className="mt-4 grid grid-cols-3 divide-x divide-rule border-t border-rule pt-3 text-center">
          <div>
            <dt className="text-xs text-steel">Semanas seguidas</dt>
            <dd className="num plate-type text-xl">{stats.streak}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel">Treinos em 30 dias</dt>
            <dd className="num plate-type text-xl">{stats.month}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel">Volume na semana</dt>
            <dd className="num plate-type text-xl">
              {fmtNum(stats.weekVolume / 1000, 1)}
              <span className="text-sm"> t</span>
            </dd>
          </div>
        </dl>
      </section>

      {/* Próximo treino */}
      {program && day ? (
        <section aria-labelledby="proximo" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="proximo" className="text-lg font-bold">
                Próximo treino
              </h2>
              <p className="text-sm text-steel">
                {program.name}
                {fromCoach ? ` · ficha de ${fromCoach}` : ""}
                {validity && validity.state !== "ok" ? <span className={cx("font-semibold", validity.state === "expired" ? "text-plate-red-ink" : "text-iron")}> · {validity.label}</span> : null}
              </p>
            </div>
            {program.days.length > 1 ? (
              <div className="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto px-4">
                <Segmented label="Escolher dia" size="sm" className="min-w-max flex-nowrap" value={day.key} onChange={setChosen} options={program.days.map((d) => ({ value: d.key, label: d.key }))} />
              </div>
            ) : null}
          </div>
          {program.notes?.trim() ? (
            <details className="rounded-[8px] border border-rule bg-paper px-4 py-2.5 text-[0.9375rem]">
              <summary className="flex min-h-9 cursor-pointer items-center font-semibold">Orientações da ficha</summary>
              <p className="mt-1 whitespace-pre-wrap pb-1 text-steel">{program.notes}</p>
            </details>
          ) : null}
          {day.exercises.length ? (
            <>
              <FichaDay day={day} />
              <div className="flex flex-wrap gap-2">
                <LinkButton href={`/sessao?p=${program.id}&d=${encodeURIComponent(day.key)}`} size="lg" className="w-full sm:w-auto" icon={<Play className="size-4 fill-current" />}>
                  Começar treino {day.key}
                </LinkButton>
                <LinkButton href="/sessao" size="lg" variant="ghost" className="w-full sm:w-auto">
                  Treino livre
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
          title={data.coach ? "Seu personal ainda não enviou a ficha" : "Você ainda não tem ficha ativa"}
          body={
            data.coach
              ? `Quando ${data.coach.name} enviar a ficha, ela aparece aqui. Enquanto isso, você pode registrar um treino livre.`
              : ai.enabled
                ? "Monte uma ficha com IA em segundos, no sistema que você preferir, ou registre um treino livre."
                : "Monte sua ficha em um minuto, no sistema que você preferir, ou registre um treino livre."
          }
          action={
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
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title="Recordes recentes"
          action={
            <Link href="/evolucao" className="text-sm font-semibold text-plate-blue-ink hover:underline">
              Evolução
            </Link>
          }
          pad={false}
        >
          {stats.prs.length ? (
            <ul className="ruled">
              {stats.prs.map((p, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Trophy className="size-4 shrink-0 text-plate-red" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{p.name}</span>
                  <span className="num text-sm font-bold">{p.best ? `${fmtNum(p.best.loadKg)} kg × ${p.best.reps}` : ""}</span>
                  <span className="w-14 text-right text-xs text-steel">{fmtDate(p.date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-steel">Seus recordes aparecem aqui quando você superar uma marca anterior.</p>
          )}
        </Panel>

        <Panel
          title="Hoje na dieta"
          action={
            <Link href="/dieta" className="text-sm font-semibold text-plate-blue-ink hover:underline">
              Abrir dieta
            </Link>
          }
        >
          {targets ? (
            <dl className="grid grid-cols-4 gap-2 text-center">
              {[
                ["kcal", targets.kcal],
                ["proteína", targets.proteinG],
                ["carbo", targets.carbsG],
                ["gordura", targets.fatG],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <dd className="num plate-type text-xl">{v as number}</dd>
                  <dt className="text-xs text-steel">{l === "kcal" ? "kcal" : `g ${l}`}</dt>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-steel">
              Informe sexo, idade, peso e altura em{" "}
              <Link href="/conta" className="font-semibold underline">
                Conta
              </Link>{" "}
              para calcular suas metas.
            </p>
          )}
          {data.coach ? <p className="mt-3 border-t border-rule pt-3 text-sm text-steel">Acompanhado por {data.coach.name}.</p> : null}
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
