import "server-only";
import { PostHog } from "posthog-node";

/**
 * Cliente PostHog do servidor (um por processo), usado só para registrar erros das rotas.
 * Sem a variável de ambiente devolve null e nada é enviado.
 */
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
let client: PostHog | null = null;
let warned = false;

export function getPostHogServer(): PostHog | null {
  if (!token) {
    if (!warned && process.env.NODE_ENV !== "production") {
      warned = true;
      console.warn(
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
      );
    }
    return null;
  }
  client ??= new PostHog(token, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    // Exceções não tratadas e promessas rejeitadas, só no runtime Node (o edge não registra listeners de processo).
    enableExceptionAutocapture: process.env.NEXT_RUNTIME === "nodejs",
  });
  return client;
}

/** Registra um erro tratado numa rota e espera o envio (em função serverless o processo pode congelar logo depois). */
export async function captureServerError(error: unknown, props: Record<string, string | number | boolean | null | undefined> = {}): Promise<void> {
  const ph = getPostHogServer();
  if (!ph) return;
  try {
    await ph.captureExceptionImmediate(error, undefined, { ...props, handled: true });
  } catch {
    /* analytics nunca derruba a rota */
  }
}
