/**
 * Sinais de alerta do questionário (spec §6.3 e §6.4), determinísticos. Puro.
 * Textos só com fonte (PAR-Q literal do Anexo I da Lei SP 16.724/2018 e triagem do ACSM); nenhum título,
 * recomendação ou linha "Por quê" nomeia condição que o aluno não marcou ("Por quê" repete a resposta literal).
 */
import type { AlertId, Alerta, Anamnese, AnamneseAnswers, CtxTriagem, Liberacao, NivelAlerta, Origem } from "./anamnese-types";
import { curtoDe, fmtDiaMes, idadeDe, parqCompleto, parqRespostas, primeiroNome, respostaDe, rotuloOpcao } from "./anamnese";
import { uid } from "./ids";
import { readAnamnese } from "./questionario-link";
import type { Profile } from "./types";

export const NIVEL_ROTULO: Record<NivelAlerta, string> = {
  vermelho: "Não começar agora",
  laranja: "Pedir liberação antes de começar",
  amarelo: "Começar com limite",
  azul: "Cuidado",
  lembrete: "Lembrete",
};
/** Mostrado ao personal com A-GESTANTE ou A-GESTANTE-OK (spec §6.3), literal. */
export const SINAIS_PARAR: string =
  "Pare o exercício e oriente procurar o obstetra se houver: sangramento vaginal, contrações dolorosas regulares, perda de líquido, falta de ar antes do esforço, tontura, dor de cabeça, dor no peito, fraqueza que afeta o equilíbrio, dor ou inchaço na panturrilha.";
/** Motivo do teto moderado para quem não treina com regularidade (D-30: não é alerta). */
export const MOTIVO_INATIVO = "Sem treino regular nos últimos 3 meses";

const ORDEM_NIVEL: Record<NivelAlerta, number> = { vermelho: 0, laranja: 1, amarelo: 2, azul: 3, lembrete: 4 };

interface Def {
  nivel: NivelAlerta;
  efeito: Alerta["efeito"];
  base: string;
}
const PRECAUCAO = "Precaução, a revisar";
const REGRA = "Regra do app";
/** Tabela de spec §6.3, na ordem (a ordem dentro do nível é a desta tabela). */
export const ALERTA_DEF: Readonly<Record<AlertId, Def>> = {
  "A-PEITO": { nivel: "vermelho", efeito: "trava", base: "PAR-Q (Lei SP 16.724/2018) e ACSM 2015" },
  "A-TONTURA": { nivel: "vermelho", efeito: "trava", base: "PAR-Q+ e ACSM 2015" },
  "A-SINTOMA": { nivel: "vermelho", efeito: "trava", base: "ACSM 2015" },
  "A-SUPERVISAO": { nivel: "vermelho", efeito: "trava", base: "PAR-Q (Lei SP 16.724/2018)" },
  "A-PAUSA": { nivel: "vermelho", efeito: "trava", base: "PAR-Q e PAR-Q+" },
  "A-OBSTETRA": { nivel: "vermelho", efeito: "trava", base: "ACOG 804 (exercício na gestação)" },
  "A-COLUNA-URG": { nivel: "vermelho", efeito: "trava", base: "IFOMPT (sinais de alerta da coluna)" },
  "A-COLUNA": { nivel: "laranja", efeito: "porta", base: "IFOMPT (sinais de alerta da coluna)" },
  "A-DOENCA": { nivel: "laranja", efeito: "porta", base: "ACSM 2015" },
  "A-PARQ7": { nivel: "laranja", efeito: "porta", base: "PAR-Q (Lei SP 16.724/2018)" },
  "A-GESTANTE": { nivel: "laranja", efeito: "porta", base: "GAQ-P (CSEP)" },
  "A-HIPO": { nivel: "laranja", efeito: "porta", base: "PAR-Q+ e ADA" },
  "A-DIAB-COMP": { nivel: "laranja", efeito: "porta", base: "PAR-Q+ e ADA" },
  "A-DOR-FORTE": { nivel: "laranja", efeito: "porta", base: PRECAUCAO },
  "A-DOR-TRAUMA": { nivel: "laranja", efeito: "porta", base: PRECAUCAO },
  "A-PARQ-INCOMPLETO": { nivel: "laranja", efeito: "porta", base: REGRA },
  "A-SEM-TRIAGEM": { nivel: "laranja", efeito: "porta", base: `${REGRA}: dado que falta não é liberação` },
  "A-DOENCA-ATIVO": { nivel: "amarelo", efeito: "teto", base: "ACSM 2015" },
  "A-PRESSAO": { nivel: "amarelo", efeito: "teto", base: "PAR-Q+ e ACSM (hipertensão)" },
  "A-PESSOAL": { nivel: "amarelo", efeito: "teto", base: REGRA },
  "A-POSPARTO": { nivel: "amarelo", efeito: "token", base: "Retorno ao exercício no pós-parto (Goom, Donnelly e Brockwell)" },
  "A-QUEDA": { nivel: "amarelo", efeito: "token", base: `CDC STEADI (risco); conduta: ${PRECAUCAO.toLowerCase()}` },
  "A-PARQ-SIM": { nivel: "azul", efeito: "info", base: "Anexo I da Lei SP 16.724/2018" },
  "A-GESTANTE-OK": { nivel: "azul", efeito: "token", base: "Guia de Atividade Física para a População Brasileira e ACOG 804" },
  "A-CANCER": { nivel: "azul", efeito: "info", base: "PAR-Q+" },
  "A-ALIMENTAR": { nivel: "azul", efeito: "info", base: "PAR-Q+ e Lei 8.234/1991 (nutricionista)" },
  "A-CIRURGIA": { nivel: "azul", efeito: "info", base: `PAR-Q (variante); conduta: ${PRECAUCAO.toLowerCase()}` },
  "A-70": { nivel: "lembrete", efeito: "info", base: "Lei SP 16.724/2018, art. 5º-A, III" },
  "A-MENOR": { nivel: "lembrete", efeito: "info", base: "Lei SP 16.724/2018, art. 5º-A, II; LGPD, art. 14" },
};
export const ORDEM_ALERTAS = Object.keys(ALERTA_DEF) as AlertId[];

const DOENCA_CONHECIDA = ["coracao", "avc", "circulacao", "diabetes1", "diabetes2", "rins"] as const;

interface Texto {
  titulo: string;
  recomendado: string;
  porque: Origem[];
}

const responde = (a: AnamneseAnswers, id: string): Origem => ({ pergunta: curtoDe(id), resposta: respostaDe(a, id) ?? "Pulou" });
const opcao = (id: string, v: string): Origem => ({ pergunta: curtoDe(id), resposta: rotuloOpcao(id, v) ?? v });
const simParq = (i: number): Origem => ({ pergunta: curtoDe(`parq.${i}`), resposta: "Sim" });

/** Regras de spec §6.3 (com D-30). Devolve os textos dos alertas ativos, na ordem da tabela, antes da cobertura. */
function detectar(an: Anamnese, hoje: Date): Partial<Record<AlertId, Texto>> {
  const a = an.a;
  const out: Partial<Record<AlertId, Texto>> = {};
  const idade = idadeDe(a, hoje);
  const aluno = primeiroNome(a.nome) || "o aluno";

  // Lembretes legais valem também sem dados de saúde (idade não é dado de saúde).
  const lembretes = () => {
    if (idade !== null && idade >= 70)
      out["A-70"] = { titulo: "70 anos ou mais", recomendado: "Em academias de SP, a lei pede atestado médico a partir de 70 anos.", porque: [responde(a, "ano")] };
    if (idade !== null && idade < 18) {
      const resp = an.consent?.responsavel;
      const registro = resp ? `Menor de 18 anos: autorização de ${resp.nome} registrada em ${fmtDiaMes(resp.at)}.` : "Menor de 18 anos: a autorização do responsável não foi registrada.";
      const menor15 = idade < 15 ? " Em academias de SP, quem tem menos de 15 anos precisa de autorização por escrito do responsável." : "";
      out["A-MENOR"] = { titulo: "Menor de 18 anos", recomendado: registro + menor15, porque: [responde(a, "ano")] };
    }
  };

  if (an.healthOmitted) {
    out["A-SEM-TRIAGEM"] = {
      titulo: "Sem triagem de saúde",
      recomendado: `${aluno} não autorizou o envio das respostas de saúde. Faça a triagem pessoalmente antes de começar.`,
      porque: [{ pergunta: "Autorização de saúde", resposta: "Não marcada" }],
    };
    lembretes();
    return out;
  }

  const cond = Array.isArray(a.condicoes) ? a.condicoes : [];
  const sint = Array.isArray(a.sintomas) ? a.sintomas : [];
  const rem = a.remedios === 1 && Array.isArray(a.remediosPara) ? a.remediosPara : [];
  const pq = parqRespostas(a);
  const ativo = a.regular === "sim3m";
  const doenca = cond.filter((c) => (DOENCA_CONHECIDA as readonly string[]).includes(c));
  const outros = sint.filter((s) => s !== "peito" && s !== "tontura");
  const dorAlerta = a.dor === 1 && Array.isArray(a.dorAlerta) ? a.dorAlerta : [];
  const ondeDoi = a.dor === 1 && Array.isArray(a.dorOnde) && a.dorOnde.length ? [responde(a, "dorOnde")] : [];

  // Vermelho
  if (pq[1] === 1 || pq[2] === 1 || sint.includes("peito")) {
    const porque = [...(pq[1] === 1 ? [simParq(1)] : []), ...(pq[2] === 1 ? [simParq(2)] : []), ...(sint.includes("peito") ? [opcao("sintomas", "peito")] : [])];
    out["A-PEITO"] = { titulo: "Dor no peito", recomendado: "Avaliação médica antes de qualquer treino. Se acontecer durante o treino, parar.", porque };
  }
  if (pq[3] === 1 || sint.includes("tontura")) {
    const porque = [...(pq[3] === 1 ? [simParq(3)] : []), ...(sint.includes("tontura") ? [opcao("sintomas", "tontura")] : [])];
    out["A-TONTURA"] = { titulo: "Tontura com desequilíbrio ou desmaio", recomendado: "Avaliação médica antes de começar.", porque };
  }
  if (outros.length) {
    out["A-SINTOMA"] = {
      titulo: "Sinal que pede avaliação médica",
      recomendado: ativo ? "Parar o treino atual e buscar avaliação médica." : "Avaliação médica antes de qualquer treino.",
      porque: outros.map((s) => opcao("sintomas", s)),
    };
  }
  if (pq[0] === 1)
    out["A-SUPERVISAO"] = {
      titulo: "Médico orientou treino só com supervisão de profissionais de saúde",
      recomendado: "Peça a orientação por escrito e registre a liberação antes de começar.",
      porque: [simParq(0)],
    };
  if (a.orientacao === "pausa")
    out["A-PAUSA"] = { titulo: "O médico pediu para não treinar por enquanto", recomendado: "Seguir a orientação e registrar nova liberação antes de começar.", porque: [responde(a, "orientacao")] };
  if (a.gestacao === "gravida" && a.obstetra === "pediuNao")
    out["A-OBSTETRA"] = { titulo: "O obstetra pediu para não fazer exercício agora", recomendado: "Seguir a orientação do obstetra.", porque: [responde(a, "obstetra")] };
  const urg = dorAlerta.filter((x) => x === "sela" || x === "esfincter");
  if (urg.length)
    out["A-COLUNA-URG"] = {
      titulo: "Dor nas costas com sinal que pede atendimento hoje",
      recomendado: "Oriente procurar atendimento médico no mesmo dia.",
      porque: urg.map((x) => opcao("dorAlerta", x)),
    };

  // Laranja
  const coluna = dorAlerta.filter((x) => x === "neuro" || x === "sistemico" || x === "cancer" || x === "trauma");
  if (coluna.length && !urg.length)
    out["A-COLUNA"] = {
      titulo: "Dor nas costas com sinal de alerta",
      recomendado: "Avaliação médica antes de exercícios que carregam a coluna.",
      porque: coluna.map((x) => opcao("dorAlerta", x)),
    };
  if (doenca.length && !ativo && sint.length === 0)
    out["A-DOENCA"] = {
      titulo: "Condição de saúde conhecida e sem treino regular",
      recomendado: "Liberação médica antes de começar. Depois, leve a moderado com progressão gradual.",
      porque: [...doenca.map((c) => opcao("condicoes", c)), responde(a, "regular")],
    };
  if (pq[6] === 1) {
    const detalhe = a.parqDetalhe?.trim() ? [responde(a, "parqDetalhe")] : [];
    out["A-PARQ7"] = {
      titulo: "Sabe de outra razão para não praticar atividade física",
      recomendado: `Converse com ${aluno}. Se for de saúde, peça liberação.`,
      porque: [simParq(6), ...detalhe],
    };
  }
  // Gestante sem resposta sobre o obstetra conta como sem liberação (leitura cautelosa; dado que falta não é liberação).
  if (a.gestacao === "gravida" && a.obstetra !== "sim" && a.obstetra !== "pediuNao")
    out["A-GESTANTE"] = {
      titulo: "Gestante sem liberação do obstetra",
      recomendado: "Combine o treino com o obstetra antes de começar.",
      porque: [responde(a, "gestacao"), responde(a, "obstetra")],
    };
  const diabetes = cond.filter((c) => c === "diabetes1" || c === "diabetes2");
  const remDiabetes = rem.filter((r) => r === "insulina" || r === "diabetes");
  if ((diabetes.length || remDiabetes.length) && a.hipo === "frequente")
    out["A-HIPO"] = {
      titulo: "Hipoglicemias frequentes no exercício",
      recomendado: "Combinar com o médico antes de começar; carboidrato rápido por perto.",
      porque: [...diabetes.map((c) => opcao("condicoes", c)), ...remDiabetes.map((r) => opcao("remediosPara", r)), responde(a, "hipo")],
    };
  if (Array.isArray(a.complicacoes) && a.complicacoes.length)
    out["A-DIAB-COMP"] = {
      titulo: "Complicação do diabetes informada",
      recomendado: "Liberação médica antes de começar.",
      porque: a.complicacoes.map((c) => opcao("complicacoes", c)),
    };
  if (a.dor === 1) {
    const forte = typeof a.dorNota === "number" && a.dorNota >= 7;
    const quando = (Array.isArray(a.dorQuando) ? a.dorQuando : []).filter((q) => q === "parado" || q === "noite" || q === "sempre");
    if (forte || quando.length)
      out["A-DOR-FORTE"] = {
        titulo: "Dor forte, em repouso ou à noite",
        recomendado: "Avaliação com médico ou fisioterapeuta antes de treinar a região.",
        porque: [...ondeDoi, ...(forte ? [responde(a, "dorNota")] : []), ...quando.map((q) => opcao("dorQuando", q))],
      };
    if (a.dorDesde === "ate6s" && a.dorTrauma === 1 && !out["A-COLUNA"] && !out["A-COLUNA-URG"])
      out["A-DOR-TRAUMA"] = {
        titulo: "Dor recente depois de queda ou batida",
        recomendado: "Avaliação antes de treinar a região.",
        porque: [...ondeDoi, responde(a, "dorDesde"), responde(a, "dorTrauma")],
      };
  }
  if (an.via === "junto" && !parqCompleto(a))
    out["A-PARQ-INCOMPLETO"] = {
      titulo: "PAR-Q incompleto",
      recomendado: "Pergunte as 7 perguntas antes de começar.",
      porque: [{ pergunta: "PAR-Q", resposta: "Incompleto" }],
    };

  // Amarelo
  if (doenca.length && ativo && sint.length === 0)
    out["A-DOENCA-ATIVO"] = {
      titulo: "Condição de saúde conhecida, já treina",
      recomendado: "Pode seguir em intensidade moderada. Para treino intenso, liberação médica (vale 12 meses se nada mudar).",
      porque: [...doenca.map((c) => opcao("condicoes", c)), responde(a, "regular")],
    };
  // Sem resposta sobre a pressão, com a pergunta à vista, conta como "Não sei" (leitura cautelosa).
  const perguntouPressao = cond.includes("pressao") || rem.some((r) => r === "pressao" || r === "diuretico" || r === "betabloqueador");
  if (a.pressaoControle === "alta" || a.pressaoControle === "naoSei" || (perguntouPressao && a.pressaoControle === undefined)) {
    const motivo = a.pressaoControle
      ? []
      : [...(cond.includes("pressao") ? [opcao("condicoes", "pressao")] : []), ...rem.filter((r) => r === "pressao" || r === "diuretico" || r === "betabloqueador").map((r) => opcao("remediosPara", r))];
    out["A-PRESSAO"] = {
      titulo: "Pressão sem controle conhecido",
      recomendado: "Medir a pressão na avaliação antes de treino intenso.",
      porque: [...motivo, responde(a, "pressaoControle")],
    };
  }
  const pessoalCond = a.condicoes === "pessoal";
  const pessoalRem = a.remedios === "pessoal";
  if (pessoalCond || pessoalRem) {
    const sobre = pessoalCond && pessoalRem ? "condições e remédios" : pessoalCond ? "condições" : "remédios";
    out["A-PESSOAL"] = {
      titulo: `Prefere falar pessoalmente sobre ${sobre}`,
      recomendado: "Converse antes de treino intenso.",
      porque: [...(pessoalCond ? [responde(a, "condicoes")] : []), ...(pessoalRem ? [responde(a, "remedios")] : [])],
    };
  }
  // Nunca na gestante (assoalho na gestante é observação, D-30).
  if (a.gestacao === "pp3" || (a.assoalho === 1 && a.gestacao === "pp12"))
    out["A-POSPARTO"] = {
      titulo: "Pós-parto recente ou sinal de assoalho pélvico",
      recomendado: "Sem corrida e saltos por enquanto. Com perda de xixi ou sensação de peso: fisioterapia pélvica.",
      porque: [responde(a, "gestacao"), ...(a.assoalho === 1 ? [responde(a, "assoalho")] : [])],
    };
  const quedaSim = (["quedas", "instavel", "medoCair"] as const).filter((k) => a[k] === 1);
  if ((idade === null || idade >= 65) && quedaSim.length)
    out["A-QUEDA"] = {
      titulo: "Risco de queda aumentado",
      recomendado: "Testar o equilíbrio na primeira aula e começar com exercícios estáveis.",
      porque: [responde(a, "ano"), ...quedaSim.map((k) => responde(a, k))],
    };

  // Azul
  const simIdx = pq.flatMap((v, i) => (v === 1 ? [i] : []));
  if (simIdx.length && simIdx.every((i) => i === 4 || i === 5)) {
    const nums = simIdx.map((i) => String(i + 1));
    const termo = an.termo ? `Termo marcado em ${fmtDiaMes(an.termo.at)}.` : "Termo não marcado.";
    out["A-PARQ-SIM"] = {
      titulo: nums.length === 1 ? `PAR-Q com “sim” na pergunta ${nums[0]}` : `PAR-Q com “sim” nas perguntas ${nums.join(" e ")}`,
      recomendado: `O próprio questionário recomenda conversar com um médico antes de aumentar a atividade. ${termo}`,
      porque: simIdx.map(simParq),
    };
  }
  if (a.gestacao === "gravida" && a.obstetra === "sim")
    out["A-GESTANTE-OK"] = {
      titulo: "Gestante liberada pelo obstetra",
      recomendado: "Meta de 150 minutos por semana em intensidade moderada. Combine os sinais para parar (abaixo).",
      porque: [responde(a, "gestacao"), responde(a, "obstetra")],
    };
  if (cond.includes("cancer"))
    out["A-CANCER"] = {
      titulo: "Informou câncer (em tratamento ou já tratado)",
      recomendado: "Pergunte se está em tratamento; se estiver, combine o treino com a equipe que acompanha.",
      porque: [opcao("condicoes", "cancer")],
    };
  if (cond.includes("alimentar"))
    out["A-ALIMENTAR"] = {
      titulo: "Informou transtorno alimentar",
      recomendado: "Acompanhamento com nutricionista e profissional de saúde mental. O resumo esconde peso e metas de peso.",
      porque: [opcao("condicoes", "alimentar")],
    };
  if (a.cirurgia === 1) {
    const qual = a.cirurgiaQual?.trim();
    out["A-CIRURGIA"] = {
      titulo: `Cirurgia nos últimos 12 meses${qual ? `: ${qual}` : ""}`,
      recomendado: "Pergunte qual foi e se já está liberado para treinar a região.",
      porque: [responde(a, "cirurgia")],
    };
  }

  lembretes();
  return out;
}

const tempo = (iso: string | undefined) => (iso ? Date.parse(iso) : Number.NaN);
const maisRecente = <T>(lista: T[], at: (x: T) => string): T | undefined =>
  [...lista].sort((x, y) => (tempo(at(y)) || 0) - (tempo(at(x)) || 0))[0];

/**
 * Quando as respostas chegaram a este aparelho: `receivedAt` (gravado pelo aparelho do personal na recepção do link)
 * ou, sem ele (modo junto), `answeredAt`. Assim a liberação e as respostas são comparadas no mesmo relógio: um celular
 * de aluno adiantado não deixa a trava presa depois de o personal registrar a liberação, e um atrasado não faz uma
 * liberação antiga cobrir respostas novas.
 */
function chegada(an: Anamnese): number {
  const recebido = tempo(an.receivedAt);
  return Number.isFinite(recebido) ? recebido : tempo(an.answeredAt);
}

/**
 * Liberação cobre o alerta se o lista e foi registrada depois das respostas atuais (`chegada`).
 * Na Entrega 1 a liberação não vence (sem `validaAte`); `hoje` fica para a validade da Entrega 2.
 */
export function cobre(lib: Liberacao, id: AlertId, an: Anamnese, hoje: Date): boolean {
  void hoje;
  const reg = tempo(lib.registradoEm);
  const resp = chegada(an);
  return lib.alertas.includes(id) && Number.isFinite(reg) && Number.isFinite(resp) && reg >= resp;
}

/** Todos os alertas ativos, ordenados (vermelho → lembrete; dentro do nível, a ordem da tabela), com a cobertura. */
export function alertas(an: Anamnese, ctx: CtxTriagem): Alerta[] {
  const achados = detectar(an, ctx.hoje);
  const libs = ctx.liberacoes ?? [];
  const lista: Alerta[] = [];
  for (const id of ORDEM_ALERTAS) {
    const t = achados[id];
    if (!t) continue;
    const def = ALERTA_DEF[id];
    const al: Alerta = { id, nivel: def.nivel, titulo: t.titulo, recomendado: t.recomendado, porque: t.porque, base: def.base, efeito: def.efeito };
    const listam = libs.filter((l) => l.alertas.includes(id));
    const valida = maisRecente(
      listam.filter((l) => cobre(l, id, an, ctx.hoje)),
      (l) => l.registradoEm,
    );
    if (valida) {
      al.coberto = { por: valida.por, data: valida.data };
      if (valida.restricoes?.trim()) al.coberto.restricoes = valida.restricoes.trim();
    } else {
      const anterior = maisRecente(listam, (l) => l.registradoEm);
      if (anterior) al.liberacaoAnterior = { id: anterior.id, data: anterior.data };
      const ov = def.nivel === "laranja" ? maisRecente((an.overrides ?? []).filter((o) => o.alertas.includes(id)), (o) => o.at) : undefined;
      if (ov) al.coberto = { por: "override", data: ov.at };
      else if (id === "A-PESSOAL" && an.conversei?.alertas.includes(id)) al.coberto = { por: "conversei", data: an.conversei.at };
    }
    lista.push(al);
  }
  return lista.sort((x, y) => ORDEM_NIVEL[x.nivel] - ORDEM_NIVEL[y.nivel]);
}

/** trava = vermelhos abertos (sem liberação); porta = laranjas abertos (sem liberação nem "Seguir mesmo assim"). */
export function travaEPorta(an: Anamnese | undefined, ctx: CtxTriagem): { trava: Alerta[]; porta: Alerta[] } {
  if (!an) return { trava: [], porta: [] };
  const lista = alertas(an, ctx);
  return { trava: lista.filter((x) => x.nivel === "vermelho" && !x.coberto), porta: lista.filter((x) => x.nivel === "laranja" && !x.coberto) };
}

/**
 * Primeiro motivo ativo do teto moderado no gerador: A-DOENCA-ATIVO sem liberação, A-PRESSAO, A-PESSOAL sem
 * "Conversei", sem treino regular, liberação com restrições. null se nenhum.
 */
export function motivoTetoModerado(an: Anamnese | undefined, ctx: CtxTriagem): string | null {
  if (!an) return null;
  const lista = alertas(an, ctx);
  for (const id of ["A-DOENCA-ATIVO", "A-PRESSAO", "A-PESSOAL"] as const) {
    const al = lista.find((x) => x.id === id && !x.coberto);
    if (al) return al.titulo;
  }
  // Sem dados de saúde, não se sabe se treina: o teto vale, com o motivo verdadeiro.
  if (an.healthOmitted) return "Sem triagem de saúde";
  if (an.a.regular === undefined) return "Sem resposta sobre treino regular";
  if (an.a.regular !== "sim3m") return MOTIVO_INATIVO;
  const comRestricao = (ctx.liberacoes ?? []).some((l) => !!l.restricoes?.trim() && tempo(l.registradoEm) >= chegada(an));
  return comRestricao ? "Liberação com restrições" : null;
}

/** Caixas do diálogo "Registrar liberação": vermelhos, laranjas e A-DOENCA-ATIVO sem liberação. */
export function abertosParaLiberar(lista: Alerta[]): Alerta[] {
  const liberado = (x: Alerta) => !!x.coberto && x.coberto.por !== "override" && x.coberto.por !== "conversei";
  return lista.filter((x) => (x.nivel === "vermelho" || x.nivel === "laranja" || x.id === "A-DOENCA-ATIVO") && !liberado(x));
}

export function novaLiberacao(i: { por: Liberacao["por"]; data: string; restricoes?: string; alertas: AlertId[]; agora: string }): Liberacao {
  const lib: Liberacao = { id: uid(), por: i.por, data: i.data, alertas: [...new Set(i.alertas)], registradoEm: i.agora };
  const r = i.restricoes?.trim();
  if (r) lib.restricoes = r.slice(0, 200);
  return lib;
}

export function comLiberacao(p: Profile, lib: Liberacao): Profile {
  return { ...p, liberacoes: [...(p.liberacoes ?? []).filter((l) => l.id !== lib.id), lib] };
}

/** [E2] Reconfirmação da liberação (validade). Não implementar na Entrega 1. */
export function reconfirmarLiberacao(p: Profile, libId: string, agora: string): Profile {
  return p;
}

/** Respostas atuais legíveis (só por readAnamnese); null quando não há ou não dá para ler. */
function atual(p: Profile): Anamnese | null {
  const r = readAnamnese(p);
  return r && typeof r === "object" ? r : null;
}

/** "Seguir mesmo assim" (laranja): grava `anamnese.overrides += { at, alertas }`. */
export function comOverride(p: Profile, alertas: AlertId[], agora: string): Profile {
  const an = atual(p);
  const lista = [...new Set(alertas)];
  if (!an || !lista.length) return p;
  return { ...p, anamnese: { ...an, overrides: [...(an.overrides ?? []), { at: agora, alertas: lista }] } };
}

/** "Conversei" (A-PESSOAL): grava `anamnese.conversei = { at, alertas }`. */
export function comConversei(p: Profile, alertas: AlertId[], agora: string): Profile {
  const an = atual(p);
  const lista = [...new Set(alertas)];
  if (!an || !lista.length) return p;
  return { ...p, anamnese: { ...an, conversei: { at: agora, alertas: lista } } };
}

/** Texto do "Avisar {aluno}" (WhatsApp): só modelos fixos, nenhum valor de resposta além do que o alerta já diz. */
export function mensagemAvisar(lista: Alerta[], aluno: string): string {
  const nome = primeiroNome(aluno) || aluno;
  if (lista.some((x) => x.id === "A-COLUNA-URG"))
    return `Oi, ${nome}! Li seu questionário. Pelo que você marcou sobre a dor nas costas, procure atendimento médico ainda hoje. Depois me conta como foi.`;
  return `Oi, ${nome}! Li seu questionário. Antes de começarmos o treino, preciso que você converse com seu médico e me traga a liberação por escrito. Qualquer dúvida, me chama.`;
}
