import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * Infra compartilhada das rotas de IA (somente servidor).
 * - Modelo e esforço configuráveis por env; padrão claude-opus-5-5 com esforço "low"
 *   (resposta rápida para quem está esperando na tela).
 * - Fallback de recusa no servidor ("default") habilitado.
 * - Sem chave, sem login ou sem crédito: as rotas respondem com o motor determinístico.
 */

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORT: Effort = (["low", "medium", "high", "xhigh", "max"] as const).includes(process.env.ANTHROPIC_EFFORT as Effort)
  ? (process.env.ANTHROPIC_EFFORT as Effort)
  : "low";

let anthropic: Anthropic | null = null;
function client(): Anthropic {
  anthropic ??= new Anthropic({ timeout: 55_000, maxRetries: 1 });
  return anthropic;
}

export function aiKeyConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type AuthDecision =
  | { useAI: true; usage?: { used: number; limit: number } }
  | { useAI: false; status: number; notice: string };

// Limite simples por IP quando não há contas (DEMO_AI=1). Em produção use Supabase.
const ipHits = new Map<string, number[]>();
function ipAllowed(ip: string, max = 5, windowMs = 3_600_000): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  ipHits.set(ip, hits);
  return true;
}

/** Decide se esta requisição pode usar a IA (e consome 1 crédito do plano quando pode). */
export async function authorizeAI(req: Request, kind: string): Promise<AuthDecision> {
  if (!aiKeyConfigured()) return { useAI: false, status: 200, notice: "IA não configurada neste ambiente — usando o motor do Shape Real." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return { useAI: false, status: 200, notice: "Crie sua conta grátis para usar a IA. Por enquanto, usamos o motor do Shape Real." };
    const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data, error } = await sb.rpc("consume_ai_credit", { kind });
    if (error) return { useAI: false, status: 200, notice: "Não foi possível validar seus créditos de IA agora — usando o motor do Shape Real." };
    const r = data as { allowed: boolean; reason?: string; used?: number; limit?: number };
    if (!r.allowed) {
      if (r.reason === "quota")
        return { useAI: false, status: 402, notice: `Você usou ${r.used}/${r.limit} gerações com IA deste mês. Assine o Pro para continuar — ou use o motor do Shape Real, que é grátis.` };
      return { useAI: false, status: 200, notice: "Entre na sua conta para usar a IA." };
    }
    return { useAI: true, usage: { used: r.used ?? 0, limit: r.limit ?? 0 } };
  }

  if (process.env.DEMO_AI === "1") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!ipAllowed(ip)) return { useAI: false, status: 200, notice: "Limite de demonstração atingido — usando o motor do Shape Real." };
    return { useAI: true };
  }
  return { useAI: false, status: 200, notice: "Modo local: a IA real fica disponível com conta. Usando o motor do Shape Real." };
}

/**
 * Chamada com saída estruturada (JSON Schema). Devolve o objeto parseado ou null
 * quando houver recusa, truncamento ou erro — o chamador cai no motor determinístico.
 */
export async function structuredCall<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T | null> {
  try {
    const res = await client().beta.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 12_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: opts.schema } },
    });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
      console.warn("[ai] stop_reason", res.stop_reason, res._request_id);
      return null;
    }
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    return JSON.parse(text.text) as T;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("[ai] rate limited");
    else if (err instanceof Anthropic.APIError) console.error("[ai] API error", err.status, err.message);
    else if (err instanceof SyntaxError) console.error("[ai] JSON inválido na resposta");
    else console.error("[ai] falha", err);
    return null;
  }
}
