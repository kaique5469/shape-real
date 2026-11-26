"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { BarChart, HBars, LineChart } from "@/components/charts";
import { RecordMark } from "@/components/record-mark";
import { Alert, Button, Dialog, Empty, Field, Input, Panel, Segmented, Select, Skeleton, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { fmtDate, fmtNum, useLoad } from "@/lib/hooks";
import { GROUP_LABEL } from "@/lib/domain/exercises";
import { comparisonDates, comparisonLabels, deltaLine, exerciseProgress, progressExercises, strengthIndicator, E1RM_MAX_REPS, type ExerciseChart, type ExerciseProgress, type NoChartReason, type SessionMark } from "@/lib/domain/evolution";
import { firstName, fmtDayMonth } from "@/lib/domain/format";
import { fmtMark, setsPerGroup, weeklyVolume } from "@/lib/domain/progression";
import { todayISO, uid } from "@/lib/domain/ids";
import { PLANS } from "@/lib/domain/plans";
import { consentConfirmed, consentFromCheckbox } from "@/lib/domain/transfer";
import { track } from "@/lib/analytics";
import type { BodyMetric, MuscleGroup, PhotoPose, Profile, ProgressPhoto, Session } from "@/lib/domain/types";
import { compressImage } from "./photo-tools";
import { ReportView } from "./report-view";

type Tab = "cargas" | "corpo" | "fotos" | "volume" | "resumo";

/**
 * Evolução de cargas, medidas, fotos e volume.
 * `byCoach`: o personal registra a avaliação e as fotos pelo aluno. Vale a autorização registrada no perfil do aluno
 * (`student`); sem ela, o personal marca "O aluno autorizou registrar estes dados de saúde" antes de salvar.
 */
export function EvolutionView({
  userId,
  editable,
  byCoach = false,
  subject,
  student,
  onStudentChange,
}: {
  userId: string;
  editable: boolean;
  byCoach?: boolean;
  /** Quem treina: com ele a aba "Resumo" (relatório do período) aparece. */
  subject?: Profile;
  /** Perfil do aluno (modo personal): de onde vem a autorização de dados de saúde. */
  student?: Profile | null;
  /** O perfil do aluno mudou (autorização registrada pelo personal). */
  onStudentChange?: (p: Profile) => void;
}) {
  const { repo } = useApp();
  const [tab, setTab] = useState<Tab>("cargas");
  const { data, loading, error, reload } = useLoad(async () => {
    const [sessions, metrics] = await Promise.all([repo.listSessions(userId), repo.listMetrics(userId)]);
    return { sessions, metrics };
  }, [userId, repo]);

  return (
    <div className="space-y-5">
      <div className="no-print -mx-4 overflow-x-auto px-4">
      <Segmented
        label="Seção"
        value={tab}
        onChange={(t) => {
          setTab(t);
          track("section_viewed", { area: "evolucao", tab: t, by_coach: byCoach });
        }}
        size="sm"
        className="min-w-max"
        options={[
          { value: "cargas", label: "Cargas" },
          { value: "corpo", label: "Peso e medidas" },
          { value: "fotos", label: "Fotos" },
          { value: "volume", label: "Volume" },
          ...(subject ? [{ value: "resumo" as Tab, label: "Resumo do período" }] : []),
        ]}
      />
      </div>
      {loading && !data ? <Skeleton className="h-80" /> : error ? <Alert tone="error">{error}</Alert> : data ? (
        <>
          {tab === "cargas" && <Loads sessions={data.sessions} byCoach={byCoach} student={student} />}
          {tab === "corpo" && <Body userId={userId} metrics={data.metrics} editable={editable} byCoach={byCoach} student={student} onStudentChange={onStudentChange} onChange={reload} />}
          {tab === "fotos" && <Photos userId={userId} editable={editable} byCoach={byCoach} student={student} onStudentChange={onStudentChange} />}
          {tab === "volume" && <Volume sessions={data.sessions} />}
          {tab === "resumo" && subject ? <ReportView subject={subject} byCoach={false} /> : null}
        </>
      ) : null}
    </div>
  );
}

/** Título, subtítulo e unidade do gráfico de cada métrica (U6 §3.3 A.4). */
const CHART_TEXT: Record<ExerciseChart["metric"], { title: string; sub: string; unit: string }> = {
  e1rm: { title: "Força estimada (1RM)", sub: "Estimativa de quanto daria para levantar uma vez, a partir da melhor série de cada treino (fórmula de Epley).", unit: " kg" },
  reps: { title: "Repetições na melhor série", sub: "Uma marca por treino.", unit: " reps" },
  seg: { title: "Segundos na melhor série", sub: "Uma marca por treino.", unit: " s" },
};

/** O parágrafo que fica no lugar do gráfico quando ele não se aplica (um registro só não tem: o cartão já explica). */
function noChartText(reason: NoChartReason | null, seg: boolean): string | null {
  if (reason === "ajuda") return "Na barra assistida, usar menos ajuda é o progresso. Por isso não há gráfico de força: compare pelos registros abaixo.";
  // Sem afirmar o que mudou nem negar a linha de cima (o cartão pode mostrar "+4 kg no mesmo tempo" ou um 1RM válido).
  if (reason === "duplo")
    return seg
      ? "Com carga e tempo no mesmo exercício, não dá para fazer um gráfico só. Compare pelos registros abaixo."
      : "Com carga e repetições no mesmo exercício, não dá para fazer um gráfico só. Compare pelos registros abaixo.";
  if (reason === "reps_altas") return "A maioria dos treinos passou de 12 repetições, e aí a força estimada deixa de ser confiável. Por isso não há gráfico: compare pelos registros abaixo.";
  return null;
}

/** "sex, 20/11": dia da semana curto e dd/mm, no fuso do aparelho. */
function weekdayDayMonth(date: string): string {
  const wd = new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${wd}, ${fmtDayMonth(date)}`;
}

/**
 * Aba Cargas (U6 §3.3 A): seletor na ordem de R-15, cartão com as séries de verdade ("Antes e agora" ou "Primeiro e
 * último registro"), gráfico com o título do indicador (ou o motivo de não ter) e os últimos treinos do exercício.
 */
function Loads({ sessions, byCoach, student }: { sessions: Session[]; byCoach: boolean; student?: Profile | null }) {
  const options = useMemo(() => progressExercises(sessions), [sessions]);
  const [ex, setEx] = useState<string | null>(null);
  const current = (ex && options.some((o) => o.exerciseId === ex) ? ex : options[0]?.exerciseId) ?? null;
  const progress = useMemo(() => (current ? exerciseProgress(sessions, current) : null), [sessions, current]);

  // Uma vez por exercício exibido em cada visita à aba (na entrada e a cada troca); recarregar os dados não repete.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!progress || shown.current === progress.exerciseId) return;
    shown.current = progress.exerciseId;
    const c = progress.comparison;
    track("evolution_compare_shown", {
      kind: progress.kind,
      state: c.state,
      direction: c.direction ?? "nenhuma",
      chart: progress.chart !== null,
      suspect: progress.marks.some((m) => m.suspect),
      by_coach: byCoach,
    });
  }, [progress, byCoach]);

  const who = student?.name ? firstName(student.name) : null;
  if (!options.length || !progress) {
    return (
      <Empty
        title="Nada para comparar ainda"
        body={
          byCoach
            ? `${who ? `Os treinos de ${who}` : "Os treinos do aluno"} aparecem aqui quando chegarem pelo link ou quando você registrar. Aeróbio em minutos não entra.`
            : "Os exercícios aparecem aqui a partir do primeiro treino registrado. Aeróbio em minutos não entra."
        }
      />
    );
  }

  const seg = progress.unit === "seg";
  const paragraph = noChartText(progress.noChartReason, seg);
  return (
    <div className="space-y-4">
      <Field label="Exercício">
        <Select value={current ?? ""} onChange={(e) => setEx(e.target.value)}>
          {options.map((t) => (
            <option key={t.exerciseId} value={t.exerciseId}>
              {t.name} ({t.count} {t.count === 1 ? "treino" : "treinos"})
            </option>
          ))}
        </Select>
      </Field>
      <CompareCard progress={progress} byCoach={byCoach} who={who} />
      {progress.chart ? <ProgressChart chart={progress.chart} name={progress.name} /> : paragraph ? <p className="text-sm text-steel">{paragraph}</p> : null}
      <RecentMarks progress={progress} />
    </div>
  );
}

/** Cartão "Antes e agora" / "Primeiro e último registro" (R-11 a R-14): duas séries com data, a diferença e o indicador. */
function CompareCard({ progress, byCoach, who }: { progress: ExerciseProgress; byCoach: boolean; who: string | null }) {
  const hid = useId();
  const c = progress.comparison;
  const labels = comparisonLabels(byCoach, (c.last ?? c.first).date, todayISO());
  const dates = comparisonDates(c.first.date, c.last?.date ?? null);
  // R-13: com o primeiro e o último em anos diferentes, as outras datas do cartão também levam o ano ("13/11/25").
  const withYear = c.last !== null && c.first.date.slice(0, 4) !== c.last.date.slice(0, 4);
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}${withYear ? `/${d.slice(2, 4)}` : ""}`;
  const mark = (m: SessionMark) => fmtMark(m.mark, progress.exerciseId, progress.unit);
  const indicator = strengthIndicator(c);
  const s = c.suspectLatest;

  const row = (label: string, date: string, shown: string, m: SessionMark) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <dt className="text-sm text-steel">
        {label} · <time dateTime={m.date}>{date}</time>
      </dt>
      <dd className="num plate-type text-lg">{shown}</dd>
    </div>
  );

  return (
    <section aria-labelledby={hid} className="overflow-hidden rounded-[var(--radius-ficha)] border border-rule bg-paper">
      <div className="border-b border-rule px-4 py-3">
        <h2 id={hid} className="text-[0.9375rem] font-bold">
          {labels.title}
        </h2>
      </div>
      <div className="p-4">
        {c.state === "um_registro" || !c.last ? (
          <>
            <dl>{row("Primeiro registro", dates.first, mark(c.first), c.first)}</dl>
            <p className="mt-2 text-sm text-steel">Com mais um treino deste exercício, aparece a comparação.</p>
          </>
        ) : (
          <>
            <dl className="ruled">
              {row(labels.before, dates.first, mark(c.first), c.first)}
              {row(labels.after, dates.last!, mark(c.last), c.last)}
            </dl>
            <p className={cx("mt-3 font-semibold", c.direction === "subiu" ? "text-done-ink" : "text-iron")}>{deltaLine(progress.kind, c.first.mark, c.last.mark, progress.unit)}</p>
            {indicator ? <p className="mt-1 text-sm text-steel">{indicator}</p> : null}
            {c.best ? (
              <p className="mt-1 text-sm text-steel">
                Melhor marca: <span className="num font-semibold text-iron">{mark(c.best)}</span> em <time dateTime={c.best.date}>{dm(c.best.date)}</time>
              </p>
            ) : null}
          </>
        )}
        {s ? (
          <p className="mt-3 text-sm text-iron">
            O treino de <time dateTime={s.date}>{dm(s.date)}</time> ({mark(s)}) ficou fora da comparação: a carga passa do dobro da maior anterior e parece erro de digitação.
            {byCoach ? ` Vale confirmar com ${who ?? "o aluno"}.` : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Gráfico do indicador (R-10): sem o número grande, sem linha de período e sem o ponto do máximo. */
function ProgressChart({ chart, name }: { chart: ExerciseChart; name: string }) {
  const t = CHART_TEXT[chart.metric];
  const first = chart.points[0]!;
  const last = chart.points[chart.points.length - 1]!;
  const d = comparisonDates(first.date, last.date);
  const summary = `${t.title} em ${name}, de ${d.first} a ${d.last}: de ${fmtNum(first.value)} para ${fmtNum(last.value)}${t.unit}.`;
  return (
    <Panel>
      <p className="font-bold">{t.title}</p>
      <p className="text-sm text-steel">{t.sub}</p>
      <div className="mt-3">
        <LineChart data={chart.points} unit={t.unit} label={t.title} summary={summary} highlightMax={false} />
      </div>
    </Panel>
  );
}

/** Até 8 marcas, da mais recente para a mais antiga, válidas e suspeitas, cada uma numa linha a 360 px. */
function RecentMarks({ progress }: { progress: ExerciseProgress }) {
  const forca = progress.kind === "forca";
  const rows = progress.marks.slice(-8).reverse();
  return (
    <Panel title="Últimos treinos deste exercício" pad={false}>
      <ul className="ruled">
        {rows.map((m) => (
          <li key={m.sessionId} className="num flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="shrink-0 text-steel">{weekdayDayMonth(m.date)}</span>
            <span className="flex min-w-0 items-center justify-end gap-2">
              {m.record ? <RecordMark variant="icon" /> : null}
              <span className="whitespace-nowrap font-bold">{fmtMark(m.mark, progress.exerciseId, progress.unit)}</span>
              {forca ? (
                <span className={cx("w-24 shrink-0 text-right text-steel", m.suspect && "text-xs leading-tight")}>
                  {m.suspect ? "fora da comparação" : m.mark.reps <= E1RM_MAX_REPS && m.e1rm !== null ? `1RM ~${fmtNum(m.e1rm)}` : null}
                </span>
              ) : m.suspect ? (
                <span className="shrink-0 text-xs text-steel">fora da comparação</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const FIELDS: { key: keyof BodyMetric; label: string; unit: string }[] = [
  { key: "weightKg", label: "Peso", unit: "kg" },
  { key: "bodyFatPct", label: "% gordura", unit: "%" },
  { key: "waistCm", label: "Cintura", unit: "cm" },
  { key: "hipCm", label: "Quadril", unit: "cm" },
  { key: "chestCm", label: "Peito", unit: "cm" },
  { key: "armCm", label: "Braço", unit: "cm" },
  { key: "thighCm", label: "Coxa", unit: "cm" },
];

const BODY_LIMITS: Partial<Record<keyof BodyMetric, [number, number]>> = {
  weightKg: [30, 300],
  bodyFatPct: [3, 60],
  waistCm: [40, 200],
  hipCm: [50, 200],
  chestCm: [50, 200],
  armCm: [15, 70],
  thighCm: [25, 110],
};

const COACH_CONSENT_LABEL = "O aluno autorizou registrar estes dados de saúde";
const COACH_CONSENT_ERROR = "Marque a autorização do aluno para salvar medidas e fotos.";

/**
 * De quem é a autorização e como o personal a registra. Pessoa no próprio app: vale a dela (Conta). Personal: vale a do
 * perfil do aluno; sem ela, e se o aluno é gerido por ele, o checkbox aparece e a autorização é gravada no perfil do
 * aluno junto com a primeira medida ou foto (origem "personal"). Aluno com conta própria só autoriza no app dele.
 */
function useHealthConsent(userId: string, byCoach: boolean, student: Profile | null | undefined, onStudentChange?: (p: Profile) => void) {
  const { repo, user } = useApp();
  const [checked, setChecked] = useState(false);
  const confirmed = consentConfirmed(byCoach ? student : user);
  const canAsk = byCoach && !confirmed && Boolean(student) && student?.managedBy === user?.id;
  /** Antes de gravar: garante a autorização (ou devolve o erro a mostrar). */
  async function ensure(): Promise<string | null> {
    if (confirmed) return null;
    if (!canAsk) return "Sem autorização para guardar dados de saúde.";
    if (!checked) return COACH_CONSENT_ERROR;
    const profile = await repo.getProfile(userId);
    if (!profile) return "Aluno não encontrado.";
    const saved = await repo.saveProfile({ ...profile, ...consentFromCheckbox(profile, true, "personal", new Date().toISOString()) });
    onStudentChange?.(saved);
    return null;
  }
  return { confirmed, canAsk, checked, setChecked, ensure, allowed: confirmed || canAsk };
}

function CoachConsentCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-start gap-3 rounded-[8px] border border-rule p-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]" />
      <span>{COACH_CONSENT_LABEL}</span>
    </label>
  );
}

function StudentConsentNeeded({ what }: { what: string }) {
  return <Alert tone="info">Para {what}, o aluno precisa autorizar o uso de dados de saúde em Conta, no app dele.</Alert>;
}

function Body({
  userId,
  metrics,
  editable,
  byCoach,
  student,
  onStudentChange,
  onChange,
}: {
  userId: string;
  metrics: BodyMetric[];
  editable: boolean;
  byCoach: boolean;
  student?: Profile | null;
  onStudentChange?: (p: Profile) => void;
  onChange: () => void;
}) {
  const { repo, user, updateProfile } = useApp();
  const consent = useHealthConsent(userId, byCoach, student, onStudentChange);
  const [form, setForm] = useState<Record<string, string>>({ date: todayISO() });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<BodyMetric | null>(null);
  const weight = metrics.filter((m) => m.weightKg).map((m) => ({ date: m.date, value: m.weightKg! }));
  const sorted = useMemo(() => [...metrics].sort((a, b) => b.date.localeCompare(a.date)), [metrics]);

  /** Diferença para a avaliação anterior que tem o mesmo campo. */
  function delta(index: number, key: keyof BodyMetric): number | null {
    const cur = sorted[index]?.[key] as number | null | undefined;
    if (!cur) return null;
    for (let i = index + 1; i < sorted.length; i++) {
      const prev = sorted[i]?.[key] as number | null | undefined;
      if (prev) return Math.round((cur - prev) * 10) / 10;
    }
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    const metric: BodyMetric = { id: uid(), userId, date: form.date || todayISO() };
    if (metric.date > todayISO()) return setErr("A data não pode ser no futuro.");
    let any = false;
    for (const f of FIELDS) {
      const raw = form[f.key as string];
      if (raw) {
        const n = Number(raw.replace(",", "."));
        const [min, max] = BODY_LIMITS[f.key] ?? [0, 999];
        if (Number.isNaN(n) || n < min || n > max) return setErr(`Confira o valor de ${f.label.toLowerCase()}: o esperado fica entre ${min} e ${max} ${f.unit}.`);
        (metric as unknown as Record<string, number>)[f.key as string] = n;
        any = true;
      }
    }
    if (!any) return setErr("Preencha pelo menos uma medida.");
    if (form.note?.trim()) metric.note = form.note.trim();
    if (!consent.confirmed && !consent.checked) return setErr(COACH_CONSENT_ERROR);
    setSaving(true);
    try {
      const blocked = await consent.ensure();
      if (blocked) return setErr(blocked);
      await repo.saveMetric(metric);
      const newest = !sorted[0] || metric.date >= sorted[0].date;
      if (metric.weightKg && newest) {
        if (user?.id === userId) await updateProfile({ weightKg: metric.weightKg });
        else if (byCoach) {
          const profile = await repo.getProfile(userId);
          if (profile && profile.managedBy === user?.id) await repo.saveProfile({ ...profile, weightKg: metric.weightKg });
        }
      }
      track(byCoach ? "assessment_logged" : "metric_logged", { fields: Object.keys(metric).length - 3 });
      setForm({ date: todayISO() });
      setSaved(true);
      onChange();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const input = (f: (typeof FIELDS)[number]) => (
    <Field key={f.key} label={`${f.label} (${f.unit})`}>
      <Input inputMode="decimal" value={form[f.key as string] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value.replace(/[^\d,.]/g, "").slice(0, 6) })} />
    </Field>
  );

  return (
    <div className="space-y-4">
      {weight.length > 1 ? (
        <Panel title="Peso corporal">
          <LineChart data={weight} unit=" kg" label="Peso corporal" color="var(--color-plate-blue)" highlightMax={false} />
        </Panel>
      ) : null}

      {editable ? (
        consent.allowed ? (
          <Panel title={byCoach ? "Registrar avaliação" : "Registrar medidas"}>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Data" className="col-span-2 sm:col-span-1">
                  <Input type="date" value={form.date} max={todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </Field>
                {FIELDS.slice(0, 2).map(input)}
              </div>
              <fieldset>
                <legend className="col-head mb-2 text-steel">Circunferências</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{FIELDS.slice(2).map(input)}</div>
              </fieldset>
              <Field label="Observação" hint="Opcional. Ex.: avaliação em jejum, fita na altura do umbigo.">
                <Input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={160} />
              </Field>
              {consent.canAsk ? <CoachConsentCheck checked={consent.checked} onChange={consent.setChecked} /> : null}
              {err ? <Alert tone="error">{err}</Alert> : null}
              {saved ? <Alert tone="done">{byCoach ? "Avaliação registrada." : "Medidas registradas."}</Alert> : null}
              <Button type="submit" loading={saving}>
                {byCoach ? "Salvar avaliação" : "Salvar medidas"}
              </Button>
            </form>
          </Panel>
        ) : byCoach ? (
          <StudentConsentNeeded what="registrar peso e medidas" />
        ) : (
          <Alert tone="info">
            Para registrar peso e medidas, autorize o uso de dados de saúde em{" "}
            <Link href="/conta" className="font-semibold underline">
              Conta
            </Link>
            .
          </Alert>
        )
      ) : null}

      {sorted.length ? (
        <Panel title={byCoach ? "Avaliações anteriores" : "Histórico de medidas"} pad={false}>
          <div className="overflow-x-auto">
            <table className="num w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-rule bg-chalk text-left">
                  <th className="col-head px-4 py-2 text-steel">Data</th>
                  {FIELDS.map((f) => (
                    <th key={f.key} className="col-head whitespace-nowrap px-2 py-2 text-right text-steel">
                      {f.key === "bodyFatPct" ? "% gord." : f.label}
                    </th>
                  ))}
                  {editable ? <th className="w-11" /> : null}
                </tr>
              </thead>
              <tbody>
                {sorted.map((m, i) => (
                  <tr key={m.id} className="border-t border-rule align-top">
                    <td className="px-4 py-2">
                      {fmtDate(m.date, { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      {m.note ? <span className="block max-w-40 whitespace-normal text-xs text-steel">{m.note}</span> : null}
                    </td>
                    {FIELDS.map((f) => {
                      const d = delta(i, f.key);
                      return (
                        <td key={f.key} className="px-2 py-2 text-right">
                          {m[f.key] ? fmtNum(m[f.key] as number) : <span className="text-pencil">—</span>}
                          {d ? (
                            <span className="block text-xs text-steel">
                              {d > 0 ? "+" : "−"}
                              {fmtNum(Math.abs(d))}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                    {editable ? (
                      <td className="pr-1">
                        <button onClick={() => setToDelete(m)} className="grid size-11 place-items-center rounded hover:bg-chalk-2" aria-label={`Excluir medidas de ${fmtDate(m.date)}`}>
                          <Trash2 className="size-4 text-danger" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-rule px-4 py-2 text-xs text-steel">O número menor é a diferença para a medida anterior.</p>
        </Panel>
      ) : !editable ? (
        <Empty title="Sem medidas" body="O aluno ainda não registrou peso ou medidas." />
      ) : !weight.length ? (
        <p className="text-sm text-steel">{byCoach ? "Nenhuma avaliação registrada ainda. A primeira vira a linha de base para as próximas." : "Nenhuma medida registrada ainda. Pese-se sempre no mesmo horário para comparar."}</p>
      ) : null}

      <Dialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Excluir estas medidas?">
        <p className="text-[0.9375rem] text-steel">O registro de {toDelete ? fmtDate(toDelete.date, { day: "2-digit", month: "long" }) : ""} sai do histórico e do gráfico.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setToDelete(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (toDelete) await repo.deleteMetric(toDelete.id);
              setToDelete(null);
              onChange();
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Photos({ userId, editable, byCoach, student, onStudentChange }: { userId: string; editable: boolean; byCoach: boolean; student?: Profile | null; onStudentChange?: (p: Profile) => void }) {
  const { repo, user, plan, isTester } = useApp();
  const consent = useHealthConsent(userId, byCoach, student, onStudentChange);
  const { data, loading, error, reload } = useLoad(() => repo.listPhotos(userId), [userId, repo]);
  const [pose, setPose] = useState<PhotoPose>("frente");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cmp, setCmp] = useState<[string, string] | null>(null);
  const [drop, setDrop] = useState<ProgressPhoto | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const limit = PLANS[plan].maxPhotos;

  const byPose = (data ?? []).filter((p) => p.pose === pose);
  const a = byPose.find((p) => p.id === cmp?.[0]) ?? byPose[0];
  const b = byPose.find((p) => p.id === cmp?.[1]) ?? byPose[byPose.length - 1];

  async function upload(file: File) {
    setErr(null);
    if (!file.type.startsWith("image/")) return setErr("Escolha um arquivo de imagem (foto).");
    if (!isTester && (data?.length ?? 0) >= limit && user?.id === userId) {
      track("paywall_viewed", { where: "photos" });
      return setErr(`O plano Grátis guarda até ${limit} fotos. Assine o Pro para fotos ilimitadas.`);
    }
    setBusy(true);
    try {
      const blocked = await consent.ensure();
      if (blocked) return setErr(blocked);
      // Campo de data apagado ou no futuro: vale hoje (sem isso a foto ficaria com "data inválida").
      const when = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayISO() ? date : todayISO();
      await repo.addPhoto(userId, await compressImage(file), { date: when, pose });
      track("photo_added", { pose });
      void reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar a foto.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading) return <Skeleton className="h-64" />;
  if (error) return <Alert tone="error">{error}</Alert>;

  return (
    <div className="space-y-4">
      <Segmented label="Pose" value={pose} onChange={setPose} size="sm" options={(["frente", "lado", "costas"] as PhotoPose[]).map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))} />
      {editable ? (
        consent.allowed ? (
          <Panel>
            {consent.canAsk ? (
              <div className="mb-3">
                <CoachConsentCheck checked={consent.checked} onChange={consent.setChecked} />
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Data da foto">
                <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="foto" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button
                onClick={() => {
                  // Sem a autorização marcada, nem abre a câmera: o aviso aparece na hora.
                  if (!consent.confirmed && !consent.checked) return setErr(COACH_CONSENT_ERROR);
                  setErr(null);
                  fileRef.current?.click();
                }}
                loading={busy}
                icon={<Camera className="size-4" />}
              >
                Adicionar foto de {pose}
              </Button>
            </div>
            <p className="mt-3 text-xs text-steel">Dica: mesma luz, mesmo lugar e mesma distância a cada 2–4 semanas. As fotos são privadas e reduzidas no aparelho antes de salvar.</p>
            {err ? (
              <Alert tone="warn" className="mt-3">
                {err}
              </Alert>
            ) : null}
          </Panel>
        ) : byCoach ? (
          <StudentConsentNeeded what="guardar fotos de evolução" />
        ) : (
          <Alert tone="info">
            Autorize o uso de dados de saúde em{" "}
            <Link href="/conta" className="font-semibold underline">
              Conta
            </Link>{" "}
            para guardar fotos de evolução.
          </Alert>
        )
      ) : null}

      {byPose.length >= 2 && a && b ? (
        <Panel title="Comparar">
          <div className="grid grid-cols-2 gap-3">
            {[a, b].map((p, i) => (
              <figure key={i}>
                <Select
                  aria-label={i === 0 ? "Foto antes" : "Foto depois"}
                  value={p.id}
                  onChange={(e) => setCmp(i === 0 ? [e.target.value, b.id] : [a.id, e.target.value])}
                  className="mb-2 h-9 text-sm"
                >
                  {byPose.map((x) => (
                    <option key={x.id} value={x.id}>
                      {fmtDate(x.date, { day: "2-digit", month: "short", year: "numeric" })}
                    </option>
                  ))}
                </Select>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Foto de ${pose} em ${fmtDate(p.date)}`} className="aspect-[3/4] w-full rounded-[6px] bg-chalk-2 object-cover" />
              </figure>
            ))}
          </div>
        </Panel>
      ) : null}

      {byPose.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[...byPose].reverse().map((p) => (
            <li key={p.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Foto de ${pose} em ${fmtDate(p.date)}`} className="aspect-[3/4] w-full rounded-[6px] bg-chalk-2 object-cover" loading="lazy" />
              <span className="num absolute bottom-1 left-1 rounded bg-iron/80 px-1.5 py-0.5 text-xs font-semibold text-chalk">{fmtDate(p.date)}</span>
              {editable ? (
                <button onClick={() => setDrop(p)} className="absolute right-0 top-0 grid size-11 place-items-center" aria-label={`Excluir foto de ${fmtDate(p.date)}`}>
                  <span className="grid size-8 place-items-center rounded bg-paper/90">
                    <Trash2 className="size-4 text-danger" />
                  </span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={`Nenhuma foto de ${pose}`} body={editable ? "Fotos mostram mudanças que a balança não mostra. Tire a primeira hoje para ter com o que comparar daqui a um mês." : "Ainda não há fotos nesta pose."} />
      )}
      <Dialog open={Boolean(drop)} onClose={() => (dropping ? undefined : setDrop(null))} title="Excluir esta foto?">
        <p className="text-[0.9375rem] text-steel">A foto de {drop ? fmtDate(drop.date, { day: "2-digit", month: "long", year: "numeric" }) : ""} é apagada de vez. Não dá para desfazer.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDrop(null)} disabled={dropping}>
            Manter
          </Button>
          <Button
            variant="danger"
            loading={dropping}
            onClick={async () => {
              if (!drop) return;
              setDropping(true);
              try {
                await repo.deletePhoto(drop);
                setDrop(null);
                void reload();
              } catch (e) {
                setDrop(null);
                setErr(e instanceof Error ? e.message : "Não foi possível excluir a foto.");
              } finally {
                setDropping(false);
              }
            }}
          >
            Excluir foto
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Volume({ sessions }: { sessions: Parameters<typeof weeklyVolume>[0] }) {
  const weeks = weeklyVolume(sessions, 8);
  const groups = setsPerGroup(sessions);
  const rows = (Object.keys(GROUP_LABEL) as MuscleGroup[])
    .filter((g) => g !== "antebraco")
    .map((g) => ({ label: GROUP_LABEL[g], value: Math.round((groups[g] ?? 0) * 10) / 10 }));
  return (
    <div className="space-y-4">
      <Panel title="Volume semanal (toneladas levantadas)">
        <BarChart
          label="Volume semanal"
          data={weeks.map((w, i) => {
            const count = `${w.sessions} ${w.sessions === 1 ? "treino" : "treinos"}`;
            // A semana atual ainda não acabou: "0 treinos" afirmaria uma ausência que ainda não aconteceu.
            const sub = i === weeks.length - 1 ? `Esta semana até agora · ${count}` : `Semana de ${fmtDate(w.week)} · ${count}`;
            return { label: fmtDate(w.week, { day: "2-digit", month: "2-digit" }), value: w.volume, sub };
          })}
          format={(v) => `${fmtNum(v / 1000, 1)} t`}
        />
      </Panel>
      <Panel title="Séries por músculo — últimos 7 dias">
        <HBars rows={rows} target={[10, 20]} />
        <p className="mt-3 text-xs text-steel">Faixa verde: 10–20 séries semanais, referência comum para hipertrofia. Exercícios compostos contam meia série para músculos secundários.</p>
      </Panel>
    </div>
  );
}
