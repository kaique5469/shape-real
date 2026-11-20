import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * Infra compartilhada das rotas de IA (somente servidor).
 *
 * Provedores, em ordem de preferência — sempre com o SDK oficial da Anthropic:
 *  1. ANTHROPIC_API_KEY  → API da Anthropic direto;
 *  2. AI_GATEWAY=1       → Vercel AI Gateway (endpoint compatível com a Messages API),
 *                          autenticado pelo token OIDC do próprio deploy — sem chave para guardar.
 *
 * Sem provedor, sem permissão ou em caso de erro, as rotas respondem com o motor
 * determinístico: a IA nunca é ponto único de falha.
 */

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const EFFORT: Effort = EFFORTS.includes(process.env.ANTHROPIC_EFFORT as Effort) ? (process.env.ANTHROPIC_EFFORT as Effort) : "low";

const DIRECT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL || "anthropic/claude-opus-5.5";
const GATEWAY_URL = "https://ai-gateway.vercel.sh";

interface Provider {
  kind: "anthropic" | "gateway";
  client: Anthropic;
  model: string;
}

let direct: Anthropic | null = null;

function resolveProvider(req: Request): Provider | null {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    direct ??= new Anthropic({ timeout: 55_000, maxRetries: 1 });
    return { kind: "anthropic", client: direct, model: DIRECT_MODEL };
  }
  if (process.env.AI_GATEWAY === "1") {
    // Em produção na Vercel o token OIDC chega no cabeçalho da requisição e expira; por isso o cliente é criado por chamada.
    const token = process.env.AI_GATEWAY_API_KEY || req.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN;
    if (token) return { kind: "gateway", client: new Anthropic({ apiKey: token, baseURL: GATEWAY_URL, timeout: 55_000, maxRetries: 1 }), model: GATEWAY_MODEL };
  }
  return null;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.AI_GATEWAY === "1");
}

function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

/** O que o cliente pode saber sobre a IA deste ambiente (sem segredos). */
export function aiStatus(): { configured: boolean; access: "account" | "pass" | "open" | "off" } {
  if (!aiConfigured()) return { configured: false, access: "off" };
  if (supabaseEnv()) return { configured: true, access: "account" };
  if (process.env.DEMO_AI === "1") return { configured: true, access: process.env.TESTER_PASS ? "pass" : "open" };
  return { configured: false, access: "off" };
}

export type AuthDecision =
  | { useAI: true; provider: Provider; usage?: { used: number; limit: number } }
  | { useAI: false; status: number; notice: string };

// Limites em memória para o modo sem contas (por instância; o teto real de gasto é o saldo do provedor).
const PER_IP_PER_HOUR = Number(process.env.DEMO_AI_PER_HOUR) || 25;
const GLOBAL_PER_DAY = Number(process.env.DEMO_AI_PER_DAY) || 600;
const ipHits = new Map<string, number[]>();
let dayKey = "";
let dayCount = 0;

function demoAllowed(ip: string): "ok" | "ip" | "global" {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== dayKey) {
    dayKey = today;
    dayCount = 0;
    ipHits.clear();
  }
  if (dayCount >= GLOBAL_PER_DAY) return "global";
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= PER_IP_PER_HOUR) return "ip";
  hits.push(now);
  ipHits.set(ip, hits);
  dayCount++;
  return "ok";
}

function samePass(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Decide se esta requisição pode usar a IA (e consome 1 crédito do plano quando há contas). */
export async function authorizeAI(req: Request, kind: string): Promise<AuthDecision> {
  const provider = resolveProvider(req);
  if (!provider) return { useAI: false, status: 200, notice: "" };

  const sb = supabaseEnv();
  if (sb) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return { useAI: false, status: 200, notice: "Crie sua conta grátis para usar a IA. Por enquanto, usamos o motor do Shape Real." };
    const db = createClient(sb.url, sb.key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data, error } = await db.rpc("consume_ai_credit", { kind });
    if (error) return { useAI: false, status: 200, notice: "Não foi possível validar seus créditos de IA agora — usando o motor do Shape Real." };
    const r = data as { allowed: boolean; reason?: string; used?: number; limit?: number };
    if (!r.allowed) {
      if (r.reason === "quota")
        return { useAI: false, status: 402, notice: `Você usou ${r.used}/${r.limit} gerações com IA deste mês. Assine o Pro para continuar — ou use o motor do Shape Real, que é grátis.` };
      return { useAI: false, status: 200, notice: "Entre na sua conta para usar a IA." };
    }
    return { useAI: true, provider, usage: { used: r.used ?? 0, limit: r.limit ?? 0 } };
  }

  if (process.env.DEMO_AI === "1") {
    const pass = process.env.TESTER_PASS;
    if (pass && !samePass(req.headers.get("x-sr-pass") ?? "", pass)) return { useAI: false, status: 200, notice: "" };
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const verdict = demoAllowed(ip);
    if (verdict === "ip") return { useAI: false, status: 200, notice: "Muitas gerações com IA na última hora — esta saiu do motor do Shape Real. A IA volta em instantes." };
    if (verdict === "global") return { useAI: false, status: 200, notice: "A cota de IA do teste acabou por hoje — esta saiu do motor do Shape Real." };
    return { useAI: true, provider };
  }
  return { useAI: false, status: 200, notice: "" };
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1]! : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("sem JSON na resposta");
  return JSON.parse(raw.slice(start, end + 1));
}

function logFailure(where: string, err: unknown) {
  if (err instanceof Anthropic.RateLimitError) console.warn(`[ai] ${where}: limite de requisições`);
  else if (err instanceof Anthropic.APIError) console.error(`[ai] ${where}: erro ${err.status}`, err.message);
  else if (err instanceof SyntaxError) console.error(`[ai] ${where}: JSON inválido na resposta`);
  else console.error(`[ai] ${where}: falha`, err);
}

/**
 * Chamada com saída estruturada (JSON Schema). Devolve o objeto parseado ou null
 * quando houver recusa, truncamento ou erro — o chamador cai no motor determinístico.
 */
export async function structuredCall<T>(
  provider: Provider,
  opts: { system: string; user: string; schema: Record<string, unknown>; maxTokens?: number },
): Promise<T | null> {
  const base = {
    model: provider.model,
    max_tokens: opts.maxTokens ?? 12_000,
    system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }],
  };
  const started = Date.now();
  try {
    const res =
      provider.kind === "anthropic"
        ? await provider.client.beta.messages.create({
            ...base,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            messages: [{ role: "user", content: opts.user }],
            output_config: { effort: EFFORT, format: { type: "json_schema", schema: opts.schema } },
          })
        : await provider.client.messages.create({
            ...base,
            messages: [{ role: "user", content: opts.user }],
            output_config: { effort: EFFORT, format: { type: "json_schema", schema: opts.schema } },
          });
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
      console.warn("[ai] stop_reason", res.stop_reason);
      return null;
    }
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    console.info(`[ai] ok ${provider.kind} ${provider.model} ${Date.now() - started}ms in=${res.usage.input_tokens} out=${res.usage.output_tokens}`);
    return extractJson(text.text) as T;
  } catch (err) {
    // O gateway pode não repassar output_config: tenta uma vez pedindo o JSON pelo prompt.
    if (provider.kind === "gateway" && err instanceof Anthropic.BadRequestError) {
      console.warn("[ai] gateway recusou saída estruturada; tentando por instrução:", err.message);
      try {
        const res = await provider.client.messages.create({
          ...base,
          messages: [
            {
              role: "user",
              content: `${opts.user}\n\nResponda SOMENTE com um objeto JSON válido (sem texto antes ou depois, sem cercas de código) que siga exatamente este JSON Schema:\n${JSON.stringify(opts.schema)}`,
            },
          ],
        });
        if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
        const text = res.content.find((b) => b.type === "text");
        if (!text || text.type !== "text") return null;
        console.info(`[ai] ok(instr) ${provider.model} ${Date.now() - started}ms in=${res.usage.input_tokens} out=${res.usage.output_tokens}`);
        return extractJson(text.text) as T;
      } catch (err2) {
        logFailure("gateway/instrução", err2);
        return null;
      }
    }
    logFailure(provider.kind, err);
    return null;
  }
}
