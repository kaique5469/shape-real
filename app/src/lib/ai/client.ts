"use client";

import { useEffect, useState } from "react";
import { reportError } from "@/lib/analytics";
import type { GenerateInput } from "@/lib/domain/generator";
import type { DietPlan, MacroTargets, Meal, Program } from "@/lib/domain/types";

export interface AIResult<T> {
  data: T;
  source: "ia" | "motor";
  notice?: string;
  quota?: boolean;
}

const PASS_KEY = "sr:pass";

/** Código do link de teste (libera a IA real para quem recebeu o link). */
export function saveTesterPass(pass: string) {
  try {
    localStorage.setItem(PASS_KEY, pass.slice(0, 64));
  } catch {
    /* modo privado */
  }
}

function testerPass(): string | null {
  try {
    return localStorage.getItem(PASS_KEY);
  } catch {
    return null;
  }
}

/** O pedido nem chegou ao servidor (sem sinal, modo avião). Quem chama pode resolver no próprio aparelho. */
export class OfflineError extends Error {
  constructor() {
    super("Sem conexão com a internet. Confira o sinal e tente de novo.");
    this.name = "OfflineError";
  }
}

async function post<T>(path: string, body: unknown, token: string | null): Promise<T> {
  const pass = testerPass();
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(pass ? { "x-sr-pass": pass } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Resposta de erro do servidor (não inclui o que o usuário digitou): ajuda a achar rotas com problema.
    reportError(new Error(`API ${path} respondeu ${res.status}`), "api", { status: res.status, path });
    throw new Error((json as { error?: string }).error ?? "Não foi possível falar com o servidor. Tente de novo.");
  }
  return json as T;
}

export async function aiProgram(input: GenerateInput & { notes?: string }, owner: { ownerId: string; createdBy: string }, token: string | null): Promise<AIResult<Program>> {
  const r = await post<{ program: Program; source: "ia" | "motor"; notice?: string; quota?: boolean }>("/api/ai/program", { input, ...owner }, token);
  return { data: r.program, source: r.source, notice: r.notice, quota: r.quota };
}

export interface DietAnalysis {
  meals: Meal[];
  totals: MacroTargets;
  score: number;
  summary: string;
  highlights: string[];
  adjustments: string[];
  unknown: string[];
}

export async function aiDietAnalyze(
  body: { text: string; targets: MacroTargets; goal?: string; weightKg?: number; ownerId: string; createdBy: string },
  token: string | null,
): Promise<AIResult<DietAnalysis>> {
  const r = await post<DietAnalysis & { source: "ia" | "motor"; notice?: string; quota?: boolean }>("/api/ai/diet", { mode: "analyze", ...body }, token);
  return { data: r, source: r.source, notice: r.notice, quota: r.quota };
}

export async function aiDietGenerate(
  body: { targets: MacroTargets; goal?: string; weightKg?: number; preferences?: string; ownerId: string; createdBy: string },
  token: string | null,
): Promise<AIResult<DietPlan>> {
  const r = await post<{ diet: DietPlan; source: "ia" | "motor"; notice?: string; quota?: boolean }>("/api/ai/diet", { mode: "generate", ...body }, token);
  return { data: r.diet, source: r.source, notice: r.notice, quota: r.quota };
}

export interface AIStatus {
  configured: boolean;
  access: "account" | "pass" | "open" | "off";
}

const AI_OFF: AIStatus = { configured: false, access: "off" };

/**
 * Vale a pena perguntar ao servidor se a IA está ligada? Só há caminho para a IA com conta na nuvem,
 * com o código do link de teste (`/testar?k=`) ou com o modo aberto anunciado no build
 * (NEXT_PUBLIC_AI_OPEN=1, par do DEMO_AI=1 sem TESTER_PASS). Fora isso a IA está desligada para esta pessoa
 * e o app não faz nenhuma chamada a /api/ai/* (nem o status): tudo sai do motor de regras, no aparelho.
 */
export function shouldAskAIStatus(ctx: { signedIn: boolean; hasPass: boolean; openBuild: boolean }): boolean {
  return ctx.signedIn || ctx.hasPass || ctx.openBuild;
}

/** Com a resposta do servidor: a IA real atende esta pessoa? */
export function aiEnabledFor(status: AIStatus | null, ctx: { signedIn: boolean; hasPass: boolean }): boolean {
  if (!status?.configured) return false;
  return status.access === "open" || (status.access === "pass" && ctx.hasPass) || (status.access === "account" && ctx.signedIn);
}

const openBuild = () => process.env.NEXT_PUBLIC_AI_OPEN === "1";

let statusPromise: Promise<AIStatus> | null = null;

function loadStatus(signedIn: boolean): Promise<AIStatus> {
  if (!shouldAskAIStatus({ signedIn, hasPass: Boolean(testerPass()), openBuild: openBuild() })) return Promise.resolve(AI_OFF);
  statusPromise ??= fetch("/api/ai/status")
    .then((r) => (r.ok ? (r.json() as Promise<AIStatus>) : AI_OFF))
    .catch(() => AI_OFF);
  return statusPromise;
}

/**
 * Decide na hora de gerar (sem depender do estado de um hook): a IA atende agora?
 * Sem caminho para a IA, responde `false` sem tocar na rede; sem sinal, também `false`.
 */
export async function aiAvailable(signedIn: boolean): Promise<boolean> {
  return aiEnabledFor(await loadStatus(signedIn), { signedIn, hasPass: Boolean(testerPass()) });
}

/**
 * A IA real está disponível para este usuário? (decide os textos da interface:
 * "Gerar com IA" quando sim; "Gerar ficha" pelo motor do app quando não.)
 */
export function useAI(signedIn: boolean): { enabled: boolean; loading: boolean } {
  const [status, setStatus] = useState<AIStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void loadStatus(signedIn).then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, [signedIn]);
  if (!status) return { enabled: false, loading: true };
  return { enabled: aiEnabledFor(status, { signedIn, hasPass: Boolean(testerPass()) }), loading: false };
}
