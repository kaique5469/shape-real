import Link from "next/link";
import { Logo } from "@/components/brand";

const BLOG = "https://shapereal.com.br";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-chalk/90 backdrop-blur supports-[backdrop-filter]:bg-chalk/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="Shape Real — início">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-6 text-[0.9375rem] font-medium md:flex">
          <a href="#como-funciona" className="hover:underline">
            Como funciona
          </a>
          <a href="#personal" className="hover:underline">
            Para personais
          </a>
          <a href="#planos" className="hover:underline">
            Planos
          </a>
          <a href={BLOG} className="hover:underline">
            Blog
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/entrar" className="hidden h-10 items-center rounded-[6px] px-3 text-[0.9375rem] font-semibold hover:bg-chalk-2 sm:inline-flex">
            Entrar
          </Link>
          <Link href="/entrar?modo=criar" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-[6px] bg-iron px-3 text-[0.9375rem] font-semibold text-chalk hover:bg-iron-2 sm:px-4">
            Começar<span className="hidden sm:inline">&nbsp;grátis</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-chalk">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-2 max-w-sm text-sm text-steel">Ficha de treino montada por regras que você entende e edita, registro de cargas e acompanhamento de personal. Feito no Brasil.</p>
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href={BLOG} className="hover:underline">
            Blog
          </a>
          <Link href="/privacidade" className="hover:underline">
            Privacidade
          </Link>
          <Link href="/termos" className="hover:underline">
            Termos
          </Link>
          <Link href="/entrar" className="hover:underline">
            Entrar
          </Link>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-pencil">
        O Shape Real não substitui avaliação médica, de educador físico ou de nutricionista. Em caso de dor, lesão ou condição de saúde, procure um profissional.
      </p>
    </footer>
  );
}
