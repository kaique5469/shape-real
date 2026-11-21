"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, MessageCircle, Printer, Trophy } from "lucide-react";
import { shareNames } from "@/components/program/program-share";
import { Alert, Button, Empty, Field, Segmented, Skeleton, Textarea, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { firstName, waLink, waPhone } from "@/lib/domain/format";
import { todayISO } from "@/lib/domain/ids";
import { buildReport, fmtDuration, nameList, reportToText, type EvolutionReport, type ReportDays } from "@/lib/domain/report";
import { fmtDate, fmtNum, useLoad } from "@/lib/hooks";
import type { PhotoPose, Profile, ProgressPhoto } from "@/lib/domain/types";

const WEEKDAYS = ["S", "T", "Q", "Q", "S", "S", "D"];
const WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const POSE_LABEL: Record<PhotoPose, string> = { frente: "frente", lado: "lado", costas: "costas" };
const msgKey = (id: string) => `sr:report-msg:${id}`;

const kg = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
const signed = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: digits })}`;

/** Par antes/depois da mesma pose: a foto mais recente do período e a anterior com pelo menos duas semanas de distância. */
function photoPair(photos: ProgressPhoto[], from: string, to: string): { before: ProgressPhoto; after: ProgressPhoto } | null {
  for (const pose of ["frente", "lado", "costas"] as PhotoPose[]) {
    const list = photos.filter((p) => p.pose === pose && p.date <= to).sort((a, b) => a.date.localeCompare(b.date));
    const after = [...list].reverse().find((p) => p.date >= from);
    if (!after) continue;
    const limit = new Date(after.date + "T12:00:00");
    limit.setDate(limit.getDate() - 14);
    const older = list.filter((p) => p.date <= todayISO(limit));
    // Preferência pela foto mais próxima do início do período.
    const gap = (d: string) => Math.abs(Date.parse(d) - Date.parse(from));
    const before = older.reduce<ProgressPhoto | null>((best, p) => (!best || gap(p.date) <= gap(best.date) ? p : best), null);
    if (before) return { before, after };
  }
  return null;
}

/**
 * Relatório de evolução de um período, pronto para enviar: o personal manda para o aluno,
 * quem treina sozinho guarda ou compartilha. A folha da tela é a mesma que vai para o PDF.
 */
export function ReportView({ subject, byCoach }: { subject: Profile; byCoach: boolean }) {
  const { repo, user } = useApp();
  const [days, setDays] = useState<ReportDays>(30);
  const [message, setMessage] = useState("");
  const [withPhotos, setWithPhotos] = useState(true);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data, loading, error } = useLoad(async () => {
    const [sessions, metrics, programs, photos] = await Promise.all([repo.listSessions(subject.id), repo.listMetrics(subject.id), repo.listPrograms(subject.id), repo.listPhotos(subject.id).catch(() => [] as ProgressPhoto[])]);
    return { sessions, metrics, photos, perWeek: subject.daysPerWeek ?? programs.find((p) => p.active)?.daysPerWeek };
  }, [subject.id, repo]);

  useEffect(() => {
    try {
      setMessage(sessionStorage.getItem(msgKey(subject.id)) ?? "");
    } catch {}
    track("report_viewed", { by_coach: byCoach });
  }, [subject.id, byCoach]);

  const report = useMemo(() => (data ? buildReport({ profile: subject, sessions: data.sessions, metrics: data.metrics, days, daysPerWeek: data.perWeek }) : null), [data, days, subject]);
  const pair = useMemo(() => (data && report ? photoPair(data.photos, report.from, report.to) : null), [data, report]);

  if (loading && !data) return <Skeleton className="h-96" />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!report) return null;

  const first = firstName(subject.name);
  const names = shareNames(user, byCoach ? subject : null);
  const text = reportToText(report, { coachName: names.coachName, message, self: !byCoach });
  const shared = (via: "whatsapp" | "copy" | "print") => track("report_shared", { via, days, by_coach: byCoach, has_message: Boolean(message.trim()), with_photos: Boolean(pair && withPhotos && via === "print") });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      shared("copy");
      setTimeout(() => setCopied(false), 2200);
    } catch (e) {
      reportError(e, "relatorio:copiar");
      setErr("Não consegui copiar automaticamente. Use “Enviar pelo WhatsApp” ou “Imprimir / PDF”.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="no-print space-y-4">
        <Field group label="Período do relatório">
          <Segmented<ReportDays>
            label="Período"
            value={days}
            onChange={setDays}
            options={[
              { value: 30, label: "30 dias" },
              { value: 60, label: "60 dias" },
              { value: 90, label: "90 dias" },
            ]}
          />
        </Field>
        {byCoach ? (
          <Field label={`Recado para ${first}`} hint="Opcional. Fecha o relatório, com a sua assinatura.">
            <Textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                try {
                  sessionStorage.setItem(msgKey(subject.id), e.target.value);
                } catch {}
              }}
              rows={3}
              maxLength={400}
              className="min-h-24"
              placeholder="Ex.: Ótimo mês. Em dezembro vamos subir a carga do agachamento e manter os três treinos."
            />
          </Field>
        ) : null}
      </div>

      {report.hasData ? (
        <>
          <Sheet report={report} subject={subject} names={names} byCoach={byCoach} message={message} pair={pair && withPhotos ? pair : null} />

          <div className="no-print space-y-3">
            {pair ? (
              <label className="flex min-h-11 items-center gap-3 text-[0.9375rem]">
                <input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} className="size-5 accent-[var(--color-iron)]" />
                <span>Incluir as fotos de antes e depois (aparecem no PDF, não no texto do WhatsApp)</span>
              </label>
            ) : null}
            {err ? <Alert tone="error">{err}</Alert> : null}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <a
                href={waLink(text, byCoach ? subject.phone : undefined)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => shared("whatsapp")}
                className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-plate-green px-4 text-[0.9375rem] font-semibold text-white hover:bg-plate-green-ink"
              >
                <MessageCircle className="size-4" aria-hidden /> {byCoach ? `Enviar para ${first} pelo WhatsApp` : "Enviar pelo WhatsApp"}
              </a>
              <Button variant="secondary" onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
                {copied ? "Copiado" : "Copiar texto"}
              </Button>
              <Button
                variant="secondary"
                icon={<Printer className="size-4" />}
                onClick={() => {
                  shared("print");
                  window.print();
                }}
              >
                Imprimir / PDF
              </Button>
            </div>
            {byCoach && !waPhone(subject.phone) ? <p className="text-sm text-steel">Sem WhatsApp no cadastro de {first}: o botão abre a lista de contatos para você escolher.</p> : null}
          </div>
        </>
      ) : (
        <Empty
          title="Ainda não há o que relatar"
          body={
            byCoach
              ? `Nenhum treino nem avaliação de ${first} nos últimos ${days} dias. O relatório se monta sozinho conforme os treinos e as medidas são registrados.`
              : `Nenhum treino nem medida registrados nos últimos ${days} dias. O resumo se monta sozinho conforme você treina.`
          }
          action={
            days < 90 ? (
              <Button variant="secondary" onClick={() => setDays(90)}>
                Ver os últimos 90 dias
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

function Sheet({
  report: r,
  subject,
  names,
  byCoach,
  message,
  pair,
}: {
  report: EvolutionReport;
  subject: Profile;
  names: ReturnType<typeof shareNames>;
  byCoach: boolean;
  message: string;
  pair: { before: ProgressPhoto; after: ProgressPhoto } | null;
}) {
  const long = (d: string) => fmtDate(d, { day: "2-digit", month: "2-digit", year: "numeric" });
  const short = (d: string) => fmtDate(d, { day: "2-digit", month: "2-digit" });
  const facts: [string, string][] = [
    [byCoach ? names.studentLabel : "Nome", subject.name],
    ["Período", `${short(r.from)} a ${long(r.to)} · ${r.days} dias`],
  ];
  if (names.coachName) facts.push(["Personal", names.coachName]);

  const summary: [string, string][] = [];
  summary.push(["Treinos feitos", r.planned ? `${r.sessions} de ${r.planned} combinados` : String(r.sessions)]);
  if (r.adherencePct !== null) summary.push(["Frequência", `${r.adherencePct}%`]);
  if (r.minutes) summary.push(["Tempo treinado", fmtDuration(r.minutes)]);
  if (r.sets) summary.push(["Séries feitas", String(r.sets)]);
  if (r.volumeKg) summary.push(["Carga total levantada", `${fmtNum(r.volumeKg / 1000, 1)} t`]);

  return (
    <article className="overflow-hidden rounded-[var(--radius-ficha)] border border-rule bg-paper print:rounded-none print:border-0" aria-label="Relatório de evolução">
      <header className="border-b-2 border-iron px-4 pb-4 pt-5 sm:px-6">
        <h2 className="plate-type text-[1.65rem] leading-none sm:text-[2rem]">{byCoach ? "Relatório de evolução" : "Resumo de treino"}</h2>
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[0.9375rem]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-steel">{k}</dt>
              <dd className="num min-w-0 break-words font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="px-4 py-5 sm:px-6" aria-label="Frequência">
        <h3 className="col-head text-steel">Presença</h3>
        <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
          <table className="num w-max border-separate border-spacing-1 text-xs" aria-label="Dias treinados no período">
            <thead>
              <tr>
                <th className="w-11" />
                {WEEKDAYS.map((d, i) => (
                  <th key={i} scope="col" className="w-7 pb-0.5 text-center font-semibold text-steel" aria-label={WEEKDAY_NAMES[i]}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.calendar.map((w) => (
                <tr key={w.week}>
                  <th scope="row" className="pr-1 text-right font-normal text-steel">
                    {short(w.week)}
                  </th>
                  {w.days.map((d) => (
                    <td
                      key={d.date}
                      className={cx(
                        "size-7 rounded-[4px] p-0 text-center align-middle [print-color-adjust:exact]",
                        d.state === "treinou" ? "bg-plate-green text-white" : d.state === "livre" ? "border border-rule-strong" : "",
                      )}
                      aria-label={d.state === "fora" ? undefined : `${short(d.date)}: ${d.state === "treinou" ? "treinou" : "sem treino"}`}
                    >
                      {d.state === "treinou" ? <Check className="mx-auto size-4" aria-hidden /> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ruled min-w-0 self-start text-[0.9375rem]">
            {summary.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-steel">{k}</dt>
                <dd className="num text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {r.strength.length || r.prs.length ? (
        <section className="border-t border-rule px-4 py-5 sm:px-6" aria-label="Cargas">
          <h3 className="col-head text-steel">Cargas que subiram</h3>
          {r.strength.length ? (
            <table className="num mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-steel">
                  <th scope="col" className="py-1.5 pr-2 font-semibold">
                    Exercício
                  </th>
                  <th scope="col" className="py-1.5 pr-2 font-semibold">
                    Antes
                  </th>
                  <th scope="col" className="py-1.5 pr-2 font-semibold">
                    Agora
                  </th>
                  <th scope="col" className="py-1.5 text-right font-semibold">
                    Força
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.strength.map((s) => (
                  <tr key={s.exerciseId} className="border-t border-rule align-top">
                    <th scope="row" className="py-2 pr-2 text-left font-semibold">
                      {s.name}
                    </th>
                    <td className="whitespace-nowrap py-2 pr-2 text-steel">
                      {kg(s.from.loadKg)} × {s.from.reps}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 font-semibold">
                      {kg(s.to.loadKg)} × {s.to.reps}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right font-bold text-plate-green-ink">{signed(s.deltaPct, 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-[0.9375rem] text-steel">As cargas se mantiveram no período.</p>
          )}
          {r.strength.length && r.steady ? (
            <p className="mt-2 text-sm text-steel">
              {r.steady === 1 ? "Outro exercício manteve a carga." : `Outros ${r.steady} exercícios mantiveram a carga.`} A coluna Força compara a melhor série, somando carga e repetições.
            </p>
          ) : null}
          {r.prs.length ? (
            <p className="mt-3 flex items-start gap-2 text-[0.9375rem]">
              <Trophy className="mt-0.5 size-4 shrink-0 text-plate-red" aria-hidden />
              <span>
                <strong>{r.prs.length === 1 ? "1 recorde pessoal" : `${r.prs.length} recordes pessoais`}:</strong> {nameList(r.prs.map((p) => p.name))}.
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      {r.body.length ? (
        <section className="border-t border-rule px-4 py-5 sm:px-6" aria-label="Medidas">
          <h3 className="col-head text-steel">Medidas</h3>
          <table className="num mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-steel">
                <th scope="col" className="py-1.5 pr-2 font-semibold">
                  Medida
                </th>
                <th scope="col" className="py-1.5 pr-2 font-semibold">
                  Antes
                </th>
                <th scope="col" className="py-1.5 pr-2 font-semibold">
                  Agora
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  Mudou
                </th>
              </tr>
            </thead>
            <tbody>
              {r.body.map((b) => (
                <tr key={b.key} className="border-t border-rule align-top">
                  <th scope="row" className="py-2 pr-2 text-left font-semibold">
                    {b.label}
                  </th>
                  <td className="py-2 pr-2 text-steel">
                    {fmtNum(b.from)} {b.unit}
                    <span className="block text-xs">{short(b.fromDate)}</span>
                  </td>
                  <td className="py-2 pr-2 font-semibold">
                    {fmtNum(b.to)} {b.unit}
                    <span className="block text-xs font-normal text-steel">{short(b.toDate)}</span>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right font-bold">{b.delta === 0 ? "igual" : `${signed(b.delta)} ${b.unit}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {pair ? (
        <section className="break-inside-avoid border-t border-rule px-4 py-5 sm:px-6" aria-label="Fotos">
          <h3 className="col-head text-steel">Fotos de {POSE_LABEL[pair.after.pose]}</h3>
          <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
            {[pair.before, pair.after].map((p, i) => (
              <figure key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`${i === 0 ? "Antes" : "Depois"}: foto de ${POSE_LABEL[p.pose]} em ${long(p.date)}`} className="aspect-[3/4] w-full rounded-[6px] bg-chalk-2 object-cover" />
                <figcaption className="num mt-1 text-sm">
                  <span className="font-semibold">{i === 0 ? "Antes" : "Depois"}</span> <span className="text-steel">· {long(p.date)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {message.trim() ? (
        <section className="break-inside-avoid border-t border-rule px-4 py-5 sm:px-6" aria-label="Recado">
          <h3 className="col-head text-steel">Recado</h3>
          <p className="mt-2 max-w-[65ch] whitespace-pre-wrap text-[0.9375rem]">{message.trim()}</p>
          {names.coachName ? <p className="mt-3 text-[0.9375rem] font-semibold">{names.coachName}</p> : null}
        </section>
      ) : null}

      <footer className="num border-t border-rule px-4 py-3 text-xs text-steel sm:px-6">Emitido em {long(todayISO())} · Shape Real</footer>
    </article>
  );
}
