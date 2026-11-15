"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand";
import { GoalPicker, LimitsPicker, RoutinePicker, SystemChooser, type TrainingPrefs } from "@/components/preferences";
import { Alert, Button, Field, Input, Segmented, Select, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { aiProgram } from "@/lib/ai/client";
import { ACTIVITY_LABEL } from "@/lib/domain/nutrition";
import { suggestSystem } from "@/lib/domain/systems";
import { track } from "@/lib/analytics";
import type { ActivityLevel, Sex } from "@/lib/domain/types";

const PENDING_INVITE = "sr:invite";

export default function Onboarding() {
  const { ready, user, repo, updateProfile, accessToken } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<TrainingPrefs>({ goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc", limitations: "", emphasis: [] });
  const [body, setBody] = useState<{ sex: Sex | ""; birthYear: string; heightCm: string; weightKg: string; activity: ActivityLevel }>({ sex: "", birthYear: "", heightCm: "", weightKg: "", activity: "moderado" });
  const [consent, setConsent] = useState(false);
  const [invite, setInvite] = useState("");
  const [studentsCount, setStudentsCount] = useState("1-10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/entrar?modo=criar");
    else if (user.onboarded) router.replace(user.role === "coach" ? "/alunos" : "/hoje");
    try {
      setInvite(localStorage.getItem(PENDING_INVITE) ?? "");
    } catch {}
  }, [ready, user, router]);

  if (!ready || !user) return null;
  const set = (p: Partial<TrainingPrefs>) => setPrefs((s) => ({ ...s, ...p }));
  const isCoach = user.role === "coach";

  async function finishCoach() {
    setBusy(true);
    await updateProfile({ onboarded: true });
    track("onboarding_completed", { role: "coach", students: studentsCount });
    router.replace("/alunos?boasvindas=1");
  }

  async function finishAthlete() {
    if (!user) return;
    setError(null);
    const hasBody = body.sex && body.weightKg && body.heightCm && body.birthYear;
    if (hasBody && !consent) return setError("Para salvar peso e medidas, precisamos do seu consentimento (LGPD).");
    setBusy(true);
    try {
      const profile = await updateProfile({
        goal: prefs.goal,
        level: prefs.level,
        daysPerWeek: prefs.daysPerWeek,
        sessionMinutes: prefs.sessionMinutes,
        equipment: prefs.equipment,
        preferredSystem: prefs.system,
        limitations: prefs.limitations || undefined,
        ...(hasBody
          ? { sex: body.sex as Sex, birthYear: Number(body.birthYear), heightCm: Number(body.heightCm), weightKg: Number(body.weightKg.replace(",", ".")), activity: body.activity, consentHealthAt: new Date().toISOString() }
          : {}),
        onboarded: true,
      });
      if (invite.trim()) {
        try {
          const r = await repo.acceptInvite(invite.trim(), user.id);
          localStorage.removeItem(PENDING_INVITE);
          track("invite_accepted", { where: "onboarding" });
          setError(null);
          // O personal monta a ficha; o aluno não gera uma própria.
          router.replace(`/hoje?personal=${encodeURIComponent(r.coachName)}`);
          return;
        } catch (e) {
          setError((e instanceof Error ? e.message : "Código inválido.") + " Você pode inserir o código depois, em Conta.");
        }
      }
      const r = await aiProgram({ ...prefs, seed: Date.now() % 100000 }, { ownerId: user.id, createdBy: user.id }, await accessToken());
      await repo.saveProgram({ ...r.data, active: true });
      track("onboarding_completed", { role: "athlete", goal: prefs.goal, system: prefs.system, source: r.source });
      track("program_generated", { where: "onboarding", source: r.source, system: prefs.system });
      if (profile) router.replace("/hoje?nova=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo.");
      setBusy(false);
    }
  }

  const steps = isCoach
    ? [
        {
          title: `Bem-vindo, ${user.name.split(" ")[0]}.`,
          sub: "Vamos deixar seu painel pronto para receber alunos.",
          body: (
            <Field label="Quantos alunos você acompanha hoje?">
              <Segmented label="Alunos" value={studentsCount} onChange={setStudentsCount} options={["1-10", "11-25", "26-50", "50+"].map((v) => ({ value: v, label: v }))} />
            </Field>
          ),
        },
      ]
    : [
        { title: "Qual é o seu objetivo agora?", sub: "Dá para mudar quando quiser.", body: <GoalPicker value={prefs.goal} onChange={(goal) => set({ goal })} /> },
        { title: "Sua rotina de treino", sub: "A ficha cabe no tempo que você tem.", body: <RoutinePicker prefs={prefs} set={set} /> },
        { title: "Qual sistema você prefere?", sub: `Para ${prefs.daysPerWeek} dias por semana, sugerimos ${suggestSystem(prefs.daysPerWeek, prefs.level).toUpperCase().replace("_", "/")}.`, body: <SystemChooser prefs={prefs} set={set} /> },
        { title: "Algo que a ficha precisa respeitar?", sub: "Opcional, mas deixa a ficha muito melhor.", body: <LimitsPicker prefs={prefs} set={set} /> },
        {
          title: "Seus dados para a dieta",
          sub: "Opcional. Usamos para calcular calorias e proteína.",
          body: (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sexo biológico">
                  <Select value={body.sex} onChange={(e) => setBody({ ...body, sex: e.target.value as Sex })}>
                    <option value="">—</option>
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                  </Select>
                </Field>
                <Field label="Ano de nascimento">
                  <Input inputMode="numeric" maxLength={4} value={body.birthYear} onChange={(e) => setBody({ ...body, birthYear: e.target.value.replace(/\D/g, "") })} placeholder="1995" />
                </Field>
                <Field label="Altura (cm)">
                  <Input inputMode="numeric" value={body.heightCm} onChange={(e) => setBody({ ...body, heightCm: e.target.value.replace(/\D/g, "") })} placeholder="175" />
                </Field>
                <Field label="Peso (kg)">
                  <Input inputMode="decimal" value={body.weightKg} onChange={(e) => setBody({ ...body, weightKg: e.target.value.replace(/[^\d,.]/g, "") })} placeholder="78,5" />
                </Field>
              </div>
              <Field label="Nível de atividade">
                <Select value={body.activity} onChange={(e) => setBody({ ...body, activity: e.target.value as ActivityLevel })}>
                  {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
                    <option key={a} value={a}>
                      {ACTIVITY_LABEL[a]}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-start gap-3 rounded-[8px] border border-rule bg-paper p-3 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-iron)]" />
                <span>
                  Autorizo o Shape Real a guardar meus dados de saúde (peso, medidas, fotos e dieta) para montar e acompanhar meu treino. Só eu e o personal que eu aceitar
                  teremos acesso. Posso apagar tudo quando quiser.
                </span>
              </label>
            </div>
          ),
        },
        {
          title: "Tem um personal?",
          sub: "Se ele te passou um código, coloque aqui. Ele vai montar sua ficha e dieta.",
          body: (
            <Field label="Código do personal (opcional)">
              <Input value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} maxLength={8} placeholder="EX.: K7M2QX" className="plate-type tracking-[0.2em]" />
            </Field>
          ),
        },
      ];

  const last = step === steps.length - 1;
  const s = steps[step]!;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
        <Logo />
        <span className="num text-sm text-steel">
          {step + 1} de {steps.length}
        </span>
      </header>
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex gap-1" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={cx("h-1 flex-1 rounded-full", i <= step ? "bg-iron" : "bg-rule")} />
          ))}
        </div>
        <main className="py-8">
          <h1 className="plate-type text-[1.9rem] leading-tight text-balance">{s.title}</h1>
          <p className="mt-2 text-steel">{s.sub}</p>
          <div key={step} className="mt-7 animate-rise">
            {s.body}
          </div>
          {error ? (
            <Alert tone="error" className="mt-5">
              {error}
            </Alert>
          ) : null}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-rule pt-5">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)} icon={<ArrowLeft className="size-4" />}>
                Voltar
              </Button>
            ) : (
              <span />
            )}
            {last ? (
              <Button size="lg" loading={busy} onClick={isCoach ? finishCoach : finishAthlete} icon={isCoach ? undefined : <Sparkles className="size-4" />}>
                {isCoach ? "Abrir meu painel" : invite.trim() ? "Entrar com o código" : "Gerar minha ficha"}
              </Button>
            ) : (
              <Button size="lg" onClick={() => setStep(step + 1)}>
                Continuar
              </Button>
            )}
          </div>
          {busy && !isCoach ? <p className="mt-4 text-sm text-steel">Montando sua ficha no sistema {prefs.system.toUpperCase().replace("_", "/")}… leva alguns segundos.</p> : null}
        </main>
      </div>
    </div>
  );
}
