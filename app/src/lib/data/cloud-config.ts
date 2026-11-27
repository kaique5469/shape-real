/**
 * O que o app precisa saber da nuvem (Supabase) sem baixar supabase-js (~65 KB gzip): se ela está configurada neste
 * deploy e a cópia, guardada no aparelho, de quem estava logado. O cliente e o repositório da nuvem ficam em
 * `supabase.ts`, que só é pedido quando a nuvem está configurada (app-context.tsx, rodada M, RM-05).
 *
 * Nada aqui importa @supabase/*. `supabase.ts` reexporta estas funções (o endereço antigo continua valendo).
 */
import type { Profile } from "@/lib/domain/types";

/** Prefixo das cópias da nuvem guardadas no aparelho (perfil, leituras e treinos pendentes). */
export const CLOUD_CACHE_PREFIX = "sr:cloud:";
/** Perfil de quem estava logado (lido também por `perfisDoAparelho`, em questionario-base.ts). */
export const CLOUD_ME_KEY = `${CLOUD_CACHE_PREFIX}me`;

export function supabaseKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseKey());
}

/** Perfil de quem estava logado da última vez: permite abrir o app sem rede. */
export function cachedSelf(): Profile | null {
  try {
    const raw = localStorage.getItem(CLOUD_ME_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

/** Ao sair da conta, nada dela fica no aparelho. */
export function clearCloudCache() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(CLOUD_CACHE_PREFIX)) localStorage.removeItem(key);
  } catch {}
}
