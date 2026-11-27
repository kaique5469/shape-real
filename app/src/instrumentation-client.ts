import type { ErroCedo, InicioDaPagina } from "@/lib/analytics";
import { agendarNovaTentativa } from "@/lib/nova-tentativa";
import { ehPaginaQuestionario, perfisDoAparelho, persistenciaPosthog, type LocalPagina } from "@/lib/questionario-base";

/**
 * Analytics e captura de erros no navegador (PostHog). O SDK (posthog-js, ~120 KB gzip) não entra no primeiro
 * carregamento: src/lib/posthog-init.ts é pedido 3 s depois do `load`, quando o navegador fica ocioso, para não disputar
 * a banda com o toque seguinte (rodada M, RM-03). Até lá, src/lib/analytics.ts guarda as chamadas numa fila.
 *
 * Aqui fica só o que precisa acontecer na abertura, antes de a página mexer na barra (/questionario limpa o `#d=`,
 * algumas telas redirecionam): a página e a persistência do PostHog, a URL e o referrer (já sem `?k=` e sem `#`) e os
 * erros não tratados de antes do SDK. Privacidade: o init do PostHog não mudou (posthog-init.ts). Sem a variável de
 * ambiente, nada é enviado.
 */
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** O SDK nunca é pedido antes disto depois do `load`. */
const ESPERA_DEPOIS_DO_LOAD_MS = 3000;
/** Limite do `requestIdleCallback`: com a página sempre ocupada, o SDK é pedido mesmo assim. */
const LIMITE_DO_OCIOSO_MS = 4000;
const MAX_ERROS_CEDO = 20;

/**
 * Página da abertura (lida antes de /questionario limpar o `#d=` da barra). Os perfis do aparelho só são lidos em
 * /questionario: lá o aluno do link fica com o PostHog em memória e sem IP (spec §11.3, DECISIONS entrada 14).
 */
function paginaDaAbertura(): LocalPagina {
  const { pathname, hash } = window.location;
  let temPerfilPersonal = false;
  if (ehPaginaQuestionario(pathname)) {
    try {
      temPerfilPersonal = perfisDoAparelho(localStorage).temPerfilPersonal;
    } catch {}
  }
  return { pathname, hash, temPerfilPersonal };
}

/**
 * A captura automática de erros do PostHog já está ligada? Ela chega depois do init, num arquivo à parte
 * (/ingest/static/exception-autocapture.js), e só então embrulha o `window.onerror` e o `onunhandledrejection`.
 */
function capturaDeErrosDoSdk(): boolean {
  const w = window as Window & { __PosthogExtensions__?: { errorWrappingFunctions?: unknown } };
  return Boolean(w.__PosthogExtensions__?.errorWrappingFunctions);
}

/** Sem a chave do link de teste (`?k=`) e sem o `#` (o mesmo que `semChaveNemFragmento`, em analytics.ts). */
function semChaveNemFragmento(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.delete("k");
    url.hash = "";
    return url.toString();
  } catch {
    return href.replace(/#.*$/, "").replace(/([?&])k=[^&#]*/g, "$1");
  }
}

if (token) {
  // Síncrono, na avaliação do módulo: a persistência ("memory" no /questionario do aluno) é decidida antes de o `#d=` sair.
  const abertura = paginaDaAbertura();
  const persistence = persistenciaPosthog(abertura);
  const inicio: InicioDaPagina = {
    url: semChaveNemFragmento(window.location.href),
    pathname: window.location.pathname,
    referrer: document.referrer ? semChaveNemFragmento(document.referrer) : "",
    em: new Date(),
  };

  // Erros não tratados antes de o SDK chegar: guardados (até 20) e enviados quando ele iniciar. Depois do init, até a
  // captura automática do SDK chegar (um arquivo à parte, que pode nem vir com sinal fraco), vão direto para o SDK.
  const cedo: ErroCedo[] = [];
  let enviarErro: ((erro: unknown) => void) | null = null;
  const desligarOuvintes = () => {
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
  };
  const guardar = (erro: unknown) => {
    if (enviarErro) {
      // A captura do SDK já pegou este erro (ela roda no window.onerror): sai de cena para não mandar duas vezes.
      if (capturaDeErrosDoSdk()) return desligarOuvintes();
      return enviarErro(erro);
    }
    if (cedo.length < MAX_ERROS_CEDO) cedo.push({ erro, em: new Date(), url: semChaveNemFragmento(window.location.href), pathname: window.location.pathname });
  };
  function onErr(e: ErrorEvent) {
    guardar(e.error ?? e.message);
  }
  function onRej(e: PromiseRejectionEvent) {
    guardar(e.reason);
  }
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);

  let pedindo = false;
  let falhas = 0;
  let cancelarNovaTentativa: (() => void) | null = null;
  const carregar = () => {
    if (pedindo) return;
    pedindo = true;
    cancelarNovaTentativa?.();
    cancelarNovaTentativa = null;
    import("@/lib/posthog-init").then(
      ({ iniciarPosthog }) => {
        try {
          enviarErro = iniciarPosthog(token, abertura, persistence, inicio, cedo.splice(0));
        } catch {
          /* a medição nunca quebra o app */
        }
        if (!enviarErro || capturaDeErrosDoSdk()) desligarOuvintes();
      },
      () => {
        // Sem rede, ou o arquivo não veio (também com a rede ligada): a fila segue com teto e o SDK é pedido de novo
        // quando a rede voltar, quando a página voltar a ficar visível ou depois de 15 s, 60 s e 5 min.
        pedindo = false;
        cancelarNovaTentativa = agendarNovaTentativa(carregar, falhas++);
      },
    );
  };
  const quandoOcioso = () => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(carregar, { timeout: LIMITE_DO_OCIOSO_MS });
    else setTimeout(carregar, 1); // Safari não tem requestIdleCallback
  };
  const depoisDoLoad = () => setTimeout(quandoOcioso, ESPERA_DEPOIS_DO_LOAD_MS);
  if (document.readyState === "complete") depoisDoLoad();
  else window.addEventListener("load", depoisDoLoad, { once: true });
} else if (process.env.NODE_ENV !== "production") {
  console.error(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
  );
}
