/**
 * Jeito de trabalhar do personal (spec §3): o que cada resposta muda nos padrões do app. Puro.
 *
 * Nunca muda (spec §3.3): PAR-Q, termo, triagem, dores e sinais de alerta da coluna, gestação, quedas, pressão e
 * diabetes, autorização, níveis de alerta, travas e o passo clínico de nutricionista. Por isso `Padroes` não tem
 * nenhum campo de triagem: o público "mulheres" só liga a parte Hábitos.
 */
import { MODULOS, type Alimentacao, type Atendimento, type Equipamento, type Modulo, type Objetivo, type Onde, type Publico, type WorkStyle } from "./anamnese-types";
import { getSystem } from "./systems";
import type { Equipment, Goal, Level, Program, SystemId } from "./types";

export interface Padroes {
  modoPadrao: "agora" | "whatsapp";
  equipment: Equipment;
  /** academia → academia; home → casa; peso_corporal → casa + ["nada"]. */
  onde: Onde;
  equipamentos?: Equipamento[];
  goal?: Goal;
  /** Opção pré-marcada na pergunta "objetivo" do modo junto (o `goal` sozinho não separa "Saúde" de "Treinar sem dor"). */
  objetivo?: Objetivo;
  level?: Level;
  dias?: number;
  minutos?: number;
  semanas?: number;
  modulos: Modulo[];
  conferir: "aula" | "conversa" | "ambos";
  avaliacao: "presencial" | "pedir_medidas";
  letraMaior: boolean;
  checkin: boolean;
  passoDieta: "dieta" | "nutricionista";
  avisoCref: boolean;
  diasComPersonal: boolean;
}

/** Linhas da tabela da pergunta 1 (spec §3.3). "Módulos ligados" só vale na Entrega 2 (partes extras). */
const ATENDIMENTO: Record<Atendimento | "nenhum", { modo: "agora" | "whatsapp" | "telefone"; equipment: Equipment; modulos: Modulo[]; conferir: Padroes["conferir"]; avaliacao: Padroes["avaliacao"] }> = {
  academia: { modo: "agora", equipment: "academia", modulos: ["rotina"], conferir: "aula", avaliacao: "presencial" },
  casa: { modo: "agora", equipment: "home", modulos: ["rotina"], conferir: "aula", avaliacao: "presencial" },
  online: { modo: "whatsapp", equipment: "academia", modulos: ["rotina", "objetivo"], conferir: "conversa", avaliacao: "pedir_medidas" },
  misto: { modo: "whatsapp", equipment: "academia", modulos: ["rotina", "objetivo"], conferir: "ambos", avaliacao: "presencial" },
  turmas: { modo: "whatsapp", equipment: "academia", modulos: ["esporte"], conferir: "conversa", avaliacao: "pedir_medidas" },
  // Sem resposta: os padrões de hoje (WhatsApp só se o telefone foi digitado).
  nenhum: { modo: "telefone", equipment: "academia", modulos: ["rotina"], conferir: "aula", avaliacao: "presencial" },
};

/** Linhas da tabela da pergunta 2 (as regras somam; o objetivo vem da primeira marcada que tem um). */
const PUBLICO: Record<Publico, { goal?: Goal; objetivo?: Objetivo; modulos: Modulo[] }> = {
  emagrecimento: { goal: "emagrecimento", objetivo: "gordura", modulos: ["habitos"] },
  hipertrofia: { goal: "hipertrofia", objetivo: "massa", modulos: [] },
  saude60: { goal: "saude", objetivo: "saude", modulos: ["rotina", "dorMais"] },
  // Nenhuma mudança na triagem: gestação e pós-parto aparecem pela idade e pelo sexo do aluno, nunca pelo público.
  mulheres: { modulos: ["habitos"] },
  dor: { goal: "saude", objetivo: "semDor", modulos: ["dorMais"] },
  esporte: { goal: "condicionamento", objetivo: "esporte", modulos: ["esporte"] },
};

/** Pré-marcação da pergunta "onde" do modo junto a partir do `equipment`. */
export function ondeDoEquipment(equipment: Equipment): { onde: Onde; equipamentos?: Equipamento[] } {
  if (equipment === "home") return { onde: "casa" };
  if (equipment === "peso_corporal") return { onde: "casa", equipamentos: ["nada"] };
  return { onde: "academia" };
}

export function resolveDefaults(ws: WorkStyle | undefined, ctx?: { hasPhone?: boolean; hasCref?: boolean }): Padroes {
  const at = ws?.atendimento && ATENDIMENTO[ws.atendimento] ? ws.atendimento : undefined;
  const linha = ATENDIMENTO[at ?? "nenhum"];
  const publicos = (ws?.publico ?? []).filter((p) => PUBLICO[p]);
  const comObjetivo = publicos.map((p) => PUBLICO[p]).find((p) => p.goal);
  const derivados = new Set<Modulo>([...linha.modulos, ...publicos.flatMap((p) => PUBLICO[p].modulos)]);
  const modulos = ws?.modulos ? MODULOS.filter((m) => ws.modulos!.includes(m)) : MODULOS.filter((m) => derivados.has(m));
  const online = at === "online" || at === "misto";
  return {
    modoPadrao: linha.modo === "telefone" ? (ctx?.hasPhone ? "whatsapp" : "agora") : linha.modo,
    equipment: linha.equipment,
    ...ondeDoEquipment(linha.equipment),
    ...(comObjetivo ? { goal: comObjetivo.goal, objetivo: comObjetivo.objetivo } : {}),
    ...(ws?.dias ? { dias: ws.dias } : {}),
    ...(ws?.minutos ? { minutos: ws.minutos } : {}),
    ...(ws?.semanas ? { semanas: ws.semanas } : {}),
    modulos,
    conferir: linha.conferir,
    avaliacao: linha.avaliacao,
    letraMaior: ws?.letraMaior ?? publicos.includes("saude60"),
    checkin: online,
    passoDieta: ws?.alimentacao === "encaminho" || ws?.alimentacao === "parceiro" ? "nutricionista" : "dieta",
    avisoCref: online && !ctx?.hasCref,
    diasComPersonal: at === "misto",
  };
}

export interface Sugestao {
  campo: "divisao" | "semanas";
  valor: SystemId | number;
  n: number;
  de: number;
  chave: string;
}

/** [E2] Padrão aprendido: só fichas sem `sugerido` ou com escolha diferente da sugerida. Não implementar na Entrega 1. */
export function learnedSuggestion(programs: Pick<Program, "system" | "durationWeeks" | "createdAt" | "sugerido">[], ws: WorkStyle | undefined): Sugestao[] {
  void programs;
  void ws;
  return [];
}

/** [E2] Não implementar na Entrega 1. */
export function aceitarSugestao(ws: WorkStyle | undefined, s: Sugestao): WorkStyle {
  void s;
  return ws ?? {};
}

/** [E2] Não implementar na Entrega 1. */
export function dispensarSugestao(ws: WorkStyle | undefined, s: Sugestao): WorkStyle {
  void s;
  return ws ?? {};
}

// ───────────────────────── Telas (spec §3.1 e §3.2): textos literais e regras puras ─────────────────────────

/** As 5 perguntas, texto final (spec §3.2). */
export const PERGUNTAS_JEITO = {
  atendimento: "Onde você atende a maioria dos alunos?",
  publico: "Quem você mais atende?",
  diasMinutos: "Na maioria dos alunos, quantos dias e quanto tempo?",
  semanas: "De quanto em quanto tempo você troca a ficha ou reavalia?",
  alimentacao: "E a alimentação dos seus alunos?",
} as const;
export const ATENDIMENTO_ROTULO: Record<Atendimento, string> = {
  academia: "Academia ou estúdio",
  casa: "Casa do aluno, condomínio ou ao ar livre",
  online: "Online",
  misto: "Presencial e online",
  turmas: "Turmas ou assessoria de corrida",
};
export const PUBLICO_ROTULO: Record<Publico, string> = {
  emagrecimento: "Emagrecimento",
  hipertrofia: "Hipertrofia e força",
  saude60: "Saúde e 60+",
  mulheres: "Mulheres, gestantes e pós-parto",
  dor: "Dor ou volta de lesão",
  esporte: "Corrida e esporte",
};
export const ALIMENTACAO_ROTULO: Record<Alimentacao, string> = {
  encaminho: "Encaminho para nutricionista",
  parceiro: "Trabalho com nutricionista parceiro(a)",
  orientacoes: "Dou orientações gerais, sem plano alimentar",
};
export const DIAS_JEITO = [2, 3, 4, 5] as const;
export const MINUTOS_JEITO = [30, 45, 60, 75] as const;
export const SEMANAS_JEITO = [4, 6, 8, 12] as const;
/** "Quem você mais atende?": até duas. */
export const PUBLICO_MAX = 2;
/** Dica fixa embaixo da pergunta 5. Não existe a opção "monto dieta" (CFN). */
export const DICA_ALIMENTACAO = "Plano alimentar para quem tem condição de saúde é atividade do nutricionista (Lei 8.234/1991). O app avisa quando a resposta do aluno pede isso.";
/** Conta, sem CREF e com atendimento online ou misto (CONFEF 542/2024). */
export const AVISO_CREF = "No atendimento online, a CONFEF 542/2024 pede que você informe seu CREF ao aluno.";
export const JEITO_TITULO = "Como você trabalha?";
export const JEITO_SUB = "5 toques para o app já vir do seu jeito: cadastro, questionário e ficha. Dá para mudar depois em Conta.";

/** Marca ou desmarca um público. Com duas marcadas, uma terceira não entra (a pessoa desmarca uma para trocar). */
export function alternarPublico(atual: readonly Publico[] | undefined, p: Publico): Publico[] {
  const lista = (atual ?? []).filter((x, i, all) => all.indexOf(x) === i);
  if (lista.includes(p)) return lista.filter((x) => x !== p);
  return lista.length >= PUBLICO_MAX ? lista : [...lista, p];
}

/** "Salvar": grava o que foi respondido com `definidoEm` (e tira o `puladoEm` de antes). */
export function comDefinido(ws: WorkStyle | undefined, agora: string): WorkStyle {
  const { puladoEm: _p, ...resto } = ws ?? {};
  void _p;
  return { ...resto, definidoEm: agora };
}

/** "Pular, decido depois": não grava as respostas em andamento; mantém o que já estava definido. */
export function comPulado(anterior: WorkStyle | undefined, agora: string): WorkStyle {
  return { ...(anterior ?? {}), puladoEm: agora };
}

const MODO_TEXTO: Record<Padroes["modoPadrao"], string> = { agora: "“Preencher agora”", whatsapp: "“Mandar pelo WhatsApp”" };
const OBJETIVO_TEXTO: Partial<Record<Objetivo, string>> = { massa: "Ganhar massa muscular", gordura: "Perder gordura", saude: "Saúde e qualidade de vida", semDor: "Treinar sem dor", esporte: "Melhorar num esporte" };
const LOCAL_TEXTO: Record<Equipment, string> = { academia: "academia", home: "em casa", peso_corporal: "sem equipamento" };

/**
 * `<details>` "O que isso muda" em Conta: os padrões em vigor, só os que já agem na Entrega 1 (módulos, letra maior,
 * check-in e o bloco "Na primeira aula" são da Entrega 2 e não aparecem). Termina com o que nunca muda.
 */
export function oQueMuda(ws: WorkStyle | undefined): string[] {
  const p = resolveDefaults(ws);
  const linhas: string[] = [];
  linhas.push(
    ws?.atendimento
      ? `“Adicionar aluno” já vem em ${MODO_TEXTO[p.modoPadrao]}.`
      : "“Adicionar aluno” vem em “Mandar pelo WhatsApp” quando você digita o telefone do aluno; sem telefone, em “Preencher agora”.",
  );
  const junto = [p.objetivo && OBJETIVO_TEXTO[p.objetivo], p.dias && p.minutos ? `${p.dias} dias de ${p.minutos} min` : p.dias ? `${p.dias} dias` : p.minutos ? `${p.minutos} min` : null].filter(Boolean);
  if (junto.length) linhas.push(`No questionário feito junto com o aluno, já vem marcado: ${junto.join("; ")}. Você confirma com ele.`);
  if (ws?.atendimento) linhas.push(`Ficha gerada: local ${LOCAL_TEXTO[p.equipment]} quando o cadastro do aluno não diz.`);
  if (p.dias || p.minutos) linhas.push(`Ficha gerada: ${[p.dias && `${p.dias} dias`, p.minutos && `${p.minutos} min`].filter(Boolean).join(" de ")} quando o cadastro do aluno não diz.`);
  linhas.push(ws?.divisao && ws.divisao !== "livre" ? `Ficha gerada: divisão ${getSystem(ws.divisao).short} quando cabe nos dias do aluno; senão, a sugerida pelo app.` : "Ficha gerada: divisão sugerida pelo app para os dias do aluno.");
  if (p.semanas) linhas.push(`Ficha gerada: validade de ${p.semanas} semanas.`);
  linhas.push(p.avaliacao === "pedir_medidas" ? "Passo de avaliação: “Pedir peso e medidas” ao aluno." : "Passo de avaliação: “Fazer a avaliação presencial”.");
  linhas.push(
    p.passoDieta === "nutricionista"
      ? "O passo “Definir metas e orientações de dieta” não aparece. A aba Dieta continua."
      : "O passo “Definir metas e orientações de dieta” aparece para o aluno que ainda não tem dieta.",
  );
  linhas.push("Nunca muda: as perguntas de saúde, os sinais de alerta, as travas e o aviso de nutricionista quando a resposta do aluno pede.");
  return linhas;
}
