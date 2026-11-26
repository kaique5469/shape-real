/**
 * Fixtures puras do questionário (track A), reutilizáveis pelos testes de todas as trilhas. Sem vitest, sem React.
 * Datas fixas: HOJE = 23/11/2026 12:00 (−03:00). A rodada padrão é de 20/11/2026, pelo link, com autorização,
 * tudo "não" e respostas completas (nenhum alerta, nenhuma pergunta faltando).
 */
import type { Anamnese, AnamneseAnswers, CtxQuestionario, WorkStyle } from "./anamnese-types";
import { ANAMNESE_V, CONSENT_TEXT_ID, PARQ_TEXT_ID } from "./anamnese-types";
import type { Profile } from "./types";

export const HOJE: Date = new Date("2026-11-23T12:00:00-03:00");
export const RESPONDIDO_EM = "2026-11-20T10:00:00-03:00";

/** Ano de nascimento para a idade calculada (ano de HOJE − ano). */
export function anoParaIdade(idade: number, hoje: Date = HOJE): number {
  return hoje.getFullYear() - idade;
}

export function respostasBase(over: Partial<AnamneseAnswers> = {}): AnamneseAnswers {
  return {
    nome: "Ana Souza",
    ano: 1990,
    sexo: "F",
    altura: 165,
    peso: 62,
    parq: [0, 0, 0, 0, 0, 0, 0],
    regular: "sim3m",
    condicoes: [],
    sintomas: [],
    remedios: 0,
    cirurgia: 0,
    gestacao: "nao",
    dor: 0,
    lesao: 0,
    objetivo: "massa",
    experiencia: "m12",
    dias: 3,
    minutos: 60,
    onde: "academia",
    nutri: "nao",
    foco: ["gluteos"],
    naoQuer: [],
    barreira: ["tempo"],
    ...over,
  };
}

export function anamneseBase(over: Partial<AnamneseAnswers> = {}, meta: Partial<Anamnese> = {}): Anamnese {
  const answeredAt = meta.answeredAt ?? RESPONDIDO_EM;
  return {
    v: ANAMNESE_V,
    id: "an-1",
    answeredAt,
    by: "aluno",
    via: "link",
    modulos: [],
    parqText: PARQ_TEXT_ID,
    a: respostasBase(over),
    consent: { at: answeredAt, source: "aluno_questionario", textId: CONSENT_TEXT_ID },
    declaredAt: answeredAt,
    ...meta,
  };
}

/** Aluno cadastrado pelo personal, sem questionário (passe `anamnese` em `over`). */
export function alunoBase(over: Partial<Profile> = {}): Profile {
  return {
    id: "aluno-1",
    name: "Ana Souza",
    role: "athlete",
    plan: "free",
    onboarded: true,
    createdAt: "2026-11-01T10:00:00-03:00",
    managedBy: "personal-1",
    phone: "11988887777",
    ...over,
  };
}

export function personalBase(ws?: WorkStyle): Profile {
  return {
    id: "personal-1",
    name: "Carlos Lima",
    role: "coach",
    plan: "coach",
    onboarded: true,
    createdAt: "2026-10-01T10:00:00-03:00",
    phone: "11999990000",
    cref: "012345-G/SP",
    ...(ws ? { workStyle: ws } : {}),
  };
}

/** Contexto do questionário pelo link, sem partes extras. */
export function ctxBase(over: Partial<CtxQuestionario> = {}): CtxQuestionario {
  return { hoje: HOJE, modo: "link", modulos: [], personal: "Carlos Lima", aluno: "Ana Souza", extras: [], ...over };
}
