"use client";

/**
 * Eventos de produto. Sem chave configurada, só registra no console em dev.
 * Com NEXT_PUBLIC_POSTHOG_KEY, envia para o PostHog via /capture (sem SDK, ~0 KB).
 * Nunca envie dados de saúde (peso, medidas, dieta) nas propriedades.
 */
export type EventName =
  | "landing_cta_clicked"
  | "signup_started"
  | "signup_completed"
  | "demo_started"
  | "onboarding_completed"
  | "program_generated"
  | "program_saved"
  | "workout_started"
  | "workout_completed"
  | "pr_achieved"
  | "metric_logged"
  | "photo_added"
  | "diet_analyzed"
  | "diet_generated"
  | "student_invited"
  | "invite_accepted"
  | "program_assigned"
  | "export_downloaded"
  | "upgrade_clicked"
  | "paywall_viewed";

let distinctId: string | null = null;

function id(): string {
  if (distinctId) return distinctId;
  try {
    distinctId = localStorage.getItem("sr:aid") ?? crypto.randomUUID();
    localStorage.setItem("sr:aid", distinctId);
  } catch {
    distinctId = "anon";
  }
  return distinctId;
}

export function identify(userId: string) {
  distinctId = userId;
  try {
    localStorage.setItem("sr:aid", userId);
  } catch {
    /* modo privado */
  }
}

export function track(event: EventName, props: Record<string, string | number | boolean | null | undefined> = {}) {
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.debug("[track]", event, props);
    return;
  }
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  const body = JSON.stringify({
    api_key: key,
    event,
    distinct_id: id(),
    properties: { ...props, $current_url: location.href, $pathname: location.pathname },
    timestamp: new Date().toISOString(),
  });
  try {
    const ok = navigator.sendBeacon?.(`${host}/capture/`, new Blob([body], { type: "application/json" }));
    if (!ok) void fetch(`${host}/capture/`, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
  } catch {
    /* analytics nunca quebra o app */
  }
}
