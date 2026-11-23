import type { Profile } from "./types";

// Nome e CREF do personal: máscara, validação e a assinatura única "Nome · CREF …".
// Sem dependências além dos tipos: importado por telas que não podem carregar o gerador de fichas.
const UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);
export const CREF_MAX = 24;

/**
 * Máscara tolerante do CREF enquanto a pessoa digita: "012345gsp" vira "012345-G/SP" e "CREF 012345-G/SP"
 * perde o "CREF" repetido. O que não cabe no desenho 000000-G/UF fica como foi digitado (em maiúsculas):
 * o registro pode estar escrito de outro jeito e o app não confere o número.
 */
export function maskCref(raw: string): string {
  const s = raw.toUpperCase().replace(/^\s*CREF[\s:.-]+(?=\d)/, "");
  const m = /^(\d{1,6})([A-Z]?)([A-Z]{0,2})$/.exec(s.replace(/[\s./-]/g, ""));
  if (!m) return s.slice(0, CREF_MAX);
  const [, digits, cat, uf] = m;
  return `${digits}${cat ? `-${cat}` : ""}${uf ? `/${uf}` : ""}`;
}

/** CREF para guardar: máscara aplicada, sem espaços nem separador sobrando no fim; vazio vira undefined. */
export function normalizeCref(raw: string | null | undefined): string | undefined {
  const v = maskCref(raw ?? "").trim().replace(/[\s/-]+$/, "");
  return v || undefined;
}

/** No formato 000000-G/UF, com uma UF que existe. Fora dele o app só avisa: nunca impede salvar. */
export function crefLooksValid(cref: string | null | undefined): boolean {
  const m = /^\d{6}-[A-Z]\/([A-Z]{2})$/.exec((cref ?? "").trim());
  return Boolean(m && UFS.has(m[1]!));
}

/**
 * Assinatura do personal em tudo o que o aluno vê (ficha, dieta, relatório, textos do WhatsApp):
 * "Camila Duarte · CREF 012345-G/SP", ou só o nome quando não há CREF.
 */
export function coachSignature(coach: { name?: string | null; cref?: string | null } | null | undefined): string | undefined {
  const name = coach?.name?.trim();
  if (!name) return undefined;
  const label = crefLabel(coach?.cref);
  return label ? `${name} · ${label}` : name;
}

/** "CREF 012345-G/SP" (sem dobrar o "CREF" quando a pessoa já digitou); null sem CREF. */
export function crefLabel(cref: string | null | undefined): string | null {
  const v = cref?.trim();
  if (!v) return null;
  return /^CREF/i.test(v) ? v : `CREF ${v}`;
}

/**
 * Quem assina o que está na tela: o personal logado (sem o nome provisório "Personal") ou, no celular do aluno,
 * o personal que enviou a ficha ou a dieta (`createdBy` é o id dele).
 */
export function signerFor(user: Pick<Profile, "role" | "name" | "cref" | "remoteCoach"> | null | undefined, createdBy?: string | null): { name: string; cref?: string } | null {
  if (!user) return null;
  if (user.role === "coach") {
    const name = user.name.trim();
    return name && name !== "Personal" ? { name, cref: user.cref } : null;
  }
  const rc = user.remoteCoach;
  if (rc && createdBy && createdBy === rc.id && rc.name.trim()) return { name: rc.name.trim(), cref: rc.cref };
  return null;
}
