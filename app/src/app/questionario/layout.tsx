import type { Metadata } from "next";

// O pedido do questionário chega no "#d=": a página nunca entra em buscador, mesmo citada em outro lugar (spec §11.4).
// A página continua de cliente; os metadados ficam neste layout (metadata só existe em componente de servidor).
export const metadata: Metadata = { title: "Questionário", robots: { index: false, follow: false } };

/**
 * Letra base de 18 px no questionário (spec §4.1, Entrega 1): a raiz passa a 112,5% (18 px com o padrão de 16 px do
 * navegador, e acompanha quem aumentou a letra do sistema). Tudo nas telas é `rem`, então botões e alvos crescem junto.
 * Vem no HTML (sem pular a letra depois de carregar) e só vale enquanto a página do questionário está na tela.
 * O recuo da rolagem deixa a pergunta focada fora da barra fixa de baixo e do cabeçalho do junto.
 */
const LETRA = ":root:has([data-questionario]){font-size:112.5%;scroll-padding-top:5.5rem;scroll-padding-bottom:9rem}";

export default function QuestionarioLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{LETRA}</style>
      {children}
    </>
  );
}
