"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CalendarCheck, ClipboardList, LineChart, Salad, UserRound, Users } from "lucide-react";
import { Logo } from "@/components/brand";
import { OfflineBar } from "@/components/pwa";
import { Skeleton, cx } from "@/components/ui";
import { ActingStrip, TesterStrip } from "@/components/tester";
import { useApp } from "@/lib/app-context";

const ATHLETE_NAV = [
  { href: "/hoje", label: "Hoje", icon: CalendarCheck },
  { href: "/treinos", label: "Treinos", icon: ClipboardList },
  { href: "/evolucao", label: "Evolução", icon: LineChart },
  { href: "/dieta", label: "Dieta", icon: Salad },
  { href: "/conta", label: "Conta", icon: UserRound },
];
const COACH_NAV = [
  { href: "/alunos", label: "Alunos", icon: Users },
  { href: "/treinos", label: "Modelos", icon: ClipboardList },
  { href: "/conta", label: "Conta", icon: UserRound },
];

/** Telas que só fazem sentido para um dos papéis (evita cair nelas pelo botão voltar ao trocar de visão). */
const ATHLETE_ONLY = ["/hoje", "/sessao", "/historico", "/evolucao", "/dieta"];
const COACH_ONLY = ["/alunos"];
const under = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(p + "/"));

export default function PainelLayout({ children }: { children: ReactNode }) {
  const { ready, user, isDemo, isTester, plan, signOut, mode } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    // Quem entrou pelo link de teste volta para o ambiente de teste, nunca para a tela de login.
    if (!user) router.replace(isTester ? "/testar" : "/entrar");
    else if (!user.onboarded) router.replace("/onboarding");
  }, [ready, user, router, isTester]);

  const focus = pathname.startsWith("/sessao");
  const wrongRole = Boolean(user) && (user!.role === "coach" ? under(pathname, ATHLETE_ONLY) : under(pathname, COACH_ONLY));
  const home = user?.role === "coach" ? "/alunos" : "/hoje";

  // Tela do outro papel (ex.: botão voltar depois de "ver como aluno"): espera um instante,
  // porque a troca de visão já costuma vir acompanhada de uma navegação, e só então redireciona.
  useEffect(() => {
    if (!wrongRole) return;
    const t = setTimeout(() => router.replace(home), 900);
    return () => clearTimeout(t);
  }, [wrongRole, home, router]);

  if (!ready || !user || !user.onboarded || wrongRole) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10" aria-busy="true" aria-label="Carregando">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const nav = user.role === "coach" ? COACH_NAV : ATHLETE_NAV;
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-dvh">
      <OfflineBar cloud={mode === "supabase"} />
      {!focus && isTester ? <TesterStrip /> : null}
      {!focus ? <ActingStrip /> : null}
      {isDemo && !isTester ? (
        <div className="no-print flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warn-fill px-4 py-2 text-center text-sm font-semibold text-iron">
          Demonstração com dados fictícios.
          <button
            onClick={async () => {
              await signOut();
              router.push("/entrar?modo=criar");
            }}
            className="inline-flex items-center underline underline-offset-2 pointer-coarse:-my-2 pointer-coarse:min-h-11"
          >
            Criar minha conta grátis
          </button>
        </div>
      ) : null}

      {focus ? (
        children
      ) : (
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-rule bg-paper px-3 py-5 lg:flex">
            <Link href={nav[0]!.href} className="px-2">
              <Logo />
            </Link>
            <nav aria-label="Navegação do app" className="mt-8 flex flex-col gap-0.5">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active(n.href) ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-[0.9375rem] font-semibold transition-colors",
                    active(n.href) ? "bg-iron text-chalk" : "text-iron hover:bg-chalk-2",
                  )}
                >
                  <n.icon className="size-[1.15rem]" aria-hidden />
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto rounded-[6px] border border-rule px-3 py-3">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-steel">{user.role === "coach" ? "Personal" : "Aluno"} · {isTester ? "teste com tudo liberado" : `plano ${plan === "free" ? "Grátis" : plan === "pro" ? "Pro" : "Personal"}`}</p>
            </div>
          </aside>

          <div className="min-w-0">
            <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-rule bg-chalk/90 px-4 backdrop-blur lg:hidden">
              {/* Alvo de 44 px (U8 3.5): o logo é link para o início. */}
              <Link href={nav[0]!.href} className="inline-flex min-h-11 items-center">
                <Logo />
              </Link>
              <span className="max-w-[45%] truncate text-sm font-semibold text-steel">{user.name.split(" ")[0]}</span>
            </header>
            {/* Fim do conteúdo acima da navegação inferior também com a área segura do iPhone (U8 3.3). */}
            <main className="mx-auto max-w-5xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 lg:px-8 lg:pb-12 lg:pt-10">{children}</main>
          </div>

          <nav
            aria-label="Navegação do app"
            data-bottom-nav
            className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
            style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
          >
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={cx("flex flex-col items-center gap-0.5 py-2.5 text-[0.6875rem] font-semibold", active(n.href) ? "text-iron" : "text-steel")}
              >
                <span className={cx("grid h-7 w-12 place-items-center rounded-full transition-colors", active(n.href) && "bg-iron text-chalk")}>
                  <n.icon className="size-[1.15rem]" aria-hidden />
                </span>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
