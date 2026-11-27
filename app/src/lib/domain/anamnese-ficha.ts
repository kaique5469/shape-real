/**
 * Das respostas para o cadastro e a ficha (spec §8): nível, limitações canônicas, mescla por campo e entrada do
 * gerador. Puro. Respostas de um perfil só por `readAnamnese`.
 *
 * Texto livre do aluno (outro lugar, lesão antiga, "outro" exercício) nunca entra no texto de limitações: só nas linhas
 * "Não adaptado pelo gerador", que ficam no aparelho do personal.
 */
import type {
  AlertId,
  Alerta,
  AnamneseAnswers,
  Anamnese,
  CampoMescla,
  CtxTriagem,
  Diferenca,
  DiffLimitacoes,
  EscolhaMescla,
  Escolhas,
  Experiencia,
  FichaSugerida,
  Foco,
  MotivoFicha,
  NaoQuer,
  Objetivo,
  Onde,
  Origem,
  Parado,
  Regiao,
  Liberacao,
  WorkStyle,
} from "./anamnese-types";
import { curtoDe } from "./anamnese";
import { GROUP_LABEL, normalize } from "./exercises";
import { firstName } from "./format";
import { GOAL_LABEL, LEVEL_LABEL, analyzeLimitations, type GenerateInput } from "./generator";
import { readAnamnese } from "./questionario-link";
import { PROBLEMA_RESUMO } from "./resumo";
import { getSystem, suggestSystem } from "./systems";
import { consentConfirmed } from "./transfer";
import { alertas, motivoTetoModerado, travaEPorta } from "./triagem";
import { resolveDefaults } from "./work-style";
import type { ActivityLevel, Equipment, Goal, Level, MuscleGroup, Profile, Sex, SystemId } from "./types";

// ───────────────────────── Mapas (spec §4.8 e §8.1) ─────────────────────────

/** Ids de exercises.ts evitados por cada "não quero fazer" (todos conferidos em EXERCISES; há teste). */
export const NAO_QUER_IDS: Record<NaoQuer, readonly string[]> = {
  agachamento: ["agachamento_livre", "agachamento_frontal"],
  afundo: ["afundo", "passada", "afundo_smith", "agachamento_bulgaro"],
  saltos: ["agachamento_salto", "burpee", "pular_corda", "polichinelo"],
  correr: ["esteira_corrida", "corrida_rua", "hiit_esteira"],
  barra: ["barra_fixa", "barra_fixa_supinada", "barra_fixa_assistida"],
  terra: ["levantamento_terra", "levantamento_terra_sumo"],
  abdominal: ["abdominal_supra", "abdominal_infra", "abdominal_bicicleta", "abdominal_canivete", "abdominal_remador", "abdominal_obliquo"],
  flexao: ["flexao", "flexao_joelhos", "flexao_inclinada", "flexao_diamante", "flexao_pike"],
  escada: ["escada_simulador"],
};
/** Foco do aluno → grupo do motor (HIPÓTESE de mapa; o personal troca no gerador). */
export const FOCO_GRUPO: Record<Foco, MuscleGroup> = { gluteos: "gluteos", pernas: "quadriceps", abdomen: "abdomen", bracos: "biceps", costas: "costas", peito: "peito", ombros: "ombros" };

const GOAL_DE: Record<Objetivo, Goal> = { massa: "hipertrofia", forca: "forca", gordura: "emagrecimento", folego: "condicionamento", esporte: "condicionamento", saude: "saude", semDor: "saude" };
/** Trabalho (parte Rotina) → atividade; turnos e "não trabalho" não gravam (HIPÓTESE de mapa). */
const ACTIVITY_DE: Partial<Record<NonNullable<AnamneseAnswers["trabalho"]>, ActivityLevel>> = { sentado: "sedentario", pe: "leve", andando: "moderado" };

// Rótulos das opções (texto do questionário, spec §4.4–§4.8), para "Veio de" e para os motivos.
const OBJETIVO_ROTULO: Record<Objetivo, string> = {
  massa: "Ganhar massa muscular",
  forca: "Ficar mais forte",
  gordura: "Perder gordura",
  folego: "Ter mais fôlego e disposição",
  saude: "Saúde e qualidade de vida",
  semDor: "Treinar sem dor",
  esporte: "Melhorar num esporte",
};
const EXPERIENCIA_ROTULO: Record<Experiencia, string> = { nunca: "Nunca treinei", m3: "Menos de 3 meses", m12: "De 3 a 12 meses", a3: "De 1 a 3 anos", mais3: "Mais de 3 anos" };
const PARADO_ROTULO: Record<Parado, string> = { m1: "Menos de 1 mês", m3: "De 1 a 3 meses", m12: "De 3 a 12 meses", mais12: "Mais de 1 ano" };
const ONDE_ROTULO: Record<Onde, string> = { academia: "Academia completa", condominio: "Academia pequena ou de prédio", casa: "Em casa", livre: "Ao ar livre" };
const EQUIPAMENTO_ROTULO: Record<string, string> = { nada: "nada, só o corpo", halteres: "halteres", elasticos: "elásticos", kettlebell: "kettlebell", banco: "banco", barraFixa: "barra fixa", barraAnilhas: "barra e anilhas" };
const FOCO_ROTULO: Record<Foco, string> = { gluteos: "Glúteos", pernas: "Pernas", abdomen: "Abdômen", bracos: "Braços", costas: "Costas", peito: "Peito", ombros: "Ombros" };
const NAO_QUER_ROTULO: Record<NaoQuer, string> = {
  agachamento: "agachamento livre com barra",
  afundo: "afundo e passada",
  saltos: "saltos e burpee",
  correr: "correr (esteira ou rua)",
  barra: "barra fixa",
  terra: "levantamento terra",
  abdominal: "abdominal no chão",
  flexao: "flexão de braço",
  escada: "escada",
};
/** Versão curta para o `resumoCurto` ("ABC · 4×60 min · sem afundo"). */
const NAO_QUER_CURTO: Record<NaoQuer, string> = {
  agachamento: "agachamento livre",
  afundo: "afundo",
  saltos: "saltos",
  correr: "corrida",
  barra: "barra fixa",
  terra: "terra",
  abdominal: "abdominal no chão",
  flexao: "flexão",
  escada: "escada",
};
const REGIAO_ROTULO: Record<Regiao, string> = {
  pescoco: "Pescoço",
  ombro: "Ombro",
  cotovelo: "Cotovelo",
  punho: "Punho ou mão",
  costasAlta: "Parte de cima ou meio das costas",
  lombar: "Lombar",
  quadril: "Quadril ou virilha",
  joelho: "Joelho",
  tornozelo: "Tornozelo ou pé",
  outro: "Outro lugar",
};
const LADO_ROTULO = { d: "direito", e: "esquerdo", ambos: "os dois lados" } as const;
const EQUIPMENT_ROTULO: Record<Equipment, string> = { academia: "Academia", home: "Em casa", peso_corporal: "Sem equipamento" };

/** "Veio de: {pergunta curta} → {resposta}": a mesma pergunta curta do catálogo (`curtoDe`), como no "Por quê" da triagem. */
const CURTO_IDS = ["objetivo", "experiencia", "parado", "dias", "minutos", "onde", "equipamentos", "foco", "naoQuer", "dorOnde", "condicoes", "pressaoControle", "regular", "gestacao", "assoalho", "quedas", "ano"] as const;
const CURTO = Object.fromEntries(CURTO_IDS.map((id) => [id, curtoDe(id)])) as Record<(typeof CURTO_IDS)[number], string>;
const CADASTRO = "Seu cadastro";
const JEITO = "Seu jeito de trabalhar";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const listaE = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Idade = ano atual − ano de nascimento (spec §4.4; mesma conta de `idadeDe` do catálogo). */
function idade(a: AnamneseAnswers, hoje: Date): number | null {
  return typeof a.ano === "number" ? hoje.getFullYear() - a.ano : null;
}
/** "Ativo" do ACSM: exercício planejado há mais de 3 meses (spec §6.3). */
const ativo = (a: AnamneseAnswers) => a.regular === "sim3m";
const condicoesDe = (a: AnamneseAnswers) => (Array.isArray(a.condicoes) ? a.condicoes : []);

// ───────────────────────── Nível (spec §8.1) ─────────────────────────

/** Nunca sugere "avançado". Parado de 3 meses ou mais volta a iniciante; de 1 a 3 meses mantém a base e marca a pausa. */
export function suggestLevel(a: AnamneseAnswers): { level: Level; nota?: string; voltandoDePausa: boolean } {
  const e = a.experiencia;
  if (a.parado === "m12" || a.parado === "mais12") return { level: "iniciante", voltandoDePausa: false };
  const voltandoDePausa = a.parado === "m3";
  if (e === "m12" || e === "a3") return { level: "intermediario", voltandoDePausa };
  if (e === "mais3") return { level: "intermediario", nota: "Pode ser avançado: confirme na primeira aula", voltandoDePausa };
  return { level: "iniciante", voltandoDePausa: voltandoDePausa && e === "m3" };
}

// ───────────────────────── Limitações canônicas (spec §8.3) ─────────────────────────

const COM_LADO_PLURAL: Partial<Record<Regiao, string>> = { ombro: "ombros", cotovelo: "cotovelos", punho: "punhos", joelho: "joelhos", tornozelo: "tornozelos" };
const REGIAO_TOKEN: Partial<Record<Regiao, string>> = { pescoco: "cervical", ombro: "ombro", cotovelo: "cotovelo", punho: "punho", lombar: "lombar", quadril: "quadril", joelho: "joelho", tornozelo: "tornozelo" };
/** Regiões em que a dor faz a artrose valer como limitação da ficha inteira. */
const ARTROSE_REGIOES: Regiao[] = ["joelho", "quadril", "lombar", "costasAlta", "pescoco"];

function tokenDaRegiao(r: Regiao, l?: "d" | "e" | "ambos"): string | null {
  const base = REGIAO_TOKEN[r];
  if (!base) return null;
  if (r === "pescoco" || r === "lombar" || !l) return base;
  if (l === "d") return `${base} direito`;
  if (l === "e") return `${base} esquerdo`;
  // "quadris" não casa a regra do quadril no motor (generator.ts: /quadril|…/): os dois lados por extenso.
  return r === "quadril" ? "quadril direito e esquerdo" : COM_LADO_PLURAL[r]!;
}

const PRESSAO_ROTULO: Record<NonNullable<AnamneseAnswers["pressaoControle"]>, string> = {
  controlada: "Controlada, abaixo de 14 por 9",
  asVezes: "Às vezes alta",
  alta: "Costuma passar de 16 por 9",
  naoSei: "Não sei",
};

interface TokenComOrigem {
  token: string;
  origem: Origem[];
}

function tokensComOrigem(a: AnamneseAnswers, hoje: Date): { tokens: TokenComOrigem[]; naoAdaptado: string[] } {
  const out: TokenComOrigem[] = [];
  const naoAdaptado: string[] = [];
  const add = (token: string, origem: Origem[]) => {
    if (!out.some((t) => t.token === token)) out.push({ token, origem });
  };
  const comDor = a.dor === 1 ? (a.dorOnde ?? []) : [];
  for (const d of comDor) {
    const lado = d.l ? `, ${LADO_ROTULO[d.l]}` : "";
    const origem = [{ pergunta: CURTO.dorOnde, resposta: `${REGIAO_ROTULO[d.r]}${lado}` }];
    if (d.r === "costasAlta") {
      naoAdaptado.push("Não adaptado pelo gerador: parte de cima ou meio das costas. Revise os exercícios à mão.");
      continue;
    }
    if (d.r === "outro") {
      const t = d.t?.trim();
      naoAdaptado.push(t ? `Não adaptado pelo gerador: “${t}”. Ajuste à mão.` : "Não adaptado pelo gerador: dor em outro lugar. Ajuste à mão.");
      continue;
    }
    const token = tokenDaRegiao(d.r, d.l);
    if (token) add(token, origem);
  }
  if (a.lesao === 1) {
    const t = a.lesaoQual?.trim();
    naoAdaptado.push(t ? `Lesão antiga: “${t}”. Se ainda limita, descreva em Limitações.` : "Lesão antiga, sem descrição. Se ainda limita, descreva em Limitações.");
  }

  const cond = condicoesDe(a);
  const condOrigem = (rotulo: string): Origem[] => [{ pergunta: CURTO.condicoes, resposta: rotulo }];
  if (cond.includes("artrose") && comDor.some((d) => ARTROSE_REGIOES.includes(d.r))) add("artrose", condOrigem("Artrose ou artrite"));
  if (cond.includes("osteoporose")) add("osteoporose", condOrigem("Osteoporose"));
  // Pressão: só quando o caso pede (sem controle conhecido ou sem treino regular). Sem resposta sobre o controle = "não sei".
  if (cond.includes("pressao") && (a.pressaoControle !== "controlada" || !ativo(a))) {
    add("pressão alta", [...condOrigem("Pressão alta"), ...(a.pressaoControle && a.pressaoControle !== "controlada" ? [{ pergunta: CURTO.pressaoControle, resposta: PRESSAO_ROTULO[a.pressaoControle] }] : [])]);
  }
  if (cond.includes("coracao")) add("cardiopatia", condOrigem("Doença do coração"));
  if (a.gestacao === "gravida") add("gestante", [{ pergunta: CURTO.gestacao, resposta: "Estou grávida" }]);
  // Pós-parto: menos de 3 meses, ou sinal de assoalho pélvico até 12 meses. Na gestante, nunca.
  if (a.gestacao === "pp3" || (a.gestacao === "pp12" && a.assoalho === 1)) {
    add("pós-parto", [
      { pergunta: CURTO.gestacao, resposta: a.gestacao === "pp3" ? "Tive bebê há menos de 3 meses" : "Tive bebê entre 3 e 12 meses" },
      ...(a.assoalho === 1 ? [{ pergunta: CURTO.assoalho, resposta: "Sim" }] : []),
    ]);
  }
  // Idoso: 65 anos ou mais sem treino regular, ou A-QUEDA (que vale também com idade desconhecida e cujo efeito é este token).
  const anos = idade(a, hoje);
  const queda = (a.quedas === 1 || a.instavel === 1 || a.medoCair === 1) && (anos === null || anos >= 65);
  if (queda || (anos !== null && anos >= 65 && !ativo(a))) {
    add("idoso", [
      ...(anos !== null ? [{ pergunta: CURTO.ano, resposta: String(a.ano) }] : []),
      queda ? { pergunta: CURTO.quedas, resposta: "Sim" } : { pergunta: CURTO.regular, resposta: "Sem treino regular" },
    ]);
  }
  return { tokens: out, naoAdaptado };
}

/** Texto canônico (tokens que `analyzeLimitations` reconhece, unidos por "; ") e o que o gerador não adapta. */
export function limitationText(a: AnamneseAnswers, hoje: Date): { texto: string; tokens: string[]; naoAdaptado: string[] } {
  const { tokens, naoAdaptado } = tokensComOrigem(a, hoje);
  const list = tokens.map((t) => t.token);
  return { texto: list.join("; "), tokens: list, naoAdaptado };
}

export function avoidIdsFrom(a: AnamneseAnswers): string[] {
  return uniq((a.naoQuer ?? []).flatMap((n) => NAO_QUER_IDS[n] ?? []));
}

export function emphasisFrom(a: AnamneseAnswers): MuscleGroup[] {
  return uniq((a.foco ?? []).map((f) => FOCO_GRUPO[f]).filter(Boolean)).slice(0, 3);
}

// ───────────────────────── Cadastro (spec §8.1) ─────────────────────────

function equipmentDe(a: AnamneseAnswers): Equipment | undefined {
  if (!a.onde) return undefined;
  if (a.onde === "academia") return "academia";
  if (a.onde === "condominio") return "home";
  return a.equipamentos?.includes("nada") ? "peso_corporal" : "home";
}

/** O que as respostas gravam no cadastro. Com `healthOmitted`, nada de saúde (peso, altura, limitações). */
export function toProfilePatch(an: Anamnese, hoje: Date): Partial<Profile> {
  const a = an.a;
  const p: Partial<Profile> = {};
  const nome = a.nome?.trim().replace(/\s+/g, " ");
  if (nome) p.name = nome;
  if (typeof a.ano === "number") p.birthYear = a.ano;
  if (a.sexo === "F" || a.sexo === "M") p.sex = a.sexo;
  if (!an.healthOmitted) {
    if (typeof a.altura === "number") p.heightCm = a.altura;
    if (typeof a.peso === "number") p.weightKg = a.peso;
  }
  if (a.objetivo) p.goal = GOAL_DE[a.objetivo];
  if (a.experiencia) p.level = suggestLevel(a).level;
  if (typeof a.dias === "number") p.daysPerWeek = a.dias;
  if (typeof a.minutos === "number") p.sessionMinutes = a.minutos;
  const eq = equipmentDe(a);
  if (eq) p.equipment = eq;
  const act = a.trabalho ? ACTIVITY_DE[a.trabalho] : undefined;
  if (act) p.activity = act;
  if (!an.healthOmitted) {
    const { texto, tokens } = limitationText(a, hoje);
    if (texto) {
      p.limitations = texto;
      p.limitacoesDoQuestionario = tokens;
    }
  }
  if (Array.isArray(a.foco)) p.emphasis = emphasisFrom(a);
  return p;
}

// ───────────────────────── Mescla (spec §8.2) ─────────────────────────

const CAMPOS: readonly CampoMescla[] = ["name", "birthYear", "sex", "heightCm", "weightKg", "goal", "level", "daysPerWeek", "sessionMinutes", "equipment", "activity", "emphasis"];
const ROTULO_CAMPO: Record<CampoMescla, string> = {
  name: "Nome",
  birthYear: "Ano de nascimento",
  sex: "Sexo",
  heightCm: "Altura",
  weightKg: "Peso",
  goal: "Objetivo",
  level: "Nível",
  daysPerWeek: "Dias por semana",
  sessionMinutes: "Tempo por treino",
  equipment: "Local de treino",
  activity: "Atividade no dia a dia",
  emphasis: "Foco",
};
/** Dado da própria pessoa: a resposta vence por padrão. */
const PADRAO_RESPOSTA: ReadonlySet<CampoMescla> = new Set(["sex", "birthYear"]);
const padraoDe = (c: CampoMescla): EscolhaMescla => (PADRAO_RESPOSTA.has(c) ? "resposta" : "cadastro");

const SEXO_ROTULO: Record<Sex, string> = { F: "Feminino", M: "Masculino" };
/** Primeira palavra de ACTIVITY_LABEL (nutrition.ts), sem puxar a tabela de alimentos para a tela do gerador. */
const ATIVIDADE_ROTULO: Record<ActivityLevel, string> = { sedentario: "Sedentário", leve: "Leve", moderado: "Moderado", alto: "Alto", atleta: "Atleta" };
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function valorLegivel(campo: CampoMescla, v: unknown): string {
  switch (campo) {
    case "goal":
      return GOAL_LABEL[v as Goal] ?? String(v);
    case "level":
      return LEVEL_LABEL[v as Level] ?? String(v);
    case "daysPerWeek":
      return plural(v as number, "dia", "dias");
    case "sessionMinutes":
      return `${v} min`;
    case "equipment":
      return EQUIPMENT_ROTULO[v as Equipment] ?? String(v);
    case "activity":
      return ATIVIDADE_ROTULO[v as ActivityLevel] ?? String(v);
    case "weightKg":
      return `${num(v as number)} kg`;
    case "heightCm":
      return `${num(v as number)} cm`;
    case "sex":
      return SEXO_ROTULO[v as Sex] ?? String(v);
    case "emphasis": {
      const g = v as MuscleGroup[];
      return g.length ? g.map((x) => GROUP_LABEL[x] ?? x).join(", ") : "Nenhuma em especial";
    }
    default:
      return String(v);
  }
}

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
function igual(campo: CampoMescla, x: unknown, y: unknown): boolean {
  if (campo === "emphasis") {
    const a = new Set(x as MuscleGroup[]);
    const b = new Set(y as MuscleGroup[]);
    return a.size === b.size && [...a].every((g) => b.has(g));
  }
  if (campo === "name") return String(x).trim().replace(/\s+/g, " ") === String(y).trim().replace(/\s+/g, " ");
  return x === y;
}

/** Campos em que cadastro e resposta divergem (vazio no cadastro não conta: é preenchido sem perguntar). */
export function conflicts(profile: Profile, an: Anamnese, hoje: Date): Diferenca[] {
  const patch = toProfilePatch(an, hoje);
  const out: Diferenca[] = [];
  for (const campo of CAMPOS) {
    const resposta = patch[campo];
    const cadastro = profile[campo];
    if (resposta === undefined || vazio(cadastro) || igual(campo, cadastro, resposta)) continue;
    out.push({ campo, rotulo: ROTULO_CAMPO[campo], cadastro: valorLegivel(campo, cadastro), resposta: valorLegivel(campo, resposta), padrao: padraoDe(campo) });
  }
  return out;
}

/** Comparação de trechos: sem acento, sem caixa, espaços normalizados e sem pontuação no fim. */
const trecho = (s: string) => normalize(s).replace(/\s+/g, " ").replace(/[.,;:!]+$/, "").trim();

/**
 * Tira do texto os tokens que o app pôs e não vieram mais, junta os novos sem repetir trecho igual e devolve quais
 * tokens ficaram por conta do app. O texto do personal nunca é alterado (os trechos dele ficam como estão).
 */
export function mergeLimitations(atual: string | undefined, antigosDoApp: string[], novos: string[]): { texto: string; doApp: string[] } {
  const segs = atual?.trim() ? atual.split(";") : [];
  const novosN = new Set(novos.map(trecho));
  for (const t of antigosDoApp) {
    if (novosN.has(trecho(t))) continue;
    // O app acrescenta no fim: a última ocorrência é a dele.
    let i = -1;
    segs.forEach((s, k) => {
      if (trecho(s) === trecho(t)) i = k;
    });
    if (i >= 0) segs.splice(i, 1);
  }
  const presentes = () => new Set(segs.map(trecho));
  const doApp = uniq(antigosDoApp.filter((t) => novosN.has(trecho(t)) && presentes().has(trecho(t))));
  for (const t of novos) {
    if (!trecho(t) || presentes().has(trecho(t))) continue;
    while (segs.length && !segs[segs.length - 1]!.trim()) segs.pop();
    segs.push(segs.length ? ` ${t}` : t);
    doApp.push(t);
  }
  return { texto: segs.join(";").trim(), doApp };
}

/** Teto do campo de limitações no link da ficha (transfer.ts: `limitations: opt(text(1000))`). */
export const LIMITACOES_MAX = 1000;

export function diffLimitacoes(profile: Profile, an: Anamnese, hoje: Date): DiffLimitacoes {
  const antes = profile.limitations ?? "";
  const antigos = profile.limitacoesDoQuestionario ?? [];
  if (an.healthOmitted) return { sai: [], entra: [], texto: antes, doApp: antigos, excede: false };
  const novos = limitationText(an.a, hoje).tokens;
  const { texto, doApp } = mergeLimitations(profile.limitations, antigos, novos);
  const original = new Set((antes.trim() ? antes.split(";") : []).map(trecho));
  const novosN = new Set(novos.map(trecho));
  return {
    sai: antigos.filter((t) => !novosN.has(trecho(t)) && original.has(trecho(t))),
    entra: doApp.filter((t) => !original.has(trecho(t))),
    texto,
    doApp,
    excede: texto.length > LIMITACOES_MAX,
  };
}

/**
 * A linha das limitações entra em "Conferir antes de salvar"? Só quando há o que decidir (spec §8.2 e §5.1): um token
 * do app que sai, o texto que passaria do teto, ou um token que entra num cadastro que já tem limitações. Entrar num
 * campo vazio é preencher sem perguntar (o cadastro rápido não pode gerar "diferenças falsas").
 */
export function limitacoesPedemConferencia(profile: Pick<Profile, "limitations">, lim: DiffLimitacoes): boolean {
  return lim.sai.length > 0 || (lim.entra.length > 0 && (lim.excede || Boolean(profile.limitations?.trim())));
}

/**
 * Registra uma rodada de respostas no cadastro do aluno, imutável. Campos: vazio preenche; diferente segue a escolha
 * (ou o padrão da linha). Limitações pela mescla de tokens ("Manter como está" só vale com limitações no cadastro:
 * campo vazio é preenchido sem perguntar). `coachNotes` e o texto do personal nunca mudam.
 */
export function applyAnamnese(profile: Profile, an: Anamnese, escolhas: Escolhas, agora: string): Profile {
  const hoje = new Date(agora);
  const patch = toProfilePatch(an, hoje);
  const next: Profile = { ...profile };
  const set = next as unknown as Record<CampoMescla, unknown>;
  for (const campo of CAMPOS) {
    const resposta = patch[campo];
    if (resposta === undefined) continue;
    const cadastro = profile[campo];
    if (vazio(cadastro)) set[campo] = resposta;
    else if (!igual(campo, cadastro, resposta) && (escolhas[campo] ?? padraoDe(campo)) === "resposta") set[campo] = resposta;
  }

  if (!an.healthOmitted && (escolhas.limitacoes !== "manter" || !profile.limitations?.trim())) {
    const d = diffLimitacoes(profile, an, hoje);
    if (!d.excede) {
      next.limitations = d.texto || undefined;
      next.limitacoesDoQuestionario = d.doApp.length ? d.doApp : undefined;
    }
  }

  if (!an.healthOmitted && an.consent && !consentConfirmed(profile)) {
    next.consentHealthAt = an.consent.at;
    next.consentSource = an.consent.source;
  }

  // Rodada: id novo empurra a atual para anamnesePrev; mesmo id substitui (e mantém o que o personal registrou nela).
  let stored: Anamnese = an.via === "link" ? { ...an, receivedAt: agora } : { ...an };
  const atual = readAnamnese(profile);
  if (atual && typeof atual === "object") {
    if (atual.id !== an.id) next.anamnesePrev = profile.anamnese;
    else stored = { ...stored, overrides: stored.overrides ?? atual.overrides, conversei: stored.conversei ?? atual.conversei };
  } else if (atual === "versao_nova" || atual === "invalida") {
    // Não deu para ler a atual: guarda como anterior em vez de apagar.
    next.anamnesePrev = profile.anamnese;
  }
  next.anamnese = stored;
  if (profile.anamnesePedido?.id === an.id) next.anamnesePedido = undefined;
  return next;
}

// ───────────────────────── Gerador (spec §8.5) ─────────────────────────

/** A divisão cabe nos dias? (precisa de no máximo `dias` dias; a livre não tem mínimo). */
export function sistemaCabe(id: SystemId, dias: number): boolean {
  try {
    const s = getSystem(id);
    return s.days === 0 || s.days <= dias;
  } catch {
    return false;
  }
}
const geravel = (id: SystemId | undefined): id is SystemId => Boolean(id) && id !== "livre" && sistemaCabe(id!, 7);

const clampDias = (d: number) => Math.min(6, Math.max(2, Math.round(d)));

/** Entrada sugerida do gerador a partir do cadastro já mesclado, das respostas e do jeito de trabalhar. null sem respostas legíveis. */
export function toGenerateInput(profile: Profile, ws: WorkStyle | undefined, hoje: Date, ctx: CtxTriagem): FichaSugerida | null {
  const an = readAnamnese(profile);
  if (!an || typeof an !== "object") return null;
  const a = an.a;
  const aluno = firstName(profile.name) || "o aluno";
  const motivos: MotivoFicha[] = [];
  const avisos: string[] = [];
  const input: Partial<GenerateInput> = {};

  const goal = profile.goal;
  if (goal) {
    input.goal = goal;
    const veio = a.objetivo && GOAL_DE[a.objetivo] === goal ? [{ pergunta: CURTO.objetivo, resposta: OBJETIVO_ROTULO[a.objetivo] }] : [{ pergunta: CADASTRO, resposta: GOAL_LABEL[goal] }];
    motivos.push({ texto: `Objetivo: ${GOAL_LABEL[goal]}`, porque: veio });
  }

  const sugestao = a.experiencia ? suggestLevel(a) : null;
  const level = profile.level;
  let nivelNota: string | undefined;
  if (level) {
    input.level = level;
    if (sugestao && sugestao.level === level) {
      nivelNota = sugestao.nota;
      const porque: Origem[] = [{ pergunta: CURTO.experiencia, resposta: EXPERIENCIA_ROTULO[a.experiencia!] }];
      if (a.parado) porque.push({ pergunta: CURTO.parado, resposta: PARADO_ROTULO[a.parado] });
      motivos.push({ texto: `Nível sugerido: ${LEVEL_LABEL[level]} (confirme)`, porque });
    } else {
      motivos.push({ texto: `Nível: ${LEVEL_LABEL[level]}`, porque: [{ pergunta: CADASTRO, resposta: LEVEL_LABEL[level] }] });
    }
  }

  const diasBrutos = profile.daysPerWeek ?? ws?.dias;
  const dias = clampDias(diasBrutos ?? 3);
  if (diasBrutos !== undefined) {
    input.daysPerWeek = dias;
    if (diasBrutos !== dias && diasBrutos === a.dias) avisos.push(`${aluno} disse ${plural(diasBrutos, "dia", "dias")}; a ficha trabalha com 2 a 6.`);
  }
  const minutos = profile.sessionMinutes ?? ws?.minutos;
  if (minutos !== undefined) input.sessionMinutes = minutos;
  if (diasBrutos !== undefined || minutos !== undefined) {
    const porque: Origem[] = [];
    if (profile.daysPerWeek !== undefined && profile.daysPerWeek === a.dias) porque.push({ pergunta: CURTO.dias, resposta: String(a.dias) });
    else if (profile.daysPerWeek !== undefined) porque.push({ pergunta: CADASTRO, resposta: plural(profile.daysPerWeek, "dia", "dias") });
    else if (ws?.dias !== undefined) porque.push({ pergunta: JEITO, resposta: plural(ws.dias, "dia", "dias") });
    if (profile.sessionMinutes !== undefined && profile.sessionMinutes === a.minutos) porque.push({ pergunta: CURTO.minutos, resposta: `${a.minutos} min` });
    else if (profile.sessionMinutes !== undefined) porque.push({ pergunta: CADASTRO, resposta: `${profile.sessionMinutes} min` });
    else if (ws?.minutos !== undefined) porque.push({ pergunta: JEITO, resposta: `${ws.minutos} min` });
    const texto = minutos !== undefined ? `${dias}× por semana, ${minutos} min` : `${dias}× por semana`;
    motivos.push({ texto, porque });
  }

  const equipment = profile.equipment ?? (ws ? resolveDefaults(ws).equipment : undefined);
  if (equipment) {
    input.equipment = equipment;
    if (a.onde && equipmentDe(a) === equipment) {
      const tem = a.onde !== "academia" && a.equipamentos?.length ? a.equipamentos.map((e) => EQUIPAMENTO_ROTULO[e] ?? e) : [];
      const porque: Origem[] = [{ pergunta: CURTO.onde, resposta: ONDE_ROTULO[a.onde] }];
      if (tem.length) porque.push({ pergunta: CURTO.equipamentos, resposta: tem.join(", ") });
      motivos.push({ texto: `Local: ${ONDE_ROTULO[a.onde]}${tem.length ? `; tem: ${tem.join(", ")}` : ""}`, porque });
    } else {
      motivos.push({ texto: `Local: ${EQUIPMENT_ROTULO[equipment]}`, porque: [{ pergunta: profile.equipment ? CADASTRO : JEITO, resposta: EQUIPMENT_ROTULO[equipment] }] });
    }
  }

  const limitations = profile.limitations?.trim();
  const lim = analyzeLimitations(limitations);
  const { tokens: tokensAluno, naoAdaptado: naoAdaptadoAluno } = an.healthOmitted ? { tokens: [], naoAdaptado: [] } : tokensComOrigem(a, hoje);
  if (limitations) {
    input.limitations = limitations;
    if (lim.labels.length) {
      const doApp = new Set((profile.limitacoesDoQuestionario ?? []).map(trecho));
      const porque = tokensAluno.filter((t) => doApp.has(trecho(t.token))).flatMap((t) => t.origem);
      if (limitations.split(";").some((s) => s.trim() && !doApp.has(trecho(s)))) porque.push({ pergunta: CADASTRO, resposta: "Limitações" });
      motivos.push({ texto: `Limitações consideradas: ${lim.labels.join(", ")}`, porque });
    }
  }

  // Divisão: o padrão do personal se cabe nos dias; senão a preferida do aluno; senão a sugerida.
  const levelParaSugestao = level ?? sugestao?.level ?? "iniciante";
  const emphasis = profile.emphasis?.length ? profile.emphasis : undefined;
  const sugerida = suggestSystem(dias, levelParaSugestao, { emphasis, equipment, goal });
  const naoCabe = (id: SystemId) => `${getSystem(id).short} precisa de ${plural(getSystem(id).days, "dia", "dias")}; ${aluno} tem ${dias}: usamos ${getSystem(sugerida).short}.`;
  let system: SystemId = sugerida;
  let divisao: MotivoFicha = { texto: `Divisão: ${getSystem(sugerida).short} (sugerida para ${plural(dias, "dia", "dias")})`, porque: [{ pergunta: CURTO.dias, resposta: String(dias) }] };
  const padrao = geravel(ws?.divisao) ? ws!.divisao! : undefined;
  const preferida = geravel(profile.preferredSystem) ? profile.preferredSystem : undefined;
  if (padrao && sistemaCabe(padrao, dias)) {
    system = padrao;
    divisao = { texto: `Divisão: ${getSystem(padrao).short} (seu padrão)`, porque: [{ pergunta: JEITO, resposta: `Divisão preferida: ${getSystem(padrao).short}` }] };
  } else if (preferida && sistemaCabe(preferida, dias)) {
    if (padrao) avisos.push(naoCabe(padrao));
    system = preferida;
    divisao = { texto: `Divisão: ${getSystem(preferida).short} (do cadastro)`, porque: [{ pergunta: CADASTRO, resposta: getSystem(preferida).short }] };
  } else {
    if (padrao) avisos.push(naoCabe(padrao));
    else if (preferida) avisos.push(naoCabe(preferida));
  }
  input.system = system;
  motivos.push(divisao);

  if (emphasis) {
    input.emphasis = emphasis;
    const veioDoAluno = Array.isArray(a.foco) && a.foco.length > 0 && emphasisFrom(a).every((g) => emphasis.includes(g)) && emphasis.every((g) => emphasisFrom(a).includes(g));
    motivos.push({
      texto: `Foco: ${emphasis.map((g) => GROUP_LABEL[g] ?? g).join(", ")}`,
      porque: veioDoAluno ? [{ pergunta: CURTO.foco, resposta: a.foco!.map((f) => FOCO_ROTULO[f]).join(", ") }] : [{ pergunta: CADASTRO, resposta: "Foco" }],
    });
  }

  const avoidIds = avoidIdsFrom(a);
  const naoQuer = (a.naoQuer ?? []).filter((n) => NAO_QUER_IDS[n]);
  if (avoidIds.length) {
    input.avoidIds = avoidIds;
    const lista = naoQuer.map((n) => NAO_QUER_ROTULO[n]);
    motivos.push({ texto: `Fora da ficha a pedido de ${aluno}: ${listaE(lista)}`, porque: [{ pergunta: CURTO.naoQuer, resposta: lista.join(", ") }] });
  }

  const tetoMotivo = motivoTetoModerado(an, ctx);
  if (tetoMotivo) {
    input.intensityCap = "moderada";
    motivos.push({ texto: `Intensidade moderada: ${tetoMotivo}`, porque: [] });
  }

  const durationWeeks = ws?.semanas;
  if (durationWeeks) motivos.push({ texto: `Validade: ${durationWeeks} semanas (seu padrão)`, porque: [{ pergunta: JEITO, resposta: `${durationWeeks} semanas` }] });

  const restricoes = uniq((ctx.liberacoes ?? []).map((l) => l.restricoes?.trim()).filter((r): r is string => Boolean(r)));
  const naoAdaptado = [...naoAdaptadoAluno, ...restricoes.map((r) => `Restrições da liberação: ${r}. Ajuste a ficha à mão.`)];

  const sem = naoQuer.map((n) => NAO_QUER_CURTO[n]);
  const semTexto = sem.length > 2 ? `${sem.slice(0, 2).join(", ")} e mais ${sem.length - 2}` : listaE(sem);
  const resumoCurto = [getSystem(system).short, minutos !== undefined ? `${dias}×${minutos} min` : `${dias}× por semana`, ...(sem.length ? [`sem ${semTexto}`] : [])].join(" · ");

  return {
    input,
    ...(durationWeeks ? { durationWeeks } : {}),
    motivos,
    naoAdaptado,
    tetoMotivo,
    cuidados: [], // [E2] cuidadosNaFicha (track A)
    avisos,
    ...(nivelNota ? { nivelNota } : {}),
    resumoCurto,
  };
}

/**
 * O que o gerador assistido faz antes de gerar (spec §6.4 e §8.5): sem questionário, segue como hoje; respostas
 * ilegíveis ou alerta vermelho aberto → trava (só "Registrar liberação" ou "Voltar"); laranja aberto → porta
 * ("Seguir mesmo assim" com a caixa marcada). A ficha do zero continua possível nos dois casos.
 */
export type AntesDeGerar =
  | { modo: "livre" }
  | { modo: "trava"; alertas: Alerta[]; problema?: "versao_nova" | "invalida" }
  | { modo: "porta"; alertas: Alerta[] };

export function antesDeGerar(profile: Profile, hoje: Date): AntesDeGerar {
  const an = readAnamnese(profile);
  if (an === null) return { modo: "livre" };
  if (an === "versao_nova" || an === "invalida") return { modo: "trava", alertas: [], problema: an };
  const { trava, porta } = travaEPorta(an, { hoje, liberacoes: profile.liberacoes ?? [] });
  if (trava.length) return { modo: "trava", alertas: trava };
  if (porta.length) return { modo: "porta", alertas: porta };
  return { modo: "livre" };
}

/**
 * Faixa do editor "{Nome}: avaliação médica pendente (ver resumo)": trava ou porta abertas, ou respostas ilegíveis.
 * "Seguir mesmo assim" libera o gerador, mas não é liberação (spec §6.1: a faixa vale para vermelho ou laranja sem
 * liberação), então o laranja coberto por override continua acendendo a faixa.
 */
export function avaliacaoPendente(profile: Profile, hoje: Date): boolean {
  if (antesDeGerar(profile, hoje).modo !== "livre") return true;
  const an = readAnamnese(profile);
  if (!an || an === "versao_nova" || an === "invalida") return false;
  return alertas(an, { hoje, liberacoes: profile.liberacoes ?? [] }).some((x) => x.nivel === "laranja" && x.coberto?.por === "override");
}

/** AAAA-MM-DD do dia no fuso do aparelho (padrão do campo "Quando?" da liberação). */
export function diaLocal(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Data da liberação (spec §6.4): AAAA-MM-DD de verdade e nunca no futuro. */
export function dataLiberacaoValida(data: string, hoje: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (diaLocal(d) !== data) return false; // 2026-02-30 e afins
  return data <= diaLocal(hoje);
}

/** Campos que contam como ajuste do personal sobre o que veio pré-preenchido (`ajustes_n` de `program_generated`). */
const CAMPOS_AJUSTE = ["goal", "level", "daysPerWeek", "sessionMinutes", "equipment", "system", "limitations"] as const;

/** Quantas escolhas o personal mudou entre o pré-preenchido e o que foi gerado (só a contagem vai para a medição). */
export function contarAjustes(inicial: Partial<GenerateInput>, final: Partial<GenerateInput>): number {
  const norm = (k: (typeof CAMPOS_AJUSTE)[number], v: unknown) => (k === "limitations" ? (typeof v === "string" ? v.trim() : "") : v);
  return CAMPOS_AJUSTE.filter((k) => norm(k, inicial[k]) !== norm(k, final[k])).length;
}

/**
 * Por que a base da ficha sai do motor do app mesmo com a IA ligada (null = a IA pode montar): com o questionário,
 * nada das respostas nem os termos que o app pôs nas limitações vão para /api/ai ("As respostas não passam pelo
 * servidor do Shape Real", §11.1); com teto moderado ou "não quero fazer", que a IA não recebe nem aplica, a prévia
 * diria "levou em conta" sem ter levado.
 */
export function motivoDoMotorLocal(i: { comQuestionario: boolean; limitacoesDoQuestionario?: readonly string[]; cap: boolean; avoidIds: readonly string[] }): "questionario" | "restricao" | null {
  if (i.comQuestionario || (i.limitacoesDoQuestionario?.length ?? 0) > 0) return "questionario";
  if (i.cap || i.avoidIds.length > 0) return "restricao";
  return null;
}
export const AVISO_MOTOR_LOCAL: Record<"questionario" | "restricao", string> = {
  questionario: "Com o questionário, a base é montada pelo motor do app, neste aparelho: as respostas não saem daqui.",
  restricao: "Com intensidade moderada ou exercícios fora da ficha, a base é montada pelo motor do app, que aplica essas regras.",
};

const CHAVES_IA = ["goal", "level", "daysPerWeek", "sessionMinutes", "equipment", "system", "limitations", "emphasis", "seed", "notes"] as const;

/** Só os campos que a rota de IA aceita (nada de avoidIds, intensityCap nem resposta do questionário). */
export function pickAiInput(input: GenerateInput & { notes?: string }): Pick<GenerateInput, "goal" | "level" | "daysPerWeek" | "sessionMinutes" | "equipment" | "system" | "limitations" | "emphasis" | "seed"> & { notes?: string } {
  const out: Record<string, unknown> = {};
  for (const k of CHAVES_IA) if (input[k] !== undefined) out[k] = input[k];
  return out as ReturnType<typeof pickAiInput>;
}

// ───────────────────────── Telas do gerador e da liberação (etapa 2), puras ─────────────────────────

/** Estado inicial do gerador: o que vem pré-preenchido (e que vira `program.sugerido` ao salvar). */
export interface EntradaGerador {
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: Equipment;
  system: SystemId;
  limitations: string;
  emphasis: MuscleGroup[];
  /** "Não quero fazer" do questionário (fica fora da IA). */
  avoidIds: string[];
  /** Caixa "Intensidade moderada" marcada de início (há motivo). */
  teto: boolean;
  /** Validade da prévia: o padrão do personal (`ws.semanas`). */
  durationWeeks?: number;
  /** A divisão não é a sugerida para as respostas (padrão do personal ou preferida do aluno): a sugestão automática não a troca. */
  sistemaEscolhido: boolean;
}

/**
 * Entrada inicial do gerador. Com questionário (`ficha`), os campos de `toGenerateInput`; sem, o cadastro como hoje.
 * `paraAluno` (o personal gera para um aluno): o jeito de trabalhar entra como reserva de dias, tempo e local, com a
 * divisão preferida quando cabe nos dias e a validade padrão. Sem `paraAluno` (o aluno para si, o modelo do
 * personal), nada do jeito de trabalhar entra.
 */
export function entradaInicial(owner: Profile, ws: WorkStyle | undefined, ficha: FichaSugerida | null, paraAluno: boolean): EntradaGerador {
  const w = paraAluno ? ws : undefined;
  const f = ficha?.input ?? {};
  const goal = f.goal ?? owner.goal ?? "hipertrofia";
  const level = f.level ?? owner.level ?? "intermediario";
  const daysPerWeek = f.daysPerWeek ?? clampDias(owner.daysPerWeek ?? w?.dias ?? 3);
  const sessionMinutes = f.sessionMinutes ?? owner.sessionMinutes ?? w?.minutos ?? 60;
  const equipment = f.equipment ?? owner.equipment ?? (w ? resolveDefaults(w).equipment : "academia");
  const emphasis = [...(f.emphasis ?? owner.emphasis ?? [])];
  const limitations = f.limitations ?? owner.limitations ?? "";
  const sugerida = suggestSystem(daysPerWeek, level, { emphasis, equipment, goal });
  let system: SystemId;
  let sistemaEscolhido: boolean;
  if (f.system) {
    system = f.system;
    sistemaEscolhido = f.system !== sugerida;
  } else {
    const padrao = geravel(w?.divisao) && sistemaCabe(w!.divisao!, daysPerWeek) ? w!.divisao! : undefined;
    const preferida = owner.preferredSystem && owner.preferredSystem !== "livre" ? owner.preferredSystem : undefined;
    system = padrao ?? preferida ?? sugerida;
    sistemaEscolhido = Boolean(padrao ?? preferida);
  }
  const durationWeeks = ficha?.durationWeeks ?? w?.semanas;
  return {
    goal,
    level,
    daysPerWeek,
    sessionMinutes,
    equipment,
    system,
    limitations,
    emphasis,
    avoidIds: [...(f.avoidIds ?? [])],
    teto: f.intensityCap === "moderada",
    ...(durationWeeks ? { durationWeeks } : {}),
    sistemaEscolhido,
  };
}

const INTENSIDADE = "Intensidade moderada";

/**
 * "O que a ficha levou em conta" (prévia): os motivos com a caixa "Intensidade moderada" como ficou. Desmarcada, a
 * linha sai; marcada pelo personal sem motivo do questionário, entra "marcada por você".
 */
export function motivosLevados(ficha: Pick<FichaSugerida, "motivos" | "tetoMotivo">, cap: boolean): MotivoFicha[] {
  const sem = ficha.motivos.filter((m) => !m.texto.startsWith(`${INTENSIDADE}:`));
  if (!cap) return sem;
  if (ficha.tetoMotivo) return ficha.motivos;
  return [...sem, { texto: `${INTENSIDADE}: marcada por você`, porque: [] }];
}

/** Linha embaixo da lista quando o personal mudou escolhas do que veio pré-preenchido. null sem mudança. */
export function ajustesTexto(n: number): string | null {
  if (!(n > 0)) return null;
  return `Você mudou ${plural(n, "escolha", "escolhas")} em relação a esta lista: a ficha usa as suas.`;
}

/** Diálogo antes de gerar (spec §6.4), literal: trava (vermelho ou respostas ilegíveis) ou porta (laranja). null = livre. */
export interface TextoAntesDeGerar {
  titulo: string;
  itens: string[];
  texto: string | null;
  /** Mostra "Registrar liberação" (não com respostas ilegíveis: não há alerta a cobrir). */
  registrar: boolean;
  /** Mostra "Seguir mesmo assim" com a caixa "Conversei com {aluno} sobre isso" (só na porta). */
  seguir: boolean;
  conversei: string;
}

export function textoAntesDeGerar(a: AntesDeGerar, aluno: string): TextoAntesDeGerar | null {
  if (a.modo === "livre") return null;
  const nome = firstName(aluno) || "o aluno";
  const base = { titulo: `Antes de gerar a ficha de ${nome}`, itens: a.alertas.map((x) => x.titulo), conversei: `Conversei com ${nome} sobre isso` };
  if (a.modo === "porta") return { ...base, texto: null, registrar: true, seguir: true };
  if (a.problema) return { ...base, itens: [], texto: `${PROBLEMA_RESUMO[a.problema]} Você ainda pode montar a ficha do zero.`, registrar: false, seguir: false };
  return { ...base, texto: "Registre a liberação para gerar a ficha com estas respostas. Você ainda pode montar a ficha do zero.", registrar: true, seguir: false };
}

/** Formulário "Registrar liberação" (spec §6.4). */
export interface FormLiberacao {
  por?: Liberacao["por"];
  data: string;
  modo: "livre" | "restricoes";
  restricoes: string;
  alertas: AlertId[];
}
export const RESTRICOES_MAX = 200;

/** Erros do formulário de liberação; objeto vazio = pode gravar. A data nunca é futura. */
export function errosLiberacao(f: FormLiberacao, hoje: Date): Partial<Record<"por" | "data" | "restricoes" | "alertas", string>> {
  const e: Partial<Record<"por" | "data" | "restricoes" | "alertas", string>> = {};
  if (!f.por) e.por = "Escolha quem liberou.";
  if (!dataLiberacaoValida(f.data, hoje)) e.data = /^\d{4}-\d{2}-\d{2}$/.test(f.data) && f.data > diaLocal(hoje) ? "A data não pode ser depois de hoje." : "Confira a data.";
  if (f.modo === "restricoes" && !f.restricoes.trim()) e.restricoes = "Escreva as restrições ou marque “Atividade sem restrição”.";
  else if (f.restricoes.trim().length > RESTRICOES_MAX) e.restricoes = `Use até ${RESTRICOES_MAX} caracteres.`;
  if (!f.alertas.length) e.alertas = "Marque pelo menos um ponto.";
  return e;
}
