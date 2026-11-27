"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, DatabaseBackup, FileSpreadsheet, IdCard, LogOut, MessageSquareText, RotateCcw, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { Alert, Badge, Button, Dialog, Field, Input, PageHeader, Panel, Segmented, Select, Textarea } from "@/components/ui";
import { useApp, localRepo } from "@/lib/app-context";
import { ACTIVITY_LABEL } from "@/lib/domain/nutrition";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { SYSTEMS } from "@/lib/domain/systems";
import { PLANS, brl } from "@/lib/domain/plans";
import { downloadText, programsToCsv, sessionsToCsv } from "@/lib/domain/export";
import { reportError, track } from "@/lib/analytics";
import { InstallCard } from "@/components/pwa";
import { BackupReminder, backupDoneText } from "@/components/backup-reminder";
import { RestoreBackupButton } from "@/components/backup-restore";
import { ColarLink } from "@/components/colar-link";
import { FeedbackDialog } from "@/components/tester";
import { maskPhone } from "@/lib/domain/format";
import { CREF_MAX, crefLooksValid, maskCref, normalizeCref } from "@/lib/domain/cref";
import { consentConfirmed, consentFromCheckbox } from "@/lib/domain/transfer";
import { makeBackup } from "@/lib/transfer-client";
import { WorkStyleForm } from "@/components/work-style-form";
import { evWorkStyleSet } from "@/lib/anamnese-events";
import type { WorkStyle } from "@/lib/domain/anamnese-types";
import { AVISO_CREF, comDefinido, oQueMuda, resolveDefaults } from "@/lib/domain/work-style";
import { estadoChave, questionarioLigado } from "@/lib/flags";
import type { ActivityLevel, Equipment, Goal, Level, PlanId, Profile, Sex, SystemId } from "@/lib/domain/types";

/** Apaga tudo o que o app guarda neste aparelho (dados, registro de envio, rascunho do treino, sessão local). */
async function wipeDevice() {
  await localRepo.wipe();
  try {
    Object.keys(localStorage)
      .filter((k) => k === "sr:return" || k === "sr:session")
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}

export default function ContaPage() {
  const { user, repo, mode, isDemo, isTester, plan, returnTo, updateProfile, signOut } = useApp();
  const router = useRouter();
  const [form, setForm] = useState<Profile>(user!);
  const [weight, setWeight] = useState(user!.weightKg ? String(user!.weightKg).replace(".", ",") : "");
  const [wipe, setWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [coach, setCoach] = useState<{ id: string; name: string } | null>(null);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ tone: "done" | "error" | "info"; text: string } | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [feedback, setFeedback] = useState(false);
  const [delText, setDelText] = useState("");
  /** O aviso de formato do CREF só aparece depois que a pessoa sai do campo (não enquanto digita). */
  const [crefTouched, setCrefTouched] = useState(Boolean(user!.cref));
  // "Seu jeito de trabalhar" (spec §3.1): só para o personal, com a chave do questionário ligada (em "todos" já no
  // primeiro render; nos outros estados, lida depois de montar).
  const [jeitoLigado, setJeitoLigado] = useState(() => estadoChave() === "todos");
  const [ws, setWs] = useState<WorkStyle | undefined>(user!.workStyle);
  const [wsSaving, setWsSaving] = useState(false);
  const [wsMsg, setWsMsg] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  useEffect(() => setJeitoLigado(questionarioLigado()), []);
  const showJeito = jeitoLigado && user!.role === "coach" && !returnTo;
  // /conta?jeito=1 (cartão em /alunos): rola até o painel e põe o foco no título.
  useEffect(() => {
    if (!showJeito || new URLSearchParams(window.location.search).get("jeito") !== "1") return;
    const el = document.getElementById("jeito");
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    el.querySelector<HTMLElement>("h2")?.setAttribute("tabindex", "-1");
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [showJeito]);

  useEffect(() => {
    if (user!.role === "athlete") repo.getCoach(user!.id).then(setCoach);
  }, [repo, user]);

  const set = (p: Partial<Profile>) => setForm((f) => ({ ...f, ...p }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const w = weight.trim() ? Number(weight.replace(",", ".")) : undefined;
      if (w !== undefined && (!Number.isFinite(w) || w < 30 || w > 300)) throw new Error("Confira o peso: use quilos, por exemplo 72,5.");
      if (form.heightCm && (form.heightCm < 120 || form.heightCm > 230)) throw new Error("Confira a altura: use centímetros, por exemplo 172.");
      const thisYear = new Date().getFullYear();
      if (form.birthYear && (form.birthYear < thisYear - 100 || form.birthYear > thisYear - 10)) throw new Error("Confira o ano de nascimento: use quatro dígitos, por exemplo 1994.");
      const hasBody = w || form.heightCm || form.birthYear;
      if (hasBody && !consentConfirmed(form)) throw new Error("Para salvar peso, altura e idade, marque a autorização de dados de saúde.");
      const cref = user!.role === "coach" ? normalizeCref(form.cref) : form.cref;
      const crefBefore = user!.cref;
      // O jeito de trabalhar tem painel e botão próprios: o "Salvar perfil" não regrava a versão de quando a tela abriu.
      const { workStyle: _ws, ...perfil } = form;
      void _ws;
      await updateProfile({ ...perfil, weightKg: w, name: form.name.trim() || user!.name, cref });
      // Só a situação (preenchido, no formato ou não), nunca o número.
      if (user!.role === "coach" && (cref ?? "") !== (crefBefore ?? "")) track("coach_cref_set", { filled: Boolean(cref), valid: crefLooksValid(cref), first: !crefBefore });
      if (cref !== form.cref) set({ cref });
      setCrefTouched(true);
      setMsg({ tone: "done", text: "Perfil atualizado." });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function saveJeito() {
    setWsSaving(true);
    setWsMsg(null);
    try {
      const workStyle = comDefinido(ws, new Date().toISOString());
      await updateProfile({ workStyle });
      setWs(workStyle);
      track("work_style_set", evWorkStyleSet(workStyle, "conta", false));
      setWsMsg({ tone: "done", text: "Jeito de trabalhar salvo. Vale para os próximos cadastros, questionários e fichas." });
    } catch (e) {
      reportError(e, "conta:jeito");
      setWsMsg({ tone: "error", text: "Não foi possível salvar neste aparelho. Tente de novo." });
    } finally {
      setWsSaving(false);
    }
  }

  /** Cópia de segurança em 1 arquivo (grátis em todos os planos): compartilhar no iPhone, download no resto. */
  async function backup() {
    setBackingUp(true);
    setBackupMsg(null);
    try {
      const r = await makeBackup(repo, user!, "conta");
      if (r) setBackupMsg({ tone: "done", text: backupDoneText(r) });
    } catch (e) {
      reportError(e, "conta:copia");
      setBackupMsg({ tone: "error", text: e instanceof Error && e.message ? e.message : "Não foi possível fazer a cópia. Tente de novo." });
    } finally {
      setBackingUp(false);
    }
  }

  /** Planilha (CSV para Excel): histórico de treinos e fichas, separada da cópia de segurança. */
  async function exportCsv() {
    setExportMsg(null);
    try {
      const [sessions, programs] = await Promise.all([repo.listSessions(user!.id), repo.listPrograms(user!.id)]);
      if (!sessions.length && !programs.length) return setExportMsg({ tone: "info", text: "Ainda não há treinos nem fichas para a planilha." });
      if (sessions.length) downloadText("shape-real-historico.csv", sessionsToCsv(sessions));
      if (programs.length) downloadText("shape-real-fichas.csv", programsToCsv(programs));
      const files = (sessions.length ? 1 : 0) + (programs.length ? 1 : 0);
      track("export_downloaded", { kind: "csv", files });
      setExportMsg({ tone: "done", text: files === 2 ? "Planilhas baixadas: histórico de treinos e fichas. Se o navegador perguntar, permita baixar os dois arquivos." : sessions.length ? "Planilha do histórico de treinos baixada." : "Planilha das fichas baixada." });
    } catch (e) {
      reportError(e, "conta:planilha");
      setExportMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível exportar. Tente de novo." });
    }
  }

  async function upgrade(target: PlanId) {
    track("upgrade_clicked", { plan: target, from: user!.plan });
    const url = target === "coach" ? process.env.NEXT_PUBLIC_CHECKOUT_COACH_URL : process.env.NEXT_PUBLIC_CHECKOUT_PRO_URL;
    if (url) {
      window.location.href = `${url}${url.includes("?") ? "&" : "?"}client_reference_id=${encodeURIComponent(user!.id)}`;
      return;
    }
    await repo.recordUpgradeIntent(user!.id, target).catch(() => undefined);
    setPlanMsg(`Anotado. As assinaturas do ${PLANS[target].name} abrem em breve e você será avisado primeiro. Até lá, seu plano atual continua funcionando normalmente.`);
  }

  const canExport = PLANS[plan].export || isDemo;
  const crefWarn = user!.role === "coach" && crefTouched && Boolean(form.cref?.trim()) && !crefLooksValid(form.cref);
  const viewingAsStudent = Boolean(returnTo);

  return (
    <>
      <PageHeader title="Conta" sub={`${user!.role === "coach" ? "Personal" : "Aluno"} · ${mode === "supabase" ? user!.email ?? "conta na nuvem" : "dados salvos neste aparelho"}`} />
      {viewingAsStudent ? (
        <Alert tone="info" className="mb-5">
          Você está vendo a conta de {user!.name.split(" ")[0]} como {user!.sex === "F" ? "a aluna" : "o aluno"} vê. As alterações de perfil valem para o cadastro de {user!.name.split(" ")[0]}.
        </Alert>
      ) : null}
      <div className="space-y-5">
        <Panel title="Perfil">
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome" hint={user!.role === "coach" ? "Aparece como assinatura nas fichas e dietas que você envia." : undefined}>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} />
            </Field>
            {user!.role === "coach" ? (
              <Field label="Seu WhatsApp" hint="Os alunos usam para mandar os treinos de volta para você.">
                <Input value={maskPhone(form.phone ?? "")} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(-13) || undefined })} inputMode="tel" autoComplete="tel" placeholder="Ex.: (11) 91234-5678" />
              </Field>
            ) : null}
            {user!.role === "coach" ? (
              <div>
                <Field label="CREF (opcional)" hint="Aparece nas suas fichas, dietas e relatórios. Informado por você.">
                  <Input
                    value={form.cref ?? ""}
                    onChange={(e) => set({ cref: maskCref(e.target.value) || undefined })}
                    onBlur={() => setCrefTouched(true)}
                    maxLength={CREF_MAX}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="000000-G/UF"
                    aria-describedby={crefWarn ? "cref-aviso" : undefined}
                  />
                </Field>
                {crefWarn ? (
                  // Aviso, não erro: o registro pode estar escrito de outro jeito e salvar continua liberado.
                  <p id="cref-aviso" role="status" className="mt-1.5 flex items-start gap-2 text-[0.8125rem] text-iron">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn-ink" aria-hidden />
                    <span>Fora do formato 000000-G/UF. Confira o número; dá para salvar assim mesmo.</span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {user!.role === "athlete" ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <Field label="Objetivo">
                    <Select value={form.goal ?? "hipertrofia"} onChange={(e) => set({ goal: e.target.value as Goal })}>
                      {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
                        <option key={g} value={g}>
                          {GOAL_LABEL[g]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Nível">
                    <Select value={form.level ?? "intermediario"} onChange={(e) => set({ level: e.target.value as Level })}>
                      {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                        <option key={l} value={l}>
                          {LEVEL_LABEL[l]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Sistema preferido">
                    <Select value={form.preferredSystem ?? "abc"} onChange={(e) => set({ preferredSystem: e.target.value as SystemId })}>
                      {SYSTEMS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Onde treina">
                    <Select value={form.equipment ?? "academia"} onChange={(e) => set({ equipment: e.target.value as Equipment })}>
                      <option value="academia">Academia</option>
                      <option value="home">Em casa</option>
                      <option value="peso_corporal">Sem equipamento</option>
                    </Select>
                  </Field>
                </div>
                <Field group label="Dias por semana">
                  {/* 1x a 7x numa linha só (grade de 7 abaixo de sm), 44 px de altura no toque (U8 3.9). */}
                  <Segmented label="Dias por semana" size="sm" columns={7} value={form.daysPerWeek ?? 3} onChange={(d) => set({ daysPerWeek: d })} options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: `${d}x` }))} />
                </Field>
                <Field label="Limitações ou lesões">
                  <Textarea value={form.limitations ?? ""} onChange={(e) => set({ limitations: e.target.value })} rows={2} className="min-h-16" maxLength={400} />
                </Field>
                <fieldset className="space-y-4 border-t border-rule pt-4">
                  <legend className="sr-only">Dados corporais</legend>
                  <p className="text-sm font-semibold">Dados corporais (para metas da dieta)</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Sexo">
                      <Select value={form.sex ?? ""} onChange={(e) => set({ sex: (e.target.value || undefined) as Sex | undefined })}>
                        <option value="">—</option>
                        <option value="F">Feminino</option>
                        <option value="M">Masculino</option>
                      </Select>
                    </Field>
                    <Field label="Ano de nascimento">
                      <Input inputMode="numeric" maxLength={4} value={form.birthYear ?? ""} onChange={(e) => set({ birthYear: Number(e.target.value.replace(/\D/g, "")) || undefined })} />
                    </Field>
                    <Field label="Altura (cm)">
                      <Input inputMode="numeric" value={form.heightCm ?? ""} onChange={(e) => set({ heightCm: Number(e.target.value.replace(/\D/g, "")) || undefined })} />
                    </Field>
                    <Field label="Peso (kg)">
                      <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} placeholder="Ex.: 72,5" />
                    </Field>
                  </div>
                  <Field label="Nível de atividade">
                    <Select value={form.activity ?? "moderado"} onChange={(e) => set({ activity: e.target.value as ActivityLevel })}>
                      {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
                        <option key={a} value={a}>
                          {ACTIVITY_LABEL[a]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <label className="flex items-start gap-3 rounded-[8px] border border-rule p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={consentConfirmed(form)}
                      onChange={(e) => set(consentFromCheckbox(user, e.target.checked, "aluno", new Date().toISOString()))}
                      className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]"
                    />
                    <span>Autorizo guardar meus dados de saúde (peso, medidas, fotos e dieta) para acompanhar meu treino. Só eu e o personal que eu aceitar temos acesso.</span>
                  </label>
                </fieldset>
              </>
            ) : null}
            {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
            <Button type="submit" loading={saving}>
              Salvar perfil
            </Button>
          </form>
        </Panel>

        {showJeito ? (
          <section id="jeito" className="scroll-mt-4">
            <Panel title="Seu jeito de trabalhar">
              <p className="mb-5 max-w-[60ch] text-[0.9375rem] text-steel">Com isso, o cadastro, o questionário e a ficha já vêm do seu jeito. Em cada aluno, você ainda muda o que quiser.</p>
              <WorkStyleForm
                value={ws}
                onChange={(next) => {
                  setWs(next);
                  setWsMsg(null);
                }}
              />
              {resolveDefaults(ws, { hasCref: Boolean(user!.cref?.trim()) }).avisoCref ? (
                <p className="mt-5 flex items-start gap-2 text-[0.9375rem]">
                  <IdCard className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-hidden />
                  <span>{AVISO_CREF}</span>
                </p>
              ) : null}
              <details className="mt-5 rounded-[var(--radius-ficha)] border border-rule">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[0.9375rem] font-semibold">O que isso muda</summary>
                <ul className="list-disc space-y-1.5 border-t border-rule py-3 pl-8 pr-3 text-sm">
                  {oQueMuda(ws).map((linha) => (
                    <li key={linha}>{linha}</li>
                  ))}
                </ul>
              </details>
              {wsMsg ? (
                <Alert tone={wsMsg.tone} className="mt-4">
                  {wsMsg.text}
                </Alert>
              ) : null}
              <Button className="mt-4" onClick={() => void saveJeito()} loading={wsSaving}>
                Salvar jeito de trabalhar
              </Button>
            </Panel>
          </section>
        ) : null}

        {user!.role === "athlete" && (coach || repo.capabilities.invites) ? (
          <Panel title="Personal">
            {coach ? (
              <p>
                {user!.sex === "F" ? "Acompanhada" : "Acompanhado"} por <strong>{coach.name}</strong>. A ficha e a dieta enviadas aparecem em Hoje e em Dieta.
              </p>
            ) : (
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setCodeMsg(null);
                  try {
                    const r = await repo.acceptInvite(code, user!.id);
                    setCoach(await repo.getCoach(user!.id));
                    setCodeMsg({ tone: "done", text: `Pronto. Agora ${r.coachName} acompanha seus treinos.` });
                    track("invite_accepted", { where: "conta" });
                  } catch (err) {
                    setCodeMsg({ tone: "error", text: err instanceof Error ? err.message : "Código inválido." });
                  }
                }}
              >
                <Field label="Código do seu personal" className="min-w-0 flex-1">
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} className="plate-type tracking-[0.2em]" placeholder="K7M2QX" />
                </Field>
                <Button type="submit" disabled={code.trim().length < 6}>
                  Vincular
                </Button>
              </form>
            )}
            {codeMsg ? (
              <Alert tone={codeMsg.tone} className="mt-3">
                {codeMsg.text}
              </Alert>
            ) : null}
          </Panel>
        ) : null}

        {isTester ? (
          <Panel title="Ambiente de teste">
            <ul className="space-y-1.5 text-[0.9375rem]">
              <li>Todos os recursos estão liberados, sem limite de alunos, fichas ou fotos.</li>
              <li>Alunos, fichas, treinos, medidas e dietas ficam só neste aparelho e neste navegador.</li>
              <li>Para melhorar o app, registramos de forma anônima quais telas e recursos são usados e os erros que acontecem. Nomes, medidas e o que você digita não são enviados.</li>
              <li>Achou algo estranho ou sentiu falta de alguma coisa? Use “Dar feedback” na faixa do topo.</li>
            </ul>
            {!viewingAsStudent ? (
              <Button variant="danger" className="mt-4" icon={<RotateCcw className="size-4" />} onClick={() => setWipe(true)}>
                Apagar tudo e recomeçar
              </Button>
            ) : null}
          </Panel>
        ) : null}

        {!isTester && mode === "local" ? (
          <Panel title="Versão beta">
            <ul className="space-y-1.5 text-[0.9375rem]">
              <li>O Shape Real está em beta: tudo liberado e gratuito, sem limite de alunos, fichas ou fotos.</li>
              <li>Sem cadastro, os dados ficam neste aparelho. Faça a cópia de segurança de vez em quando e use “Restaurar cópia” para levar tudo a outro celular.</li>
              <li>Para melhorar o app, registramos de forma anônima quais telas e recursos são usados e os erros que acontecem. Nomes, medidas e o que você digita não são enviados.</li>
            </ul>
            <Button variant="secondary" className="mt-4" icon={<MessageSquareText className="size-4" />} onClick={() => setFeedback(true)}>
              Dar feedback
            </Button>
            <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} />
          </Panel>
        ) : null}

        {isTester || mode === "local" ? null : (
        <section id="planos">
          <Panel title="Plano">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))]">
              {(user!.role === "coach" ? [PLANS.free, PLANS.coach] : [PLANS.free, PLANS.pro]).map((p) => {
                const current = user!.plan === p.id;
                return (
                  <div key={p.id} className={`rounded-[8px] border p-4 ${current ? "border-iron" : "border-rule"}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="plate-type text-lg">{p.name}</p>
                      {current ? (
                        <Badge tone="done">
                          <Check className="size-3" /> Atual
                        </Badge>
                      ) : null}
                    </div>
                    <p className="num mt-1 text-sm text-steel">{p.priceMonthly ? `${brl(p.priceMonthly)}/mês · ou ${brl(p.priceYearly ?? 0)}/ano` : "Grátis"}</p>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {p.features.slice(0, 4).map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-plate-green" aria-hidden />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {!current && p.priceMonthly ? (
                      <Button className="mt-4 w-full" onClick={() => upgrade(p.id)}>
                        Assinar {p.name}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {planMsg ? (
              <Alert tone="done" className="mt-3">
                {planMsg}
              </Alert>
            ) : null}
          </Panel>
        </section>
        )}

        <Panel title="App no celular">
          <InstallCard variant="panel" where="conta" />
          {viewingAsStudent ? null : <ColarLink className="mt-3 border-t border-rule pt-2" />}
        </Panel>

        {viewingAsStudent ? null : (
          <section id="copia">
            <Panel title="Cópia de segurança">
              <BackupReminder where="conta" className="-mt-1 mb-2" />
              {user!.role === "coach" ? (
                <p className="mb-2 flex max-w-[60ch] items-start gap-2 text-[0.9375rem]">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-hidden />
                  <span>O arquivo tem respostas de saúde dos seus alunos. Guarde em um lugar só seu.</span>
                </p>
              ) : null}
              <p className="max-w-[60ch] text-[0.9375rem] text-steel">
                {mode === "local"
                  ? `Tudo fica neste aparelho. A cópia junta num arquivo só ${user!.role === "coach" ? "seus alunos, " : ""}fichas, treinos, medidas e dieta, para levar a outro celular ou ao app instalado. Salve o arquivo no celular (no iPhone, em Arquivos) e toque em Restaurar. Fotos não entram na cópia.`
                  : `Um arquivo com ${user!.role === "coach" ? "seus alunos, " : ""}fichas, treinos, medidas e dieta. Fotos não entram na cópia.`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button icon={<DatabaseBackup className="size-4" />} onClick={backup} loading={backingUp}>
                  Fazer cópia de segurança
                </Button>
                <RestoreBackupButton origin="conta" />
              </div>
              {backupMsg ? (
                <Alert tone={backupMsg.tone} className="mt-3">
                  {backupMsg.text}
                </Alert>
              ) : null}
            </Panel>
          </section>
        )}

        <Panel title={viewingAsStudent ? "Dados do aluno" : "Seus dados"}>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={exportCsv} disabled={!canExport} title={!canExport ? "Planilha disponível no Pro" : undefined}>
              Baixar planilha (CSV)
            </Button>
            {isTester || viewingAsStudent ? null : (
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDel(true)}>
                {mode === "local" ? "Apagar dados deste aparelho" : "Excluir minha conta"}
              </Button>
            )}
          </div>
          {exportMsg ? (
            <Alert tone={exportMsg.tone} className="mt-3">
              {exportMsg.text}
            </Alert>
          ) : null}
          {!canExport ? <p className="mt-2 text-sm text-steel">A planilha faz parte do Pro. A cópia de segurança é grátis em todos os planos.</p> : null}
        </Panel>

        {isTester || viewingAsStudent ? null : (
          <Button
            variant="ghost"
            icon={<LogOut className="size-4" />}
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
          >
            Sair
          </Button>
        )}
      </div>

      <Dialog open={wipe} onClose={() => setWipe(false)} title="Apagar tudo e recomeçar?">
        <p className="text-[0.9375rem] text-steel">Alunos, fichas, treinos, medidas, fotos e dietas deste aparelho são apagados, e o ambiente de teste volta ao início com os três alunos de exemplo.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setWipe(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={wiping}
            onClick={async () => {
              setWiping(true);
              track("workspace_reset", {});
              await wipeDevice();
              // Recarrega do zero em /testar: o ambiente é recriado com os exemplos.
              window.location.assign("/testar");
            }}
          >
            Apagar e recomeçar
          </Button>
        </div>
      </Dialog>

      <Dialog open={del} onClose={() => setDel(false)} title={mode === "local" ? "Apagar dados deste aparelho?" : "Excluir conta?"}>
        <p className="text-[0.9375rem] text-steel">
          Fichas, treinos, medidas, fotos e dieta serão apagados definitivamente. Se quiser guardar, faça a cópia de segurança antes. Digite <strong>APAGAR</strong> para confirmar.
        </p>
        <Input value={delText} onChange={(e) => setDelText(e.target.value)} className="mt-3" aria-label="Digite APAGAR para confirmar" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDel(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={delText.trim().toUpperCase() !== "APAGAR"}
            onClick={async () => {
              // No modo local, "dados deste aparelho" é o aparelho inteiro: no do personal, os alunos dele também
              // (deleteAccount apagaria só o próprio perfil e deixaria fichas, treinos e dietas dos alunos órfãos).
              // Recarrega do zero (como "Apagar e recomeçar"): nada do que estava na memória da página sobrevive, e o
              // painel não disputa a navegação mandando para /entrar.
              if (mode === "local") {
                await wipeDevice();
                window.location.assign("/");
                return;
              }
              await repo.deleteAccount(user!.id);
              await signOut();
              router.replace("/");
            }}
          >
            Apagar definitivamente
          </Button>
        </div>
      </Dialog>
    </>
  );
}
