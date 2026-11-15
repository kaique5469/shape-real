"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand";
import { Alert, Button, LinkButton } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { track } from "@/lib/analytics";

/** Link de convite do personal: guarda o código e conduz o aluno ao cadastro (ou vincula direto). */
export default function ConvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const clean = decodeURIComponent(code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const { ready, user, repo } = useApp();
  const router = useRouter();
  const [state, setState] = useState<{ tone: "done" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("sr:invite", clean);
    } catch {}
  }, [clean]);

  async function accept() {
    if (!user) return;
    setBusy(true);
    try {
      const r = await repo.acceptInvite(clean, user.id);
      localStorage.removeItem("sr:invite");
      track("invite_accepted", { where: "link" });
      router.replace(`/hoje?personal=${encodeURIComponent(r.coachName)}`);
    } catch (e) {
      setState({ tone: "error", text: e instanceof Error ? e.message : "Convite inválido." });
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Link href="/">
        <Logo />
      </Link>
      <main className="flex flex-1 flex-col justify-center">
        <p className="text-sm font-semibold text-steel">Convite de personal</p>
        <h1 className="plate-type mt-1 text-[2.2rem] leading-tight">Seu personal te chamou para o Shape Real.</h1>
        <p className="mt-3 text-steel">Ele vai montar sua ficha e dieta por aqui e acompanhar cada treino. Para você, é grátis.</p>
        <p className="plate-type mt-6 rounded-[8px] border-2 border-dashed border-rule-strong bg-paper py-3 text-center text-3xl tracking-[0.25em]">{clean}</p>
        {state ? (
          <Alert tone={state.tone} className="mt-4">
            {state.text}
          </Alert>
        ) : null}
        <div className="mt-6 space-y-2">
          {!ready ? null : user && user.role === "athlete" && user.onboarded ? (
            <Button size="lg" className="w-full" loading={busy} onClick={accept}>
              Aceitar convite
            </Button>
          ) : user && user.role === "coach" ? (
            <Alert tone="error">Você está logado como personal. Saia e entre com a conta do aluno para aceitar.</Alert>
          ) : user ? (
            <LinkButton href="/onboarding" size="lg" className="w-full">
              Continuar cadastro
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/entrar?modo=criar" size="lg" className="w-full">
                Criar minha conta
              </LinkButton>
              <LinkButton href="/entrar" variant="ghost" className="w-full">
                Já tenho conta
              </LinkButton>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
