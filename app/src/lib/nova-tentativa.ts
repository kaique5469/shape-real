/**
 * Nova tentativa de um `import()` que falhou (o SDK da medição em instrumentation-client.ts, o módulo da nuvem em
 * app-context.tsx). Antes só havia o evento `online`, que só dispara na passagem de sem rede para com rede: com a rede
 * ligada e o arquivo falhando (sinal instável, servidor com erro), ninguém tentava de novo até recarregar a página.
 *
 * Tenta de novo no que vier primeiro: o evento `online`, a página voltar a ficar visível ou o tempo (15 s, 60 s e 5 min,
 * pela quantidade de falhas; depois disso, só pelos eventos). Entra no pacote de todas as telas: nada importado.
 */
export const ESPERAS_NOVA_TENTATIVA_MS = [15_000, 60_000, 300_000] as const;

type Alvo = Pick<EventTarget, "addEventListener" | "removeEventListener">;
type Documento = Alvo & { visibilityState?: string };

/**
 * Agenda uma nova tentativa de `tentar` depois da falha número `falhas` (0 = a primeira). Chama `tentar` uma vez só,
 * no primeiro gatilho, e desliga os outros. Devolve o cancelamento.
 */
export function agendarNovaTentativa(tentar: () => void, falhas: number, janela: Alvo = window, doc: Documento = document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const desligar = () => {
    clearTimeout(timer);
    janela.removeEventListener("online", disparar);
    doc.removeEventListener("visibilitychange", aoVoltar);
  };
  function disparar() {
    desligar();
    tentar();
  }
  function aoVoltar() {
    if (doc.visibilityState === "visible") disparar();
  }
  const espera = ESPERAS_NOVA_TENTATIVA_MS[falhas];
  if (espera !== undefined) timer = setTimeout(disparar, espera);
  janela.addEventListener("online", disparar);
  doc.addEventListener("visibilitychange", aoVoltar);
  return desligar;
}
