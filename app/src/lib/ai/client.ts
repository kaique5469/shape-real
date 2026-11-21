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

interface AIStatus {
  configured: boolean;
  access: "account" | "pass" | "open" | "off";
}

let statusPromise: Promise<AIStatus> | null = null;

/**
 * A IA real está disponível para este usuário? (decide os textos da interface:
 * "Gerar com IA" quando sim; "Gerar ficha" pelo motor do app quando não.)
 */
export function useAI(signedIn: boolean): { enabled: boolean; loading: boolean } {
  const [status, setStatus] = useState<AIStatus | null>(null);
  useEffect(() => {
    statusPromise ??= fetch("/api/ai/status")
      .then((r) => (r.ok ? (r.json() as Promise<AIStatus>) : { configured: false, access: "off" as const }))
      .catch(() => ({ configured: false, access: "off" as const }));
    let alive = true;
    void statusPromise.then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  if (!status) return { enabled: false, loading: true };
  const enabled = status.configured && (status.access === "open" || (status.access === "pass" && Boolean(testerPass())) || (status.access === "account" && signedIn));
  return { enabled, loading: false };
}
