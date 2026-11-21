import type { Instrumentation } from "next";
import { createOnRequestError } from "@posthog/next";
import { getPostHogServer } from "@/lib/posthog-server";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") getPostHogServer();
}

const report = token ? createOnRequestError({ apiKey: token, host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com" }) : null;

/** Erros de Server Components, rotas e Server Actions vão para o acompanhamento de erros (sem token, não faz nada). */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!report) return;
  try {
    await report(...args);
  } catch {
    /* analytics nunca derruba a requisição */
  }
};
