"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, PenLine, Play } from "lucide-react";
import { Logo } from "@/components/brand";
import { GoalPicker, LimitsPicker, RoutinePicker, suggestFor, withSuggestion, type TrainingPrefs } from "@/components/preferences";
import { Alert, Button, Field, Input, cx } from "@/components/ui";
import { WorkStyleForm } from "@/components/work-style-form";
import { useApp } from "@/lib/app-context";
import { evWorkStyleSet } from "@/lib/anamnese-events";
import type { WorkStyle } from "@/lib/domain/anamnese-types";
import { JEITO_SUB, JEITO_TITULO, comDefinido, comPulado } from "@/lib/domain/work-style";
import { estadoChave, questionarioLigado } from "@/lib/flags";
import { aiAvailable, aiProgram } from "@/lib/ai/client";
import { maskPhone, waPhone } from "@/lib/domain/format";
import { getSystem } from "@/lib/domain/systems";
import { buildSoloProgram, firstDayKey, sessionHref } from "@/lib/entry-points";
import { reportError, track } from "@/lib/analytics";

const PENDING_INVITE = "sr:invite";
const GEN_FAILED = "Não deu para montar a ficha agora. Você pode montar do zero em Treinos.";
/** Botão principal: ocupa a largura que sobra no celular, sem quebrar o texto. */
const PRIMARY = "min-w-0 flex-1 whitespace-nowrap sm:flex-none";

export default function Onboarding() {
  const { ready, user, repo, mode, returnTo, returnToOwner, updateProfile, accessToken } = useApp();
  const router = useRouter();
  const finishing = useRef(false);
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<TrainingPrefs>(() => {
    const base: TrainingPrefs = { goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc", limitations: "", emphasis: [] };
    return { ...base, system: suggestFor(base) };
  });
  const [pendingInvite, setPendingInvite] = useState("");
  const [invite, setInvite] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genFailed, setGenFailed] = useState(false);
  // "Como você trabalha?" (spec §3.1): começa do que já estava salvo, se a pessoa voltou ao onboarding.
  const [ws, setWs] = useState<WorkStyle | undefined>(undefined);
  const [skipping, setSkipping] = useState(false);
  // Chave do questionário: em "todos" já vale no primeiro render; nos outros estados depende do aparelho e é lida
  // depois de montar.
  const [jeitoLigado, setJeitoLigado] = useState(() => estadoChave() === "todos");
  useEffect(() => setJeitoLigado(questionarioLigado()), []);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/entrar?modo=criar");
    else if (user.onboarded && !finishing.current) router.replace(user.role === "coach" ? "/alunos" : "/hoje");
  }, [ready, user, router]);

  // Convite guardado por /convite/[código] (contas na nuvem).
  useEffect(() => {
    try {
      const code = localStorage.getItem(PENDING_INVITE) ?? "";
      setPendingInvite(code);
      setInvite(code);
    } catch {}
  }, []);

  // WhatsApp já informado (ex.: voltou ao onboarding): começa preenchido.
  const savedPhone = user?.phone;
  useEffect(() => {
    if (savedPhone) setPhone((p) => p || maskPhone(savedPhone));
  }, [savedPhone]);
  const savedWs = user?.workStyle;
  useEffect(() => {
    if (savedWs) setWs((w) => w ?? savedWs);
  }, [savedWs]);

  if (!ready || !user) return null;
  // O sistema segue a sugestão para as respostas (dá para trocar depois, em Treinos).
  const set = (p: Partial<TrainingPrefs>) => {
    setPrefs((s) => withSuggestion(s, p));
    setGenFailed(false);
    setError(null);
  };
  // Código do personal: só com contas na nuvem e quando a pessoa chegou por um convite.
  const canInvite = repo.capabilities.invites && Boolean(pendingInvite);
  const isCoach = user.role === "coach";
  const dayKey = firstDayKey(prefs.system);

  const coachDigits = () => phone.replace(/\D/g, "");
  const phoneError = () => {
    const digits = coachDigits();
    return digits && !waPhone(digits) ? "Confira o WhatsApp: DDD e número, por exemplo (11) 91234-5678." : null;
  };

  /** WhatsApp do personal: com a chave ligada, segue para "Como você trabalha?"; senão, conclui. */
  function submitCoachPhone() {
    setError(null);
    const err = phoneError();
    if (err) return setError(err);
    if (jeitoLigado) setStep(1);
    else void finishCoach(null);
  }

  /** Conclui o onboarding do personal. `jeito`: "salvar" grava `workStyle` com `definidoEm`; "pular" grava `puladoEm`. */
  async function finishCoach(jeito: "salvar" | "pular" | null) {
    setError(null);
    const err = phoneError();
    if (err) {
      setStep(0);
      return setError(err);
    }
    const digits = coachDigits();
    const agora = new Date().toISOString();
    const workStyle = jeito === "salvar" ? comDefinido(ws, agora) : jeito === "pular" ? comPulado(user?.workStyle, agora) : undefined;
    setBusy(true);
    setSkipping(jeito === "pular");
    // Sem isso, o efeito de "já fez o onboarding" redireciona para /alunos e o parâmetro de boas-vindas se perde.
    finishing.current = true;
    try {
      await updateProfile({ onboarded: true, ...(digits ? { phone: digits } : {}), ...(workStyle ? { workStyle } : {}) });
      if (jeito) track("work_style_set", evWorkStyleSet(workStyle, "onboarding", jeito === "pular"));
      track("onboarding_completed", { role: "coach", whatsapp: Boolean(digits) });
      router.replace("/alunos?bemvindo=1");
    } catch (e) {
      reportError(e, "onboarding:personal");
      finishing.current = false;
      setError(e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo.");
      setBusy(false);
      setSkipping(false);
    }
  }

  function profilePatch() {
    return {
      goal: prefs.goal,
      level: prefs.level,
      daysPerWeek: prefs.daysPerWeek,
      sessionMinutes: prefs.sessionMinutes,
      equipment: prefs.equipment,
      preferredSystem: prefs.system,
      limitations: prefs.limitations.trim() || undefined,
      onboarded: true,
    };
  }

  async function acceptInvite() {
    if (!user) return;
    setError(null);
    setBusy(true);
    finishing.current = true;
    try {
      const r = await repo.acceptInvite(invite.trim(), user.id);
      await updateProfile(profilePatch());
      try {
        localStorage.removeItem(PENDING_INVITE);
      } catch {}
      track("invite_accepted", { where: "onboarding" });
      // O personal monta a ficha; o aluno não gera uma própria.
      router.replace(`/hoje?personal=${encodeURIComponent(r.coachName)}`);
    } catch (e) {
      finishing.current = false;
      setError((e instanceof Error ? e.message : "Código inválido.") + " Apague o código para seguir sem personal; dá para vincular depois, em Conta.");
      setBusy(false);
    }
  }

  async function finishAthlete() {
    if (!user) return;
    if (canInvite && invite.trim()) return acceptInvite();
    setError(null);
    setGenFailed(false);
    setBusy(true);
    finishing.current = true;
    const { systemTouched: _touched, ...input } = prefs;
    void _touched;
    const owner = { ownerId: user.id, createdBy: user.id };
    const signedIn = mode === "supabase";
    try {
      // IA desligada (padrão do beta) ou sem sinal: a ficha sai do motor de regras, no próprio aparelho.
      const aiOn = await aiAvailable(signedIn);
      setAiBusy(aiOn);
      const { program, generation } = await buildSoloProgram({ ...input, limitations: input.limitations.trim() || undefined, seed: Date.now() % 100000 }, owner, {
        aiOn,
        viaAI: async (i) => aiProgram(i, owner, await accessToken()),
      });
      const saved = await repo.saveProgram({ ...program, active: true });
      await updateProfile(profilePatch());
      track("program_generated", { where: "onboarding", source: generation === "ia" ? "ia" : "local", system: saved.system });
      track("onboarding_completed", { role: "athlete", goal: prefs.goal, system: saved.system, passos: steps.length, geracao: generation });
      router.replace(sessionHref(saved.id, saved.days[0]?.key ?? dayKey));
    } catch (e) {
      reportError(e, "onboarding:gerar-ficha");
      finishing.current = false;
      setGenFailed(true);
      setError(GEN_FAILED);
      setBusy(false);
    }
  }

  /** A geração falhou: conclui o onboarding com as respostas e abre o editor de ficha em Treinos. */
  async function buildFromScratch() {
    setBusy(true);
    finishing.current = true;
    try {
      await updateProfile(profilePatch());
      track("onboarding_completed", { role: "athlete", goal: prefs.goal, system: prefs.system, passos: steps.length, geracao: "nenhuma" });
      router.replace("/treinos/novo");
    } catch (e) {
      reportError(e, "onboarding:montar-do-zero");
      finishing.current = false;
      setError("Não foi possível salvar neste aparelho. Confira se o navegador não está em aba anônima e tente de novo.");
      setBusy(false);
    }
  }

  const steps = isCoach
    ? [
        {
          title: `Bem-vindo, ${user.name.split(" ")[0]}.`,
          sub: "Vamos deixar seu painel pronto para receber alunos.",
          body: (
            <form
              id="onboarding-personal"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submitCoachPhone();
              }}
            >
              <Field label="Seu WhatsApp (opcional)" hint="É para onde seus alunos devolvem os treinos. Sem ele, o aluno precisa te procurar nos contatos.">
                <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="Ex.: (11) 91234-5678" />
              </Field>
            </form>
          ),
        },
        ...(jeitoLigado
          ? [
              {
                title: JEITO_TITULO,
                sub: JEITO_SUB,
                body: <WorkStyleForm value={ws} onChange={setWs} compact />,
              },
            ]
          : []),
      ]
    : [
        { title: "Qual é o seu objetivo?", sub: "Dá para mudar quando quiser.", body: <GoalPicker value={prefs.goal} onChange={(goal) => set({ goal })} /> },
        { title: "Sua rotina", sub: "A ficha cabe nos dias e no tempo que você tem.", body: <RoutinePicker prefs={prefs} set={set} /> },
        {
          title: "Tem alguma dor ou limitação?",
          sub: `Opcional. Sua ficha sai no sistema ${getSystem(prefs.system).short}; dá para trocar depois, em Treinos.`,
          body: <LimitsPicker prefs={prefs} set={set} />,
        },
        ...(canInvite
          ? [
              {
                title: "Tem um personal?",
                sub: "Você chegou por um convite. Com o código, o personal monta sua ficha e sua dieta.",
                body: (
                  <Field label="Código do personal (opcional)">
                    <Input value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} maxLength={8} placeholder="EX.: K7M2QX" className="plate-type tracking-[0.2em]" />
                  </Field>
                ),
              },
            ]
          : []),
      ];

  const current = Math.min(step, steps.length - 1);
  const last = current === steps.length - 1;
  const s = steps[current]!;
  const withCode = canInvite && Boolean(invite.trim());

  let primary: React.ReactNode;
  // Passo "Como você trabalha?": "Salvar" e, abaixo, "Pular, decido depois" do mesmo tamanho (spec §3.1).
  const jeitoStep = isCoach && current === 1;
  if (isCoach && current === 0) {
    primary = (
      <Button size="lg" className={PRIMARY} type="submit" form="onboarding-personal" loading={busy}>
        {last ? "Abrir meu painel" : "Continuar"}
      </Button>
    );
  } else if (jeitoStep) {
    primary = (
      <Button size="lg" className={PRIMARY} loading={busy && !skipping} disabled={busy} onClick={() => void finishCoach("salvar")}>
        Salvar
      </Button>
    );
  } else if (!last) {
    primary = (
      <Button size="lg" className={PRIMARY} onClick={() => setStep(current + 1)}>
        Continuar
      </Button>
    );
  } else if (genFailed) {
    primary = (
      <Button size="lg" className={PRIMARY} loading={busy} onClick={buildFromScratch} icon={<PenLine className="size-4" />}>
        Montar do zero
      </Button>
    );
  } else {
    primary = (
      <Button size="lg" className={PRIMARY} loading={busy} onClick={finishAthlete} icon={withCode ? undefined : <Play className="size-4 fill-current" />}>
        {withCode ? "Entrar com o código" : `Começar Treino ${dayKey}`}
      </Button>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-4">
        <Logo />
        {steps.length > 1 ? (
          <span className="num text-sm text-steel">
            {current + 1} de {steps.length}
          </span>
        ) : null}
      </header>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4">
        {steps.length > 1 ? (
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={cx("h-1 flex-1 rounded-full", i <= current ? "bg-iron" : "bg-rule")} />
            ))}
          </div>
        ) : null}
        <main className="pb-6 pt-8">
          <h1 className="plate-type text-[1.9rem] leading-tight text-balance">{s.title}</h1>
          <p className="mt-2 text-steel">{s.sub}</p>
          <div key={current} className="mt-7 animate-rise">
            {s.body}
          </div>
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
      {/* Um único botão principal, sempre à vista (sem precisar rolar a 360 px). */}
      <div className="sticky bottom-0 z-10 border-t border-rule bg-chalk pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-2xl px-4 py-3">
          {error ? (
            <Alert tone="error" className="mb-3">
              {error}
            </Alert>
          ) : null}
          {busy && !isCoach && !withCode ? (
            <p className="mb-2 text-sm text-steel" role="status">
              Montando sua ficha no sistema {getSystem(prefs.system).short}… {aiBusy ? "a IA costuma levar de 20 a 40 segundos." : "é rápido."}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            {current > 0 ? (
              <Button
                variant="ghost"
                size="lg"
                className="shrink-0 px-3"
                disabled={busy}
                onClick={() => {
                  setStep(current - 1);
                  setError(null);
                  setGenFailed(false);
                }}
                icon={<ArrowLeft className="size-4" />}
              >
                Voltar
              </Button>
            ) : (
              <span />
            )}
            {primary}
          </div>
          {jeitoStep ? (
            <Button size="lg" variant="secondary" className="mt-2 w-full" loading={busy && skipping} disabled={busy} onClick={() => void finishCoach("pular")}>
              Pular, decido depois
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
