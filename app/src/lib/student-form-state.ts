/**
 * Estado do formulário do aluno (cadastro e "Editar dados"), puro, para teste (spec §5.1, entradas 15 e 16 do
 * DECISIONS). Sem React.
 *
 *  - Criação pelo formulário completo ("Prefiro digitar os dados eu mesmo" ou chave `questionario` desligada): os
 *    padrões de antes (hipertrofia, iniciante, 3 dias, 60 min, academia).
 *  - Edição: campo que o perfil não tem fica vazio ("Escolher") e campo vazio não é gravado. Antes, salvar a edição
 *    gravava os padrões sem ninguém escolher, e "Conferir antes de salvar" mostrava diferenças falsas quando as
 *    respostas do questionário chegavam.
 *  - Cadastro rápido: só nome e WhatsApp, e o destino depois de salvar (`rotaDepoisDoCadastro`).
 */
import type { WorkStyle } from "@/lib/domain/anamnese-types";
import { maskPhone } from "@/lib/domain/format";
import { normalize } from "@/lib/domain/exercises";
import { consentConfirmed } from "@/lib/domain/transfer";
import { resolveDefaults } from "@/lib/domain/work-style";
import { temSaudeNoQuestionario } from "@/lib/domain/anamnese-perfil";
import type { ActivityLevel, Equipment, Goal, Level, Profile, Sex } from "@/lib/domain/types";

export interface FormState {
  name: string;
  phone: string;
  goal: Goal | "";
  level: Level | "";
  daysPerWeek: string;
  sessionMinutes: string;
  equipment: Equipment | "";
  limitations: string;
  sex: Sex | "";
  birthYear: string;
  heightCm: string;
  weightKg: string;
  activity: ActivityLevel | "";
  coachNotes: string;
  /** "O aluno autorizou registrar estes dados de saúde" (começa desmarcado em cadastro novo). */
  consent: boolean;
}

/** Teto de Limitações: o mesmo do link da ficha (transfer.ts, `limitations: opt(text(1000))`). */
export const LIMITACOES_MAX_FORM = 1000;

/** Padrões do formulário completo de criação (os de antes; nunca usados na edição). */
export const PADROES_CRIACAO = { goal: "hipertrofia", level: "iniciante", daysPerWeek: "3", sessionMinutes: "60", equipment: "academia" } as const satisfies Partial<FormState>;

export function formInicial(p: Profile | null | undefined, modo: "criacao" | "edicao"): FormState {
  const s = p ?? null;
  const padrao = modo === "criacao" ? PADROES_CRIACAO : null;
  return {
    name: s?.name ?? "",
    phone: maskPhone(s?.phone ?? ""),
    goal: s?.goal ?? padrao?.goal ?? "",
    level: s?.level ?? padrao?.level ?? "",
    daysPerWeek: s?.daysPerWeek ? String(s.daysPerWeek) : (padrao?.daysPerWeek ?? ""),
    sessionMinutes: s?.sessionMinutes ? String(s.sessionMinutes) : (padrao?.sessionMinutes ?? ""),
    equipment: s?.equipment ?? padrao?.equipment ?? "",
    limitations: s?.limitations ?? "",
    sex: s?.sex ?? "",
    birthYear: s?.birthYear ? String(s.birthYear) : "",
    heightCm: s?.heightCm ? String(s.heightCm) : "",
    weightKg: s?.weightKg ? String(s.weightKg).replace(".", ",") : "",
    activity: s?.activity ?? "",
    coachNotes: s?.coachNotes ?? "",
    // Data carimbada sozinha por versões anteriores (sem origem) não conta: o checkbox começa desmarcado.
    consent: consentConfirmed(s),
  };
}

/** Número digitado ("72,5" ou "72.5"); undefined para vazio ou inválido. */
export function numeroDoCampo(v: string): number | undefined {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : undefined;
}

/** Campos do cadastro que o formulário controla (os outros, como as respostas do questionário, nunca são tocados). */
export const CAMPOS_DO_FORMULARIO = ["name", "phone", "goal", "level", "daysPerWeek", "sessionMinutes", "equipment", "limitations", "sex", "birthYear", "heightCm", "weightKg", "activity", "coachNotes"] as const satisfies readonly (keyof Profile)[];

/**
 * O que o formulário grava: só os campos preenchidos (campo vazio não entra). A autorização fica de fora: depende do
 * perfil anterior e da hora (`consentFromCheckbox` em transfer.ts).
 */
export function patchDoFormulario(f: FormState): Partial<Profile> {
  const p: Partial<Profile> = {};
  const name = f.name.trim().replace(/\s+/g, " ");
  if (name) p.name = name;
  const phone = f.phone.replace(/\D/g, "");
  if (phone) p.phone = phone;
  if (f.goal) p.goal = f.goal;
  if (f.level) p.level = f.level;
  const dias = numeroDoCampo(f.daysPerWeek);
  if (dias !== undefined) p.daysPerWeek = dias;
  const min = numeroDoCampo(f.sessionMinutes);
  if (min !== undefined) p.sessionMinutes = min;
  if (f.equipment) p.equipment = f.equipment;
  const lim = f.limitations.trim();
  if (lim) p.limitations = lim.slice(0, LIMITACOES_MAX_FORM);
  if (f.sex) p.sex = f.sex;
  const ano = numeroDoCampo(f.birthYear);
  if (ano !== undefined) p.birthYear = ano;
  const h = numeroDoCampo(f.heightCm);
  if (h !== undefined) p.heightCm = h;
  const w = numeroDoCampo(f.weightKg);
  if (w !== undefined) p.weightKg = w;
  if (f.activity) p.activity = f.activity;
  const notas = f.coachNotes.trim();
  if (notas) p.coachNotes = notas;
  return p;
}

/** Trecho de limitações comparável (sem acento, sem caixa, espaços normalizados, sem pontuação no fim). */
const trecho = (s: string) => normalize(s).replace(/\s+/g, " ").replace(/[.,;:!]+$/, "").trim();

/**
 * Perfil depois de salvar a edição: os campos do formulário que ficaram vazios saem (o personal apagou ou nunca
 * escolheu) e os preenchidos entram; tudo o que o formulário não controla fica. Os termos que o app pôs nas
 * limitações (`limitacoesDoQuestionario`) só continuam rastreados se ainda estão no texto.
 */
export function perfilEditado(p: Profile, f: FormState): Profile {
  const next = { ...p } as Record<string, unknown>;
  for (const c of CAMPOS_DO_FORMULARIO) delete next[c];
  const out = { ...next, ...patchDoFormulario(f) } as unknown as Profile;
  if (!out.name) out.name = p.name;
  const doApp = p.limitacoesDoQuestionario ?? [];
  if (doApp.length) {
    const presentes = new Set((out.limitations ?? "").split(";").map(trecho));
    const ficam = doApp.filter((t) => presentes.has(trecho(t)));
    if (ficam.length) out.limitacoesDoQuestionario = ficam;
    else delete out.limitacoesDoQuestionario;
  }
  return out;
}

/**
 * Desmarcar a autorização com dados de saúde do questionário no perfil pede a confirmação de spec §11.2 e salva com
 * `revogarSaude`. Só quando a autorização valia ao abrir (o checkbox estava marcado) e o personal desmarcou.
 */
export function pedeRevogacao(p: Profile | null | undefined, f: Pick<FormState, "consent">): boolean {
  return !!p && consentConfirmed(p) && !f.consent && temSaudeNoQuestionario(p);
}

// ───────────────────────── Cadastro rápido (spec §5.1) ─────────────────────────

export type ModoCadastro = "agora" | "whatsapp" | "depois";
export const MODOS_CADASTRO: readonly ModoCadastro[] = ["agora", "whatsapp", "depois"];

/** Rótulo do Segmented "Questionário inicial", a dica embaixo e o botão de salvar, por escolha (literais). */
export const MODO_ROTULO: Record<ModoCadastro, string> = { agora: "Preencher agora", whatsapp: "Mandar pelo WhatsApp", depois: "Depois" };
export const MODO_DICA: Record<ModoCadastro, string> = {
  agora: "Com o aluno do seu lado, neste aparelho.",
  whatsapp: "Ele responde no celular dele, sem cadastro.",
  depois: "Só salvar o nome por enquanto.",
};
export const MODO_BOTAO: Record<ModoCadastro, string> = { agora: "Começar o questionário", whatsapp: "Salvar e mandar", depois: "Salvar aluno" };

/** Telefone com DDD digitado (o mesmo mínimo da validação do formulário). */
export const temTelefone = (phone: string) => phone.replace(/\D/g, "").length >= 10;

/**
 * Escolha padrão do cadastro rápido: a do jeito de trabalhar (`resolveDefaults`). Sem jeito definido, muda para
 * "Mandar pelo WhatsApp" quando o telefone é digitado. A tela só usa enquanto o personal não tocou na escolha.
 */
export function modoSugerido(ws: WorkStyle | undefined, phone: string): ModoCadastro {
  return resolveDefaults(ws, { hasPhone: temTelefone(phone) }).modoPadrao;
}

/** O que o cadastro rápido grava (entrada 15): só nome e WhatsApp, sem padrões de treino. */
export function rascunhoRapido(f: Pick<FormState, "name" | "phone">): { name: string; phone?: string } {
  const name = f.name.trim().replace(/\s+/g, " ");
  const phone = f.phone.replace(/\D/g, "");
  return phone ? { name, phone } : { name };
}

/**
 * Destino depois de salvar (spec §5.1). Preencher agora → `/questionario?aluno={id}` (no CORE do service worker:
 * abre também sem rede). WhatsApp → página do aluno com o pedido aberto; Depois e formulário completo → página do
 * aluno. Sem rede, a página do aluno (rota dinâmica, fora do CORE) não abre: fica em /alunos com o aviso.
 */
export function rotaDepoisDoCadastro(
  p: Pick<Profile, "id" | "name">,
  modo: ModoCadastro | "completo",
  online: boolean,
): { href: string } | { aviso: string } {
  const id = encodeURIComponent(p.id);
  if (modo === "agora") return { href: `/questionario?aluno=${id}` };
  if (!online) {
    const nome = p.name.trim() || "O aluno";
    return { aviso: `${nome} foi salvo. Sem internet: a página de ${nome} abre quando o sinal voltar.` };
  }
  return { href: modo === "whatsapp" ? `/alunos/${id}?novo=1&pedir=1` : `/alunos/${id}?novo=1` };
}
