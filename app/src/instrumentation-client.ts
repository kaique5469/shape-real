import posthog from "posthog-js";

/**
 * Analytics e captura de erros no navegador (PostHog), ligado antes de o app ficar interativo.
 * Privacidade: nenhum texto da tela é enviado (nomes de alunos, medidas e dieta ficam no aparelho),
 * a gravação de sessão fica desligada e o código do link de teste é removido das URLs.
 * Sem a variável de ambiente, nada é enviado.
 */
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** Tira da URL o código do link de teste (`?k=`), que não deve sair do aparelho. */
function cleanUrl(value: unknown): unknown {
  if (typeof value !== "string" || !/[?&]k=/.test(value)) return value;
  try {
    const url = new URL(value, window.location.origin);
    url.searchParams.delete("k");
    return /^https?:/i.test(value) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.replace(/([?&])k=[^&#]*/g, "$1");
  }
}

function cleanBag(bag: Record<string, unknown> | undefined) {
  if (!bag) return;
  for (const key of Object.keys(bag)) if (/url|referrer|href/i.test(key)) bag[key] = cleanUrl(bag[key]);
}

if (token) {
  posthog.init(token, {
    // Passa pelo próprio domínio (ver rewrites em next.config.ts) para bloqueadores não derrubarem os eventos.
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? "https://us.posthog.com",
    defaults: "2026-08-30",
    capture_exceptions: true,
    person_profiles: "identified_only",
    persistence: "localStorage",
    disable_session_recording: true,
    // Cliques entram na análise, mas sem o texto nem os rótulos dos elementos (podem conter nomes de alunos).
    mask_all_text: true,
    autocapture: { element_attribute_ignorelist: ["aria-label", "title", "placeholder", "alt", "value", "name"] },
    before_send: (event) => {
      if (!event) return event;
      const props = event.properties as Record<string, unknown> | undefined;
      cleanBag(props);
      cleanBag(props?.$set as Record<string, unknown> | undefined);
      cleanBag(props?.$set_once as Record<string, unknown> | undefined);
      cleanBag(event.$set as Record<string, unknown> | undefined);
      cleanBag(event.$set_once as Record<string, unknown> | undefined);
      return event;
    },
  });
} else if (process.env.NODE_ENV !== "production") {
  console.error(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
  );
}
