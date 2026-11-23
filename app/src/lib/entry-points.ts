import { generateProgram, type GenerateInput } from "@/lib/domain/generator";
import { getSystem } from "@/lib/domain/systems";
import type { Program, SystemId } from "@/lib/domain/types";

/**
 * Portas de entrada do app (onboarding, primeira visita ao painel): regras puras, testadas sem rede.
 */

/** O painel do personal foi aberto vindo do onboarding ou do link de teste? Aceita o nome novo e o antigo do parâmetro. */
export function welcomeRequested(params: { get(name: string): string | null }): boolean {
  return Boolean(params.get("bemvindo") || params.get("boasvindas"));
}

/** Primeiro treino do sistema (A no ABC, U1 no Upper/Lower, Push no PPL): rótulo do botão final do onboarding. */
export function firstDayKey(system: SystemId): string {
  return getSystem(system).templates[0]?.key ?? "A";
}

/** Abre o treino na tela de sessão. */
export function sessionHref(programId: string, dayKey: string): string {
  return `/sessao?p=${encodeURIComponent(programId)}&d=${encodeURIComponent(dayKey)}`;
}

export type SoloGeneration = "local" | "ia";

/**
 * Ficha do onboarding de quem treina sozinho. Com a IA desligada, o motor de regras roda no aparelho e
 * `viaAI` nunca é chamada (nenhuma chamada a /api/ai/*). Com a IA ligada, qualquer falha (sem sinal,
 * servidor fora do ar) também cai no motor do aparelho: a pessoa nunca fica sem ficha por causa da rede.
 * Erros do próprio motor sobem para quem chamou.
 */
export async function buildSoloProgram(
  input: GenerateInput,
  owner: { ownerId: string; createdBy: string },
  opts: { aiOn: boolean; viaAI?: (input: GenerateInput) => Promise<{ data: Program; source: "ia" | "motor" }> },
): Promise<{ program: Program; generation: SoloGeneration }> {
  if (opts.aiOn && opts.viaAI) {
    try {
      const r = await opts.viaAI(input);
      if (r.data?.days?.length) return { program: r.data, generation: r.source === "ia" ? "ia" : "local" };
    } catch {
      /* segue no aparelho */
    }
  }
  return { program: generateProgram(input, owner), generation: "local" };
}
