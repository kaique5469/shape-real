"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles, Wand2 } from "lucide-react";
import { Logo } from "@/components/brand";
import { GoalPicker, LimitsPicker, RoutinePicker, SystemChooser, suggestFor, withSuggestion, type TrainingPrefs } from "@/components/preferences";
import { Alert, Button, Field, Input, Segmented, Select, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { aiProgram, useAI } from "@/lib/ai/client";
import { ACTIVITY_LABEL } from "@/lib/domain/nutrition";
import { getSystem } from "@/lib/domain/systems";
import { track } from "@/lib/analytics";
import type { ActivityLevel, Sex } from "@/lib/domain/types";

const PENDING_INVITE = "sr:invite";

export default function Onboarding() {
  const { ready, user, repo, mode, returnTo, returnToOwner, updateProfile, accessToken } = useApp();
  const ai = useAI(mode === "supabase");
  const router = useRouter();
  const finishing = useRef(false);
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<TrainingPrefs>({ goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc", limitations: "", emphasis: [] });
  const [body, setBody] = useState<{ sex: Sex | ""; birthYear: string; heightCm: string; weightKg: string; activity: ActivityLevel }>({ sex: "", birthYear: "", heightCm: "", weightKg: "", activity: "moderado" });
  const [consent, setConsent] = useState(false);
  const [invite, setInvite] = useState("");
  const [studentsCount, setStudentsCount] = useState("1-10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/entrar?modo=criar");
    else if (user.onboarded && !finishing.current) router.replace(user.role === "coach" ? "/alunos" : "/hoje");
    try {
      setInvite(localStorage.getItem(PENDING_INVITE) ?? "");
    } catch {}
  }, [ready, user, router]);

  if (!ready || !user) return null;
  const set = (p: Partial<TrainingPrefs>) => setPrefs((s) => withSuggestion(s, p));
  const canInvite = repo.capabilities.invites;
  const isCoach = user.role === "coach";

  async function finishCoach() {
    setBusy(true);
    await updateProfile({ onboarded: true });
    track("onboarding_completed", { role: "coach", students: studentsCount });
    router.replace("/alunos?boasvindas=1");
  }

  function profilePatch() {
    const hasBody = body.sex && body.weightKg && body.heightCm && body.birthYear;
    return {
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
    };
  }

  async function finishAthlete(skipProgram = false) {
    if (!user) return;
    setError(null);
    const anyBody = body.sex || body.weightKg || body.heightCm || body.birthYear;
    const hasBody = body.sex && body.weightKg && body.heightCm && body.birthYear;
    if (anyBody && !hasBody) return setError("Para calcular as metas da dieta, preencha sexo, ano de nascimento, altura e peso. Ou deixe os quatro em branco.");
    if (hasBody) {
      const w = Number(body.weightKg.replace(",", "."));
      const h = Number(body.heightCm);
      const y = Number(body.birthYear);
      const thisYear = new Date().getFullYear();
      if (!(w >= 30 && w <= 300)) return setError("Confira o peso: use quilos, por exemplo 72,5.");
      if (!(h >= 120 && h <= 230)) return setError("Confira a altura: use centímetros, por exemplo 172.");
      if (!(y >= thisYear - 100 && y <= thisYear - 10)) return setError("Confira o ano de nascimento.");
      if (!consent) return setError("Para salvar peso e medidas, precisamos da sua autorização (LGPD).");
    }
    setBusy(true);
    finishing.current = true;
    try {
      if (canInvite && invite.trim()) {
        try {
          const r = await repo.acceptInvite(invite.trim(), user.id);
          await updateProfile(profilePatch());
          localStorage.removeItem(PENDING_INVITE);
          track("invite_accepted", { where: "onboarding" });
          // O personal monta a ficha; o aluno não gera uma própria.
          router.replace(`/hoje?personal=${encodeURIComponent(r.coachName)}`);
          return;
        } catch (e) {
          throw new Error((e instanceof Error ? e.message : "Código inválido.") + " Apague o código para seguir sem personal; dá para vincular depois, em Conta.");
        }
      }
      let source = "nenhuma";
      if (!skipProgram) {
        const { systemTouched: _touched, ...input } = prefs;
        void _touched;
        const r = await aiProgram({ ...input, seed: Date.now() % 100000 }, { ownerId: user.id, createdBy: user.id }, await accessToken());
        await repo.saveProgram({ ...r.data, active: true });
        source = r.source;
        track("program_generated", { where: "onboarding", source: r.source, system: prefs.system });
      }
      await updateProfile(profilePatch());
      track("onboarding_completed", { role: "athlete", goal: prefs.goal, system: prefs.system, source });
      router.replace(skipProgram ? "/hoje" : "/hoje?nova=1");
    } catch (e) {
      finishing.current = false;
      setFailed(true);
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
        { title: "Algo que a ficha precisa respeitar?", sub: "Opcional, mas deixa a ficha muito melhor.", body: <LimitsPicker prefs={prefs} set={set} /> },
        { title: "Qual sistema você prefere?", sub: `Para o que você respondeu, sugerimos ${getSystem(suggestFor(prefs)).short}. Dá para trocar.`, body: <SystemChooser prefs={prefs} set={set} /> },
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
        ...(canInvite
          ? [
        {
          title: "Tem um personal?",
          sub: "Se ele te passou um código, coloque aqui. Ele vai montar sua ficha e dieta.",
          body: (
            <Field label="Código do personal (opcional)">
              <Input value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} maxLength={8} placeholder="EX.: K7M2QX" className="plate-type tracking-[0.2em]" />
            </Field>
          ),
        },
            ]
          : []),
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
              <Button size="lg" loading={busy} onClick={isCoach ? finishCoach : () => finishAthlete()} icon={isCoach ? undefined : ai.enabled ? <Sparkles className="size-4" /> : <Wand2 className="size-4" />}>
                {isCoach ? "Abrir meu painel" : canInvite && invite.trim() ? "Entrar com o código" : ai.enabled ? "Gerar minha ficha com IA" : "Gerar minha ficha"}
              </Button>
            ) : (
              <Button size="lg" onClick={() => setStep(step + 1)}>
                Continuar
              </Button>
            )}
          </div>
          {busy && !isCoach ? (
            <p className="mt-4 text-sm text-steel" role="status">
              Montando sua ficha no sistema {getSystem(prefs.system).short}… {ai.enabled ? "a IA costuma levar de 20 a 40 segundos." : "é rápido."}
            </p>
          ) : null}
          {failed && !busy && !isCoach && last ? (
            <button type="button" onClick={() => finishAthlete(true)} className="mt-4 min-h-11 text-sm font-semibold underline">
              Continuar sem ficha e montar depois
            </button>
          ) : null}
          {returnTo ? (
            <button
              type="button"
              onClick={async () => {
                await returnToOwner();
                router.replace("/alunos");
              }}
              className="mt-6 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron"
            >
              <ArrowLeft className="size-4" /> Voltar ao painel do personal
            </button>
          ) : null}
        </main>
      </div>
    </div>
  );
}
