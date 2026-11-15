"use client";

import type { GenerateInput } from "@/lib/domain/generator";
import type { DietPlan, MacroTargets, Meal, Program } from "@/lib/domain/types";

export interface AIResult<T> {
  data: T;
  source: "ia" | "motor";
  notice?: string;
  quota?: boolean;
}

async function post<T>(path: string, body: unknown, token: string | null): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Não foi possível falar com o servidor. Tente de novo.");
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
