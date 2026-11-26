import { describe, expect, it } from "vitest";
import { ATENDIMENTOS, PUBLICOS, type WorkStyle } from "./anamnese-types";
import {
  ALIMENTACAO_ROTULO,
  ATENDIMENTO_ROTULO,
  AVISO_CREF,
  DICA_ALIMENTACAO,
  JEITO_SUB,
  JEITO_TITULO,
  PERGUNTAS_JEITO,
  PUBLICO_ROTULO,
  alternarPublico,
  comDefinido,
  comPulado,
  ondeDoEquipment,
  oQueMuda,
  resolveDefaults,
  type Padroes,
} from "./work-style";

/** Tabelas de spec.md §3.3. */
describe("resolveDefaults: pergunta 1 (atendimento)", () => {
  const linha = (atendimento: WorkStyle["atendimento"], ctx?: { hasPhone?: boolean; hasCref?: boolean }) => resolveDefaults({ atendimento }, ctx);

  it("academia: preencher agora, academia, rotina, conferir na aula, avaliação presencial", () => {
    expect(linha("academia")).toEqual<Padroes>({
      modoPadrao: "agora",
      equipment: "academia",
      onde: "academia",
      modulos: ["rotina"],
      conferir: "aula",
      avaliacao: "presencial",
      letraMaior: false,
      checkin: false,
      passoDieta: "dieta",
      avisoCref: false,
      diasComPersonal: false,
    });
  });

  it("casa: preencher agora, equipment home (onde = casa), rotina, aula, presencial", () => {
    expect(linha("casa")).toMatchObject({ modoPadrao: "agora", equipment: "home", onde: "casa", modulos: ["rotina"], conferir: "aula", avaliacao: "presencial", checkin: false, avisoCref: false, diasComPersonal: false });
  });

  it("online: WhatsApp, academia, rotina + objetivo, conversa, pedir medidas, check-in e aviso de CREF sem CREF", () => {
    expect(linha("online")).toMatchObject({ modoPadrao: "whatsapp", equipment: "academia", modulos: ["rotina", "objetivo"], conferir: "conversa", avaliacao: "pedir_medidas", checkin: true, avisoCref: true, diasComPersonal: false });
    expect(linha("online", { hasCref: true }).avisoCref).toBe(false);
  });

  it("misto: WhatsApp, rotina + objetivo, os dois títulos, presencial, check-in, CREF e 'dias com o personal'", () => {
    expect(linha("misto")).toMatchObject({ modoPadrao: "whatsapp", equipment: "academia", modulos: ["rotina", "objetivo"], conferir: "ambos", avaliacao: "presencial", checkin: true, avisoCref: true, diasComPersonal: true });
  });

  it("turmas: WhatsApp, só Esporte (sem Rotina), conversa, pedir medidas, sem check-in", () => {
    expect(linha("turmas")).toMatchObject({ modoPadrao: "whatsapp", equipment: "academia", modulos: ["esporte"], conferir: "conversa", avaliacao: "pedir_medidas", checkin: false, avisoCref: false, diasComPersonal: false });
  });

  it("sem resposta: WhatsApp só com telefone digitado; o resto, os padrões de hoje", () => {
    const sem = resolveDefaults(undefined);
    expect(sem).toEqual<Padroes>({ modoPadrao: "agora", equipment: "academia", onde: "academia", modulos: ["rotina"], conferir: "aula", avaliacao: "presencial", letraMaior: false, checkin: false, passoDieta: "dieta", avisoCref: false, diasComPersonal: false });
    expect(resolveDefaults(undefined, { hasPhone: true }).modoPadrao).toBe("whatsapp");
    expect(resolveDefaults(undefined, { hasPhone: false }).modoPadrao).toBe("agora");
    // Pulou o passo (só puladoEm): igual a sem resposta.
    expect(resolveDefaults({ puladoEm: "2026-11-26T10:00:00.000Z" }, { hasPhone: true })).toEqual(resolveDefaults(undefined, { hasPhone: true }));
    // Atendimento definido manda no modo, com ou sem telefone.
    expect(linha("academia", { hasPhone: true }).modoPadrao).toBe("agora");
    expect(linha("online", { hasPhone: false }).modoPadrao).toBe("whatsapp");
  });

  it("todo atendimento tem uma linha (nenhum cai no padrão por engano)", () => {
    const modos = new Set(ATENDIMENTOS.map((a) => JSON.stringify(linha(a))));
    expect(modos.size).toBe(ATENDIMENTOS.length);
  });
});

describe("onde e equipamentos derivados de equipment", () => {
  it("academia → academia; home → casa; peso_corporal → casa + ['nada']", () => {
    expect(ondeDoEquipment("academia")).toEqual({ onde: "academia" });
    expect(ondeDoEquipment("home")).toEqual({ onde: "casa" });
    expect(ondeDoEquipment("peso_corporal")).toEqual({ onde: "casa", equipamentos: ["nada"] });
    expect(resolveDefaults({ atendimento: "academia" })).toMatchObject({ equipment: "academia", onde: "academia" });
    expect(resolveDefaults({ atendimento: "casa" })).toMatchObject({ equipment: "home", onde: "casa" });
    expect(resolveDefaults({ atendimento: "casa" }).equipamentos).toBeUndefined();
  });
});

describe("resolveDefaults: pergunta 2 (público)", () => {
  const pub = (publico: WorkStyle["publico"], atendimento: WorkStyle["atendimento"] = "academia") => resolveDefaults({ atendimento, publico });

  it("emagrecimento liga Hábitos e pré-marca 'Perder gordura'", () => {
    expect(pub(["emagrecimento"])).toMatchObject({ modulos: ["rotina", "habitos"], goal: "emagrecimento", objetivo: "gordura" });
  });

  it("saude60 liga a letra maior, Rotina e Dor em detalhe; a chave do personal manda", () => {
    expect(pub(["saude60"])).toMatchObject({ letraMaior: true, modulos: ["rotina", "dorMais"], goal: "saude", objetivo: "saude" });
    expect(resolveDefaults({ publico: ["saude60"], letraMaior: false }).letraMaior).toBe(false);
    expect(resolveDefaults({ publico: ["hipertrofia"], letraMaior: true }).letraMaior).toBe(true);
  });

  it("mulheres não muda nada de triagem nem de objetivo: só liga Hábitos", () => {
    const base = pub([]);
    const mulheres = pub(["mulheres"]);
    expect(mulheres.modulos).toEqual(["rotina", "habitos"]);
    expect({ ...mulheres, modulos: base.modulos }).toEqual(base);
    expect(mulheres.goal).toBeUndefined();
    expect(mulheres.objetivo).toBeUndefined();
  });

  it("hipertrofia, dor e esporte: objetivo e módulos da tabela", () => {
    expect(pub(["hipertrofia"])).toMatchObject({ goal: "hipertrofia", objetivo: "massa", modulos: ["rotina"] });
    expect(pub(["dor"])).toMatchObject({ goal: "saude", objetivo: "semDor", modulos: ["rotina", "dorMais"] });
    expect(pub(["esporte"])).toMatchObject({ goal: "condicionamento", objetivo: "esporte", modulos: ["rotina", "esporte"] });
  });

  it("as regras somam; o objetivo vem da primeira marcada que tem um", () => {
    expect(pub(["emagrecimento", "saude60"])).toMatchObject({ goal: "emagrecimento", modulos: ["rotina", "habitos", "dorMais"], letraMaior: true });
    expect(pub(["mulheres", "hipertrofia"])).toMatchObject({ goal: "hipertrofia", objetivo: "massa" });
    expect(pub(["esporte"], "turmas").modulos).toEqual(["esporte"]);
    expect(pub(["saude60"], "turmas").modulos).toEqual(["rotina", "esporte", "dorMais"]);
  });

  it("módulos definidos pelo personal substituem os derivados", () => {
    expect(resolveDefaults({ atendimento: "online", publico: ["emagrecimento"], modulos: ["esporte"] }).modulos).toEqual(["esporte"]);
    expect(resolveDefaults({ atendimento: "online", modulos: [] }).modulos).toEqual([]);
  });

  it("nenhum público muda o modo, a avaliação, o check-in ou o passo de dieta", () => {
    const base = resolveDefaults({ atendimento: "academia" });
    for (const p of PUBLICOS) {
      const r = resolveDefaults({ atendimento: "academia", publico: [p] });
      expect([r.modoPadrao, r.avaliacao, r.conferir, r.checkin, r.passoDieta, r.avisoCref, r.diasComPersonal], p).toEqual([base.modoPadrao, base.avaliacao, base.conferir, base.checkin, base.passoDieta, base.avisoCref, base.diasComPersonal]);
    }
  });
});

describe("resolveDefaults: perguntas 3 a 5", () => {
  it("dias, tempo e semanas passam como padrão", () => {
    expect(resolveDefaults({ dias: 4, minutos: 45, semanas: 6 })).toMatchObject({ dias: 4, minutos: 45, semanas: 6 });
    const sem = resolveDefaults({});
    expect(sem.dias).toBeUndefined();
    expect(sem.semanas).toBeUndefined();
  });

  it("passoDieta: 'nutricionista' para encaminho e parceiro; 'dieta' para orientações e sem resposta", () => {
    expect(resolveDefaults({ alimentacao: "encaminho" }).passoDieta).toBe("nutricionista");
    expect(resolveDefaults({ alimentacao: "parceiro" }).passoDieta).toBe("nutricionista");
    expect(resolveDefaults({ alimentacao: "orientacoes" }).passoDieta).toBe("dieta");
    expect(resolveDefaults({}).passoDieta).toBe("dieta");
    expect(resolveDefaults(undefined).passoDieta).toBe("dieta");
  });
});

// ───────────────────────── Etapa 2: telas do jeito de trabalhar ─────────────────────────

describe("textos das 5 perguntas (spec §3.1 e §3.2), literais", () => {
  it("perguntas, opções, dica da alimentação e aviso de CREF", () => {
    expect(JEITO_TITULO).toBe("Como você trabalha?");
    expect(JEITO_SUB).toBe("5 toques para o app já vir do seu jeito: cadastro, questionário e ficha. Dá para mudar depois em Conta.");
    expect(Object.values(PERGUNTAS_JEITO)).toEqual([
      "Onde você atende a maioria dos alunos?",
      "Quem você mais atende?",
      "Na maioria dos alunos, quantos dias e quanto tempo?",
      "De quanto em quanto tempo você troca a ficha ou reavalia?",
      "E a alimentação dos seus alunos?",
    ]);
    expect(ATENDIMENTOS.map((a) => ATENDIMENTO_ROTULO[a])).toEqual(["Academia ou estúdio", "Casa do aluno, condomínio ou ao ar livre", "Online", "Presencial e online", "Turmas ou assessoria de corrida"]);
    expect(PUBLICOS.map((p) => PUBLICO_ROTULO[p])).toEqual(["Emagrecimento", "Hipertrofia e força", "Saúde e 60+", "Mulheres, gestantes e pós-parto", "Dor ou volta de lesão", "Corrida e esporte"]);
    // Só opções legais: não existe "monto dieta" (CFN).
    expect(Object.values(ALIMENTACAO_ROTULO)).toEqual(["Encaminho para nutricionista", "Trabalho com nutricionista parceiro(a)", "Dou orientações gerais, sem plano alimentar"]);
    expect(DICA_ALIMENTACAO).toBe("Plano alimentar para quem tem condição de saúde é atividade do nutricionista (Lei 8.234/1991). O app avisa quando a resposta do aluno pede isso.");
    expect(AVISO_CREF).toBe("No atendimento online, a CONFEF 542/2024 pede que você informe seu CREF ao aluno.");
  });
});

describe("alternarPublico (até 2)", () => {
  it("marca, desmarca e não passa de 2 (a terceira não entra)", () => {
    expect(alternarPublico(undefined, "saude60")).toEqual(["saude60"]);
    expect(alternarPublico(["saude60"], "dor")).toEqual(["saude60", "dor"]);
    expect(alternarPublico(["saude60", "dor"], "mulheres")).toEqual(["saude60", "dor"]);
    expect(alternarPublico(["saude60", "dor"], "saude60")).toEqual(["dor"]);
  });
});

describe("Salvar e Pular", () => {
  it("Salvar grava definidoEm e tira o puladoEm de antes; Pular guarda o que já estava definido", () => {
    expect(comDefinido({ atendimento: "online", puladoEm: "2026-11-01T00:00:00.000Z" }, "2026-11-26T10:00:00.000Z")).toEqual({ atendimento: "online", definidoEm: "2026-11-26T10:00:00.000Z" });
    expect(comDefinido(undefined, "2026-11-26T10:00:00.000Z")).toEqual({ definidoEm: "2026-11-26T10:00:00.000Z" });
    expect(comPulado(undefined, "2026-11-26T10:00:00.000Z")).toEqual({ puladoEm: "2026-11-26T10:00:00.000Z" });
    expect(comPulado({ semanas: 6, definidoEm: "2026-10-01T00:00:00.000Z" }, "2026-11-26T10:00:00.000Z")).toEqual({ semanas: 6, definidoEm: "2026-10-01T00:00:00.000Z", puladoEm: "2026-11-26T10:00:00.000Z" });
  });
});

describe("oQueMuda (<details> em Conta)", () => {
  it("sem resposta: modo pelo telefone, divisão sugerida, avaliação presencial, passo de dieta e o que nunca muda", () => {
    expect(oQueMuda(undefined)).toEqual([
      "“Adicionar aluno” vem em “Mandar pelo WhatsApp” quando você digita o telefone do aluno; sem telefone, em “Preencher agora”.",
      "Ficha gerada: divisão sugerida pelo app para os dias do aluno.",
      "Passo de avaliação: “Fazer a avaliação presencial”.",
      "O passo “Definir metas e orientações de dieta” aparece para o aluno que ainda não tem dieta.",
      "Nunca muda: as perguntas de saúde, os sinais de alerta, as travas e o aviso de nutricionista quando a resposta do aluno pede.",
    ]);
  });

  it("online, emagrecimento, 3×45, 6 semanas, encaminha e ABC: cada padrão em vigor", () => {
    const linhas = oQueMuda({ atendimento: "online", publico: ["emagrecimento"], dias: 3, minutos: 45, semanas: 6, alimentacao: "encaminho", divisao: "abc" });
    expect(linhas).toEqual([
      "“Adicionar aluno” já vem em “Mandar pelo WhatsApp”.",
      "No questionário feito junto com o aluno, já vem marcado: Perder gordura; 3 dias de 45 min. Você confirma com ele.",
      "Ficha gerada: local academia quando o cadastro do aluno não diz.",
      "Ficha gerada: 3 dias de 45 min quando o cadastro do aluno não diz.",
      "Ficha gerada: divisão ABC quando cabe nos dias do aluno; senão, a sugerida pelo app.",
      "Ficha gerada: validade de 6 semanas.",
      "Passo de avaliação: “Pedir peso e medidas” ao aluno.",
      "O passo “Definir metas e orientações de dieta” não aparece. A aba Dieta continua.",
      "Nunca muda: as perguntas de saúde, os sinais de alerta, as travas e o aviso de nutricionista quando a resposta do aluno pede.",
    ]);
  });

  it("não promete nada da Entrega 2 (partes extras, letra maior, check-in, 'Na primeira aula')", () => {
    const tudo = ATENDIMENTOS.flatMap((atendimento) => oQueMuda({ atendimento, publico: ["saude60", "mulheres"], alimentacao: "parceiro" })).join(" ").toLowerCase();
    for (const proibido of ["parte", "letra", "check-in", "primeira aula", "primeira conversa", "módulo"]) expect(tudo).not.toContain(proibido);
  });
});
