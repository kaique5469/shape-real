"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, LogOut, RotateCcw, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Dialog, Field, Input, PageHeader, Panel, Segmented, Select, Textarea } from "@/components/ui";
import { useApp, localRepo } from "@/lib/app-context";
import { ACTIVITY_LABEL } from "@/lib/domain/nutrition";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { SYSTEMS } from "@/lib/domain/systems";
import { PLANS, brl } from "@/lib/domain/plans";
import { downloadText, programToCsv, sessionsToCsv } from "@/lib/domain/export";
import { track } from "@/lib/analytics";
import type { ActivityLevel, Equipment, Goal, Level, PlanId, Profile, Sex, SystemId } from "@/lib/domain/types";

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
  const [delText, setDelText] = useState("");

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
      const hasBody = w || form.heightCm || form.birthYear;
      if (hasBody && !form.consentHealthAt) throw new Error("Para salvar peso, altura e idade, marque a autorização de dados de saúde.");
      await updateProfile({ ...form, weightKg: w, name: form.name.trim() || user!.name });
      setMsg({ tone: "done", text: "Perfil atualizado." });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function exportAll() {
    const [sessions, programs, metrics, diet] = await Promise.all([repo.listSessions(user!.id), repo.listPrograms(user!.id), repo.listMetrics(user!.id), repo.getDiet(user!.id)]);
    downloadText("shape-real-historico.csv", sessionsToCsv(sessions));
    for (const p of programs) downloadText(`shape-real-ficha-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, programToCsv(p));
    downloadText("shape-real-backup.json", JSON.stringify({ exportedAt: new Date().toISOString(), profile: user, programs, sessions, metrics, diet }, null, 2), "application/json");
    track("export_downloaded", { kind: "all" });
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
  const viewingAsStudent = Boolean(returnTo);

  return (
    <>
      <PageHeader title="Conta" sub={`${user!.role === "coach" ? "Personal" : "Aluno"} · ${mode === "supabase" ? user!.email ?? "conta na nuvem" : "dados salvos neste aparelho"}`} />
      {viewingAsStudent ? (
        <Alert tone="info" className="mb-5">
          Você está vendo a conta de {user!.name.split(" ")[0]} como o aluno vê. As alterações de perfil valem para o cadastro dele.
        </Alert>
      ) : null}
      <div className="space-y-5">
        <Panel title="Perfil">
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome" hint={user!.role === "coach" ? "Aparece como assinatura nas fichas e dietas que você envia." : undefined}>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} />
            </Field>
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
                <Field label="Dias por semana">
                  <Segmented label="Dias por semana" size="sm" value={form.daysPerWeek ?? 3} onChange={(d) => set({ daysPerWeek: d })} options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: `${d}x` }))} />
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
                    <Field label="Nascimento (ano)">
                      <Input inputMode="numeric" maxLength={4} value={form.birthYear ?? ""} onChange={(e) => set({ birthYear: Number(e.target.value.replace(/\D/g, "")) || undefined })} />
                    </Field>
                    <Field label="Altura (cm)">
                      <Input inputMode="numeric" value={form.heightCm ?? ""} onChange={(e) => set({ heightCm: Number(e.target.value.replace(/\D/g, "")) || undefined })} />
                    </Field>
                    <Field label="Peso (kg)">
                      <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} placeholder="72,5" />
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
                      checked={Boolean(form.consentHealthAt)}
                      onChange={(e) => set({ consentHealthAt: e.target.checked ? new Date().toISOString() : undefined })}
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

        {user!.role === "athlete" && (coach || repo.capabilities.invites) ? (
          <Panel title="Personal">
            {coach ? (
              <p>
                Acompanhado por <strong>{coach.name}</strong>. A ficha e a dieta enviadas aparecem em Hoje e em Dieta.
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
              <li>Os dados ficam só neste aparelho e neste navegador. Nada é enviado para um servidor.</li>
              <li>Achou algo estranho ou sentiu falta de alguma coisa? Use “Dar feedback” na faixa do topo.</li>
            </ul>
            {!viewingAsStudent ? (
              <Button variant="danger" className="mt-4" icon={<RotateCcw className="size-4" />} onClick={() => setWipe(true)}>
                Apagar tudo e recomeçar
              </Button>
            ) : null}
          </Panel>
        ) : null}

        {isTester ? null : (
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

        <Panel title={viewingAsStudent ? "Dados do aluno" : "Seus dados"}>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportAll} disabled={!canExport} title={!canExport ? "Exportação disponível no Pro" : undefined}>
              Exportar tudo (Excel + backup)
            </Button>
            {isTester || viewingAsStudent ? null : (
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDel(true)}>
                {mode === "local" ? "Apagar dados deste aparelho" : "Excluir minha conta"}
              </Button>
            )}
          </div>
          {!canExport ? <p className="mt-2 text-sm text-steel">A exportação em planilha faz parte do Pro. Seus dados continuam seus: peça uma cópia a qualquer momento.</p> : null}
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
              await localRepo.wipe();
              try {
                Object.keys(localStorage)
                  .filter((k) => k.startsWith("sr:draft:") || k === "sr:return" || k === "sr:session")
                  .forEach((k) => localStorage.removeItem(k));
              } catch {}
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
          Fichas, treinos, medidas, fotos e dieta serão apagados definitivamente. Exporte antes se quiser guardar. Digite <strong>APAGAR</strong> para confirmar.
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
              if (mode === "local" && isDemo) await localRepo.wipe();
              else await repo.deleteAccount(user!.id);
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
