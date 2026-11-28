import { BACKUP_VERSION } from "@/lib/domain/export";
import { fmtDayMonth } from "@/lib/domain/format";
import { TRANSFER_VERSION } from "@/lib/domain/transfer";

/**
 * Rodada 3 (R3-2): build identificável. O SHA curto e a hora do build entram em `NEXT_PUBLIC_BUILD_SHA` e
 * `NEXT_PUBLIC_BUILD_AT` no next.config.ts (inlinados no build, no servidor e no navegador). `GET /api/versao` e o
 * rodapé da Conta leem por aqui. Nada sensível: só o SHA público do commit, a hora do build e as duas versões de
 * formato (links e cópia de segurança), que já viajam dentro de cada link e de cada arquivo.
 */

/** Sem commit conhecido (build local, `next dev`, variável ausente ou fora do formato). */
export const SHA_LOCAL = "local";

const SHA_CURTO = /^[0-9a-f]{7}$/;

/** O SHA como foi gravado no build: 7 caracteres hexadecimais minúsculos, senão "local" (nunca outro texto). */
export function shaDoBuild(v: string | null | undefined): string {
  return typeof v === "string" && SHA_CURTO.test(v) ? v : SHA_LOCAL;
}

/** Hora do build em ISO; null quando ausente ou ilegível. */
export function horaDoBuild(v: string | null | undefined): string | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Corpo de `GET /api/versao`: exatamente estas 4 chaves. */
export interface VersaoDoBuild {
  sha: string;
  at: string | null;
  /** Versão do formato dos links (TRANSFER_VERSION). */
  protocolo: number;
  /** Versão do formato da cópia de segurança (BACKUP_VERSION). */
  copia: number;
}

/**
 * Versão deste build. Quem chama passa `process.env.NEXT_PUBLIC_BUILD_SHA` e `process.env.NEXT_PUBLIC_BUILD_AT`
 * escritos por extenso (o build só troca o acesso literal pelo valor).
 */
export function versaoDoBuild(env: { sha?: string | null; at?: string | null }): VersaoDoBuild {
  return { sha: shaDoBuild(env.sha), at: horaDoBuild(env.at), protocolo: TRANSFER_VERSION, copia: BACKUP_VERSION };
}

/** Rodapé da Conta: "Versão a1b2c3d · 26/11 · links v1" (dia no fuso do aparelho; sem data legível, sem a data). */
export function rodapeVersao(v: Pick<VersaoDoBuild, "sha" | "at" | "protocolo">): string {
  const partes = [`Versão ${shaDoBuild(v.sha)}`];
  const at = horaDoBuild(v.at);
  if (at) partes.push(fmtDayMonth(at));
  partes.push(`links v${v.protocolo}`);
  return partes.join(" · ");
}
