import { describe, expect, it, vi } from "vitest";
import type { Anamnese, AnamneseAnswers, Resumo } from "./anamnese-types";
import { stripHealth } from "./anamnese";
import { alunoBase, anamneseBase, anoParaIdade, HOJE, RESPONDIDO_EM } from "./anamnese-fixtures";
import { readAnamnese } from "./questionario-link";
import { numerosDoTexto, numerosPermitidos, PROBLEMA_RESUMO, semAlertasFrase, summarize } from "./resumo";
import { SINAIS_PARAR } from "./triagem";
import type { Profile } from "./types";

// readAnamnese real (track E), embrulhado só para os casos "versao_nova" e "invalida" (mockReturnValueOnce).
vi.mock("./questionario-link", async (importOriginal) => {
  const real = await importOriginal<typeof import("./questionario-link")>();
  return { ...real, readAnamnese: vi.fn(real.readAnamnese) };
});

const parq = (...sim: number[]): AnamneseAnswers["parq"] => [0, 1, 2, 3, 4, 5, 6].map((i) => (sim.includes(i) ? 1 : 0)) as AnamneseAnswers["parq"];
const resumo = (an: Anamnese, over: Partial<Profile> = {}, ws?: Parameters<typeof summarize>[0]["ws"]) => summarize({ profile: alunoBase({ anamnese: an, ...over }), ws, hoje: HOJE }) as Resumo;

describe("summarize", () => {
  it("null sem questionário", () => {
    expect(summarize({ profile: alunoBase(), hoje: HOJE })).toBeNull();
  });

  for (const problema of ["versao_nova", "invalida"] as const) {
    it(`readAnamnese '${problema}' → só o problema, nenhuma outra linha`, () => {
      vi.mocked(readAnamnese).mockReturnValueOnce(problema);
      const r = resumo(anamneseBase());
      expect(r.problema).toBe(problema);
      expect(r).toMatchObject({ origem: "", perfil: "", alertas: [], semAlertasTexto: null, falta: [], mudou: null, sinaisParar: null, escondePeso: false, velho: false });
      expect(r.atencao).toEqual([]);
      expect(r.conferir.itens).toEqual([]);
    });
  }

  it("frases de spec §6.1", () => {
    expect(PROBLEMA_RESUMO.versao_nova).toBe("Respostas de uma versão mais nova do app. Atualize para ver.");
    expect(PROBLEMA_RESUMO.invalida).toBe("As respostas deste aluno estão danificadas. Peça o questionário de novo.");
  });

  it("origem: data, como foi respondido e autorização", () => {
    expect(resumo(anamneseBase()).origem).toBe("Questionário de 20/11/2026 · Ana respondeu pelo link · autorização de saúde em 20/11");
    const junto = anamneseBase({}, { via: "junto", by: "personal", consent: { at: "2026-11-19T09:00:00-03:00", source: "personal", textId: "c1" } });
    expect(resumo(junto).origem).toBe("Questionário de 20/11/2026 · feito com você · autorização de saúde em 19/11");
    expect(resumo(stripHealth(anamneseBase())).origem).toBe("Questionário de 20/11/2026 · Ana respondeu pelo link · sem dados de saúde");
  });

  it("perfil em uma linha, sem peso", () => {
    expect(resumo(anamneseBase()).perfil).toBe("Ganhar massa muscular · treina há 3 a 12 meses · 3×60 min · academia completa · 36 anos · F");
    expect(resumo(anamneseBase({ objetivo: "gordura", experiencia: "nunca", dias: 4, minutos: 45, onde: "casa", sexo: "nd" })).perfil).toBe("Perder gordura · nunca treinou · 4×45 min · em casa · 36 anos");
    expect(resumo(anamneseBase({ ano: undefined, minutos: undefined })).perfil).toBe("Ganhar massa muscular · treina há 3 a 12 meses · 3 dias por semana · academia completa · F");
  });

  it("semAlertasTexto exato sem vermelho, laranja nem amarelo (só azul, nada, ou sedentário sem outro sinal)", () => {
    const frase = "Nenhum sinal de alerta nas respostas de 20/11. Isso não substitui a avaliação presencial.";
    expect(semAlertasFrase(RESPONDIDO_EM)).toBe(frase);
    expect(resumo(anamneseBase()).semAlertasTexto).toBe(frase);
    expect(resumo(anamneseBase({ regular: "nao" })).semAlertasTexto).toBe(frase);
    const soAzul = resumo(anamneseBase({ parq: parq(4), cirurgia: 1 }));
    expect(soAzul.alertas.map((x) => x.nivel)).toEqual(["azul", "azul"]);
    expect(soAzul.semAlertasTexto).toBe(frase);
    expect(resumo(anamneseBase({ condicoes: ["pressao"], pressaoControle: "naoSei" })).semAlertasTexto).toBeNull();
    expect(resumo(stripHealth(anamneseBase())).semAlertasTexto).toBeNull();
  });

  it("alerta coberto continua no resumo (e tira a frase de 'nenhum sinal')", () => {
    const an = anamneseBase({ parq: parq(0) });
    const lib = { id: "l1", por: "medico" as const, data: "2026-11-21", alertas: ["A-SUPERVISAO" as const], registradoEm: "2026-11-21T09:00:00-03:00" };
    const r = resumo(an, { liberacoes: [lib] });
    expect(r.alertas[0]?.coberto).toEqual({ por: "medico", data: "2026-11-21" });
    expect(r.semAlertasTexto).toBeNull();
  });

  it("conferir.titulo pelo atendimento (itens na Entrega 2)", () => {
    expect(resumo(anamneseBase(), {}, { atendimento: "online" }).conferir).toEqual({ titulo: "Na primeira conversa, perguntar", itens: [] });
    expect(resumo(anamneseBase(), {}, { atendimento: "turmas" }).conferir.titulo).toBe("Na primeira conversa, perguntar");
    for (const atendimento of ["academia", "casa", "misto", undefined] as const) expect(resumo(anamneseBase(), {}, { atendimento }).conferir.titulo).toBe("Na primeira aula, conferir");
  });

  it("escondePeso com transtorno alimentar; o perfil nunca mostra peso", () => {
    const r = resumo(anamneseBase({ condicoes: ["alimentar"], orientacao: "nao", peso: 48.5 }));
    expect(r.escondePeso).toBe(true);
    expect(r.perfil).not.toMatch(/kg|48/);
    expect(resumo(anamneseBase()).escondePeso).toBe(false);
  });

  it("velho com respostas de 13 meses; não com 11", () => {
    expect(resumo(anamneseBase({}, { answeredAt: "2025-10-20T10:00:00-03:00" })).velho).toBe(true);
    expect(resumo(anamneseBase({}, { answeredAt: "2025-12-20T10:00:00-03:00" })).velho).toBe(false);
  });

  it("sinais para parar com gestante (liberada ou não)", () => {
    expect(resumo(anamneseBase({ gestacao: "gravida", obstetra: "sim" })).sinaisParar).toBe(SINAIS_PARAR);
    expect(resumo(anamneseBase({ gestacao: "gravida", obstetra: "naoPerguntei" })).sinaisParar).toBe(SINAIS_PARAR);
    expect(resumo(anamneseBase({ gestacao: "pp3" })).sinaisParar).toBeNull();
  });

  it("Entrega 2 vazia: atenção, disse, extras, falta e mudou", () => {
    const r = resumo(anamneseBase({ condicoes: ["osteoporose"], orientacao: "livre" }), { anamnesePrev: anamneseBase({}, { id: "an-0", answeredAt: "2026-01-10T10:00:00-03:00" }) });
    expect(r).toMatchObject({ atencao: [], disse: [], extras: [], falta: [], mudou: null });
  });

  it("é estável: mesma entrada, mesma saída", () => {
    const p = alunoBase({ anamnese: anamneseBase({ parq: parq(4, 6), condicoes: ["coracao"], regular: "nao", dor: 1, dorOnde: [{ r: "lombar" }], dorNota: 8, dorQuando: ["noite"], dorDesde: "ate6s", dorTrauma: 1, dorAlerta: ["neuro"], tratamento: "nao" }) });
    expect(summarize({ profile: p, hoje: HOJE })).toEqual(summarize({ profile: p, hoje: HOJE }));
  });
});

describe("guarda de números (spec §6.5)", () => {
  const FIXTURES: [string, Anamnese][] = [
    ["base", anamneseBase()],
    ["idoso com queda", anamneseBase({ ano: anoParaIdade(72), gestacao: undefined, quedas: 1, instavel: 1, medoCair: 0, regular: "nao" })],
    ["gestante liberada", anamneseBase({ gestacao: "gravida", obstetra: "sim", semanas: 22, assoalho: 1 })],
    ["gestante sem liberação", anamneseBase({ gestacao: "gravida", obstetra: "naoPerguntei", semanas: 9 })],
    ["diabetes com hipoglicemia", anamneseBase({ condicoes: ["diabetes1"], hipo: "frequente", complicacoes: ["olhos"], remedios: 1, remediosPara: ["insulina"], orientacao: "livre" })],
    ["dor forte no joelho", anamneseBase({ dor: 1, dorOnde: [{ r: "joelho", l: "e" }], dorNota: 8, dorQuando: ["sempre"], dorDesde: "ate6s", dorTrauma: 1, tratamento: "fisio" })],
    ["lombar com alerta", anamneseBase({ dor: 1, dorOnde: [{ r: "lombar" }], dorNota: 5, dorQuando: ["movimento"], dorDesde: "mais3m", dorAlerta: ["sela", "neuro"], tratamento: "nao" })],
    ["menor de 16", anamneseBase({ ano: anoParaIdade(16), responsavel: "Maria Souza" }, { consent: { at: RESPONDIDO_EM, source: "aluno_questionario", textId: "c1", responsavel: { nome: "Maria Souza", at: "2026-11-20T10:01:00-03:00" } } })],
    ["menor de 13", anamneseBase({ ano: anoParaIdade(13), responsavel: "João" })],
    ["sem saúde", stripHealth(anamneseBase({ ano: anoParaIdade(71), peso: 81.3 }))],
    ["pressão sem controle", anamneseBase({ condicoes: ["pressao"], pressaoControle: "alta", remedios: 1, remediosPara: ["pressao", "diuretico"], orientacao: "nao" })],
    ["PAR-Q 5 e 6 com termo", anamneseBase({ parq: parq(4, 5) }, { termo: { at: "2026-11-20T10:02:00-03:00", nome: "Ana Souza" } })],
    ["cirurgia com número no texto", anamneseBase({ cirurgia: 1, cirurgiaQual: "joelho em 2025, 2 parafusos" })],
    ["prefere falar pessoalmente", anamneseBase({ condicoes: "pessoal", remedios: "pessoal", orientacao: "nao" })],
    ["junto pela metade", anamneseBase({ parq: undefined, sintomas: undefined, dias: undefined }, { via: "junto", by: "personal", incompleto: ["parq", "treino"] })],
    ["com override e conversei", anamneseBase({ condicoes: ["coracao"], regular: "nao", remedios: "pessoal", orientacao: "nao" }, { overrides: [{ at: "2026-11-21T08:30:00-03:00", alertas: ["A-DOENCA"] }], conversei: { at: "2026-11-21T08:31:00-03:00", alertas: ["A-PESSOAL"] } })],
    ["pós-parto", anamneseBase({ gestacao: "pp12", assoalho: 1, ano: undefined })],
    ["70+ ativo", anamneseBase({ ano: anoParaIdade(78), gestacao: undefined, quedas: 0, instavel: 0, medoCair: 0, condicoes: ["avc"], sintomas: ["cansaco"], orientacao: "restricao", orientacaoQual: "até 3 vezes por semana" })],
    ["outra razão no PAR-Q", anamneseBase({ parq: parq(6, 0), parqDetalhe: "Fiz 2 cateterismos em 2019" })],
  ];

  it("pelo menos 15 fixtures variadas", () => expect(FIXTURES.length).toBeGreaterThanOrEqual(15));

  for (const [nome, an] of FIXTURES) {
    it(`todo número dos textos do resumo vem das respostas, das datas ou de constante com fonte: ${nome}`, () => {
      const r = resumo(an);
      const textos = [
        r.origem,
        r.perfil,
        r.semAlertasTexto ?? "",
        r.sinaisParar ?? "",
        ...r.falta,
        ...r.alertas.flatMap((x) => [x.titulo, x.recomendado, x.base, ...x.porque.flatMap((o) => [o.pergunta, o.resposta])]),
      ];
      const ok = numerosPermitidos(an, HOJE);
      const fora = textos.flatMap((t) => numerosDoTexto(t).filter((n) => !ok.has(n)).map((n) => `${n} em "${t}"`));
      expect(fora).toEqual([]);
    });
  }

  it("um número inventado é pego", () => {
    const ok = numerosPermitidos(anamneseBase(), HOJE);
    expect(numerosDoTexto("Faça 8 séries de 13 repetições").filter((n) => !ok.has(n))).toEqual(["8", "13"]);
    // Sem PAR-Q respondido, "PAR-Q 4" não tem de onde vir.
    expect(numerosPermitidos(stripHealth(anamneseBase()), HOJE).has("4")).toBe(false);
  });

  it("normaliza zeros à esquerda e vírgula", () => {
    expect(numerosDoTexto("05/11 · 72,5 kg · 16.724/2018")).toEqual(["5", "11", "72.5", "16.724", "2018"]);
  });
});
