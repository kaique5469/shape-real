"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";

/** Mesmo peso visual para as duas portas: personal e quem treina sozinho. Altura mínima de 56 px, texto pode quebrar. */
const DOOR =
  "flex min-h-14 w-full items-center justify-center rounded-[var(--radius-ficha)] bg-iron px-5 py-3 text-center text-base leading-snug text-chalk shadow-press transition-colors duration-150 text-balance hover:bg-iron-2 active:translate-y-px";

/** Primeira dobra: as duas portas de entrada e a faixa de prova logo abaixo. */
export function HeroCtas() {
  return (
    <div className="mt-6 sm:mt-7">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Link href="/testar" className={DOOR} onClick={() => track("landing_cta_clicked", { where: "hero", porta: "personal" })}>
            <span>
              <span className="font-bold">Sou personal:</span> <span className="font-medium">ver com alunos de exemplo</span>
            </span>
          </Link>
          <Link
            href="/entrar?modo=criar&perfil=personal"
            className="mt-1 inline-flex min-h-11 items-center text-[0.9375rem] font-semibold underline underline-offset-2 hover:text-plate-red-ink"
            onClick={() => track("landing_cta_clicked", { where: "hero", porta: "criar_painel" })}
          >
            ou criar meu painel agora
          </Link>
        </div>
        <Link href="/entrar?modo=criar" className={`${DOOR} self-start`} onClick={() => track("landing_cta_clicked", { where: "hero", porta: "solo" })}>
          <span>
            <span className="font-bold">Treino sozinho:</span> <span className="font-medium">minha ficha em 1 minuto</span>
          </span>
        </Link>
      </div>
      <p className="mt-4 max-w-[34rem] text-sm leading-relaxed text-steel sm:mt-5">Sem cadastro · abre pelo link do WhatsApp · funciona sem internet depois de aberto uma vez · grátis no beta</p>
    </div>
  );
}
