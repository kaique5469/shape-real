"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dumbbell, Mail, Users } from "lucide-react";
import { Logo } from "@/components/brand";
import { Alert, Button, Field, Input, Segmented, cx } from "@/components/ui";
import { DemoButton } from "@/components/landing/demo-button";
import { useApp } from "@/lib/app-context";
import { track } from "@/lib/analytics";
import type { Role } from "@/lib/domain/types";

export default function EntrarPage() {
  return (
    <Suspense>
      <Entrar />
    </Suspense>
  );
}

function Entrar() {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, user, cloudAvailable, signInPassword, signUpPassword, sendMagicLink, startLocal } = useApp();
  const [mode, setMode] = useState<"entrar" | "criar">(params.get("modo") === "criar" ? "criar" : "entrar");
  const [role, setRole] = useState<Role>(params.get("perfil") === "personal" ? "coach" : "athlete");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem("sr:invite");
    } catch {}
    if (pending && user.onboarded && user.role === "athlete") router.replace(`/convite/${pending}`);
    else router.replace(user.onboarded ? (user.role === "coach" ? "/alunos" : "/hoje") : "/onboarding");
  }, [ready, user, router]);

  useEffect(() => {
    if (mode === "criar") track("signup_started", { role });
  }, [mode, role]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (!cloudAvailable) {
        await startLocal(name, role);
        router.push("/onboarding");
        return;
      }
      if (mode === "entrar") {
        await signInPassword(email.trim(), password);
      } else {
        if (password.length < 8) throw new Error("Use pelo menos 8 caracteres na senha.");
        const r = await signUpPassword(name.trim(), email.trim(), password, role);
        if (r.needsConfirmation) setInfo(`Enviamos um link de confirmação para ${email}. Abra no celular para entrar.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function magic() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Digite seu e-mail para receber o link.");
    setBusy(true);
    try {
      await sendMagicLink(email.trim());
      setInfo(`Link de acesso enviado para ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_1.1fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" aria-label="Voltar ao início">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="plate-type text-[2rem] leading-tight">{mode === "criar" ? "Crie sua conta" : "Entrar"}</h1>
          <p className="mt-2 text-steel">{mode === "criar" ? "Grátis, sem cartão. Leva menos de um minuto." : "Bom te ver de volta. Bora treinar."}</p>

          {cloudAvailable ? (
            <div className="mt-6">
              <Segmented
                label="Entrar ou criar conta"
                value={mode}
                onChange={setMode}
                size="sm"
                options={[
                  { value: "entrar", label: "Já tenho conta" },
                  { value: "criar", label: "Criar conta" },
                ]}
              />
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {mode === "criar" || !cloudAvailable ? (
              <>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-semibold">Como você vai usar</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["athlete", Dumbbell, "Eu treino", "Sozinho ou com personal"],
                        ["coach", Users, "Sou personal", "Acompanho alunos"],
                      ] as const
                    ).map(([value, Icon, t, d]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRole(value)}
                        aria-pressed={role === value}
                        className={cx("rounded-[8px] border p-3 text-left transition-colors", role === value ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron")}
                      >
                        <Icon className="size-5" aria-hidden />
                        <span className="mt-2 block font-bold">{t}</span>
                        <span className={cx("block text-xs", role === value ? "text-chalk/70" : "text-steel")}>{d}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <Field label="Seu nome">
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required placeholder="Como quer ser chamado" />
                </Field>
              </>
            ) : null}

            {cloudAvailable ? (
              <>
                <Field label="E-mail">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
                </Field>
                <Field label="Senha" hint={mode === "criar" ? "Mínimo de 8 caracteres." : undefined}>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "criar" ? "new-password" : "current-password"} required />
                </Field>
              </>
            ) : (
              <Alert tone="info">Seus dados ficam salvos neste aparelho. Você pode exportar tudo em planilha a qualquer momento.</Alert>
            )}

            {error ? <Alert tone="error">{error}</Alert> : null}
            {info ? <Alert tone="done">{info}</Alert> : null}

            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!cloudAvailable && !name.trim()}>
              {!cloudAvailable ? "Começar agora" : mode === "criar" ? "Criar conta grátis" : "Entrar"}
            </Button>
            {cloudAvailable && mode === "entrar" ? (
              <Button type="button" variant="ghost" className="w-full" onClick={magic} disabled={busy} icon={<Mail className="size-4" />}>
                Receber link de acesso por e-mail
              </Button>
            ) : null}
            {mode === "criar" ? (
              <p className="text-xs text-steel">
                Ao continuar você aceita os{" "}
                <Link href="/termos" className="underline">
                  termos
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" className="underline">
                  política de privacidade
                </Link>
                .
              </p>
            ) : null}
          </form>

          <div className="mt-8 border-t border-rule pt-6">
            <p className="text-sm font-semibold">Quer só dar uma olhada?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <DemoButton role="athlete" variant="secondary" size="sm">
                Demonstração do aluno
              </DemoButton>
              <DemoButton role="coach" variant="secondary" size="sm">
                Demonstração do personal
              </DemoButton>
            </div>
          </div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-iron text-chalk lg:block" aria-hidden>
        <div className="absolute inset-0 grid grid-cols-[repeat(12,1fr)] opacity-[0.07]">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="border-r border-chalk" />
          ))}
        </div>
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="plate-type text-[3.2rem] leading-[0.95]">
            50 → <span className="text-plate-red">52,5</span>
            <span className="text-2xl"> kg</span>
          </p>
          <p className="mt-4 max-w-sm text-lg text-chalk/70">Toda semana um pouco mais. O Shape Real lembra a carga e avisa quando subir.</p>
          <div className="mt-10 flex gap-2">
            {["var(--plate-red)", "var(--plate-blue)", "var(--plate-yellow)", "var(--plate-green)", "var(--plate-white)"].map((c, i) => (
              <span key={c} className="rounded-full ring-1 ring-black/20" style={{ background: c, width: 64 - i * 8, height: 64 - i * 8, alignSelf: "center" }} />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
