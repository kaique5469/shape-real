import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avisoDePausa,
  dispensarRetomar,
  mostraRetomar,
  nextDayKey,
  RETOMAR_APOS_DIAS,
  retomarDispensadoPara,
  returnNotice,
  textosDoPainel,
  TEXTO_RETOMAR,
  treinoDeHoje,
  ultimoTreinoId,
  ultimoTreinoParcial,
  volumeDaSemana,
} from "@/lib/hooks";
import { RETURN_AFTER_DAYS, volumeDaSessao } from "@/lib/domain/progression";
import type { ExerciseLog, Program, Session, SetLog } from "@/lib/domain/types";

/**
 * Rodada 3, R3-8 (Hoje: treino de hoje registrado, descanso e volta), o volume da semana pela convenção única
 * (R3-6 B) e os textos do painel no modo local (R3-15). Datas no fuso do aparelho, como o Hoje conta.
 */

const local = (day: number, hour = 10, minute = 0, month = 10) => new Date(2026, month, day, hour, minute).toISOString();
const NOW = new Date(2026, 10, 19, 12); // quinta-feira, 19/11/2026, meio-dia local

const feita = (loadKg: number | null, reps: number | null): SetLog => ({ loadKg, reps, done: true });
const aberta = (): SetLog => ({ loadKg: 40, reps: null, done: false });
const log = (exerciseId: string, sets: SetLog[], unit?: ExerciseLog["unit"]): ExerciseLog => ({ uid: `${exerciseId}-${sets.length}`, exerciseId, name: exerciseId, sets, ...(unit ? { unit } : {}) });

function sessao(id: string, startedAt: string, extra: Partial<Session> = {}): Session {
  return { id, userId: "u1", programId: "p1", dayKey: "A", startedAt, finishedAt: startedAt, exercises: [log("supino_reto_barra", [feita(40, 10)])], volumeKg: 0, prs: [], ...extra };
}

/** 1 série feita de 24 planejadas (6 exercícios × 4 séries no rascunho). */
const umaDe24 = (id: string, startedAt: string, dayKey = "B"): Session => sessao(id, startedAt, { dayKey, plannedSets: 24, exercises: [log("supino_reto_barra", [feita(40, 10)])] });

const program: Program = {
  id: "p1",
  ownerId: "u1",
  createdBy: "c1",
  name: "ABC",
  system: "abc" as Program["system"],
  goal: "hipertrofia" as Program["goal"],
  level: "iniciante" as Program["level"],
  daysPerWeek: 3,
  days: ["A", "B", "C"].map((key) => ({ key, title: `Dia ${key}`, focus: [], exercises: [] })),
  active: true,
  source: "personal",
  createdAt: local(1),
  updatedAt: local(1),
};

describe("treinoDeHoje (card 'Treino de hoje registrado')", () => {
  it("treino B de hoje com plannedSets 24 e 1 série feita: 'Treino B registrado hoje · 1 de 24 séries' e o próximo como secundário", () => {
    const sessions = [umaDe24("hoje", local(19, 7)), sessao("ontem", local(18), { dayKey: "A" })];
    expect(treinoDeHoje(sessions, program, NOW)).toEqual({
      titulo: "Treino B registrado hoje",
      completude: "1 de 24 séries",
      linha: "Treino B registrado hoje · 1 de 24 séries",
      proximo: "Próximo: Treino C",
    });
  });

  it("sem plannedSets (sessão antiga ou de link antigo): o mesmo card, sem número", () => {
    const c = treinoDeHoje([sessao("hoje", local(19, 7), { dayKey: "B" })], program, NOW)!;
    expect(c.linha).toBe("Treino B registrado hoje");
    expect(c.completude).toBeNull();
    expect(c.linha).not.toMatch(/\d+ de \d+/);
  });

  it("treino inteiro (24 de 24): sem número (o 'de' só aparece quando ficou faltando)", () => {
    const series = Array.from({ length: 6 }, (_, i) => log(`ex${i}`, [feita(20, 10), feita(20, 10), feita(20, 10), feita(20, 10)]));
    const c = treinoDeHoje([sessao("hoje", local(19, 7), { dayKey: "B", plannedSets: 24, exercises: series })], program, NOW)!;
    expect(c.completude).toBeNull();
    expect(c.linha).toBe("Treino B registrado hoje");
  });

  it("o próximo segue a rotação de sempre (nextDayKey não muda)", () => {
    const sessions = [umaDe24("hoje", local(19, 7), "C")];
    expect(treinoDeHoje(sessions, program, NOW)!.proximo).toBe(`Próximo: Treino ${nextDayKey(program, sessions)}`);
    expect(treinoDeHoje(sessions, program, NOW)!.proximo).toBe("Próximo: Treino A");
  });

  it("treino livre hoje: 'Treino livre registrado hoje'; sem ficha ativa, sem 'Próximo'", () => {
    const c = treinoDeHoje([sessao("livre", local(19, 8), { dayKey: undefined, programId: null })], null, NOW)!;
    expect(c.titulo).toBe("Treino livre registrado hoje");
    expect(c.proximo).toBeNull();
    expect(treinoDeHoje([sessao("livre", local(19, 8))], { ...program, days: [] }, NOW)!.proximo).toBeNull();
  });

  it("dois treinos hoje: '2 treinos registrados hoje', sem completude de um só deles", () => {
    const c = treinoDeHoje([umaDe24("manha", local(19, 7)), sessao("tarde", local(19, 18), { dayKey: "C" })], program, new Date(2026, 10, 19, 20))!;
    expect(c.titulo).toBe("2 treinos registrados hoje");
    expect(c.completude).toBeNull();
  });

  it("fuso: treino às 23h30 é de hoje no aparelho, mesmo já sendo amanhã em UTC; o de ontem às 23h59 não é", () => {
    const noite = new Date(2026, 10, 19, 23, 45);
    expect(treinoDeHoje([sessao("s", local(19, 23, 30))], program, noite)).not.toBeNull();
    expect(treinoDeHoje([sessao("s", local(18, 23, 59))], program, new Date(2026, 10, 19, 0, 5))).toBeNull();
  });

  it("sem treino hoje (0, 1 de ontem, muitos antigos): null, o Hoje fica como era", () => {
    expect(treinoDeHoje([], program, NOW)).toBeNull();
    expect(treinoDeHoje([sessao("ontem", local(18))], program, NOW)).toBeNull();
    expect(treinoDeHoje(Array.from({ length: 60 }, (_, i) => sessao(`s${i}`, local(1 + (i % 17)))), program, NOW)).toBeNull();
  });

  it("relógio mudado e registro estragado: treino datado amanhã ou com data ilegível nunca vira 'hoje'", () => {
    expect(treinoDeHoje([sessao("futuro", local(20, 9))], program, NOW)).toBeNull();
    expect(treinoDeHoje([sessao("ruim", "ontem à noite")], program, NOW)).toBeNull();
  });

  it("teste negativo: nenhum texto do card oferece 'Continuar' (abrir /sessao de novo criaria outra sessão no mesmo dia)", () => {
    const c = treinoDeHoje([umaDe24("hoje", local(19, 7))], program, NOW)!;
    expect(Object.values(c).join(" ")).not.toMatch(/continuar/i);
  });
});

describe("ultimoTreinoParcial", () => {
  it("último treino (de ontem) com 1 de 24: 'Treino A ficou parcial (1 de 24). Próximo: Treino B.'", () => {
    expect(ultimoTreinoParcial([umaDe24("ontem", local(18), "A")], program, NOW)).toBe("Treino A ficou parcial (1 de 24). Próximo: Treino B.");
  });

  it("23 de 24 não é 'parcial' (limiar da R3-4); sem plannedSets, nada", () => {
    const quase = sessao("q", local(18), { plannedSets: 24, exercises: [log("supino_reto_barra", Array.from({ length: 23 }, () => feita(40, 10)).concat([aberta()]))] });
    expect(ultimoTreinoParcial([quase], program, NOW)).toBeNull();
    expect(ultimoTreinoParcial([sessao("antiga", local(18))], program, NOW)).toBeNull();
  });

  it("parcial de hoje fica no card de hoje; parcial há 7 dias ou mais dá lugar ao convite de retomar", () => {
    expect(ultimoTreinoParcial([umaDe24("hoje", local(19, 7))], program, NOW)).toBeNull();
    expect(ultimoTreinoParcial([umaDe24("antiga", local(12))], program, NOW)).toBeNull();
    expect(ultimoTreinoParcial([umaDe24("seis", local(13))], program, NOW)).not.toBeNull();
  });

  it("só o ÚLTIMO treino conta: parcial antigo seguido de um treino completo não aparece", () => {
    expect(ultimoTreinoParcial([umaDe24("velho", local(16), "A"), sessao("novo", local(18), { dayKey: "B" })], program, NOW)).toBeNull();
  });

  it("treino livre parcial e sem ficha: sem 'Próximo'", () => {
    expect(ultimoTreinoParcial([sessao("l", local(18), { dayKey: undefined, plannedSets: 10, exercises: [log("flexao", [feita(0, 10)])] })], null, NOW)).toBe("Treino livre ficou parcial (1 de 10).");
  });
});

describe("avisoDePausa (7 a 13 dias: retomar; 14 ou mais: o aviso de volta de sempre)", () => {
  it("limites: 6 dias nada; 7 e 8 dias o convite; 13 ainda o convite; 14 o aviso atual", () => {
    expect(RETOMAR_APOS_DIAS).toBe(7);
    expect(RETURN_AFTER_DAYS).toBe(14);
    expect(avisoDePausa([sessao("a", local(13))], NOW)).toBeNull();
    expect(avisoDePausa([sessao("a", local(12))], NOW)).toEqual({ tipo: "retomar", dias: 7, texto: TEXTO_RETOMAR });
    expect(avisoDePausa([sessao("a", local(11))], NOW)).toEqual({ tipo: "retomar", dias: 8, texto: "Faz alguns dias que você não registra. Quer retomar ou ajustar a rotina?" });
    expect(avisoDePausa([sessao("a", local(6, 23))], new Date(2026, 10, 19, 7))).toMatchObject({ tipo: "retomar", dias: 13 });
    expect(avisoDePausa([sessao("a", local(5, 23))], new Date(2026, 10, 19, 7))).toEqual({
      tipo: "volta",
      dias: 14,
      texto: "Faz 14 dias desde o último treino. Hoje as cargas sugeridas vêm mais leves.",
    });
  });

  it("o convite é sem culpa: nada de 'você parou', 'sumiu', 'falhou' nem cobrança", () => {
    expect(TEXTO_RETOMAR).not.toMatch(/parou|sumiu|falhou|deveria|precisa|!/i);
  });

  it("conta dias de calendário no fuso do aparelho (treino às 23h de 7 dias atrás já conta 7)", () => {
    expect(avisoDePausa([sessao("a", local(12, 23, 50))], new Date(2026, 10, 19, 0, 10))).toMatchObject({ tipo: "retomar", dias: 7 });
  });

  it("vale o treino mais recente, em qualquer ordem; nenhum treino: null", () => {
    expect(avisoDePausa([sessao("velho", local(1)), sessao("novo", local(17))], NOW)).toBeNull();
    expect(avisoDePausa([sessao("novo", local(10)), sessao("velho", local(1))], NOW)).toMatchObject({ tipo: "retomar", dias: 9 });
    expect(avisoDePausa([], NOW)).toBeNull();
  });

  it("relógio mudado: treino no futuro não inventa pausa; data ilegível é ignorada", () => {
    expect(avisoDePausa([sessao("velho", local(1)), sessao("futuro", local(25))], NOW)).toBeNull();
    expect(avisoDePausa([sessao("ruim", "x")], NOW)).toBeNull();
    expect(avisoDePausa([sessao("ruim", "x"), sessao("velho", local(10))], NOW)).toMatchObject({ dias: 9 });
  });

  it("returnNotice continua igual: só o aviso de 14 dias ou mais", () => {
    expect(returnNotice([sessao("a", local(11))], NOW)).toBeNull();
    expect(returnNotice([sessao("a", local(3, 18)), sessao("b", local(1))], new Date(2026, 10, 19, 8))).toBe("Faz 16 dias desde o último treino. Hoje as cargas sugeridas vêm mais leves.");
  });
});

describe("volumeDaSemana ('Sua semana' sem meta: lê volumeDaSessao, nunca s.volumeKg)", () => {
  const supino = log("supino_reto_barra", [feita(40, 10), feita(40, 10), feita(40, 10)]);
  const pranchaSeg = log("prancha", [feita(10, 60), feita(10, 60), feita(10, 60)], "seg");
  const assistida = log("barra_fixa_assistida", [feita(40, 8), feita(40, 8), feita(40, 8)]);

  it("sessão gravada com volumeKg antigo (prancha e assistida contadas) mostra o valor da função: 1.200 kg", () => {
    const s = sessao("s", local(17), { exercises: [supino, pranchaSeg, assistida], volumeKg: 1200 + 1800 + 960 });
    expect(volumeDaSessao(s)).toBe(1200);
    expect(volumeDaSemana([s], NOW)).toBe(1200);
  });

  it("só segunda a domingo da semana atual, no fuso do aparelho", () => {
    const seg = sessao("seg", local(16, 7), { exercises: [supino] });
    const domAnterior = sessao("dom", local(15, 22), { exercises: [supino] });
    expect(volumeDaSemana([seg, domAnterior], NOW)).toBe(1200);
    // Domingo 22/11 às 23h30 ainda é desta semana; segunda 23/11 já é outra.
    const domingo = sessao("d", local(22, 23, 30), { exercises: [supino] });
    expect(volumeDaSemana([domingo], new Date(2026, 10, 22, 23, 45))).toBe(1200);
    expect(volumeDaSemana([domingo], new Date(2026, 10, 23, 8))).toBe(0);
  });

  it("0, 1 e muitos treinos; data ilegível não soma", () => {
    expect(volumeDaSemana([], NOW)).toBe(0);
    const muitos = Array.from({ length: 30 }, (_, i) => sessao(`s${i}`, local(16 + (i % 4), 6 + (i % 10)), { exercises: [supino] }));
    expect(volumeDaSemana(muitos, NOW)).toBe(30 * 1200);
    expect(volumeDaSemana([sessao("ruim", "x", { exercises: [supino], volumeKg: 999 })], NOW)).toBe(0);
  });
});

describe("textosDoPainel (R3-15, /alunos)", () => {
  it("modo local fala em treino mandado, nunca em 'treinou'", () => {
    const t = textosDoPainel(true);
    expect(t.sub).toBe("Quem mandou treino, quem está com a ficha vencendo e quem está sem notícias.");
    expect(t.semana).toBe("Mandaram treino na semana");
    expect(`${t.sub} ${t.semana}`).not.toMatch(/treinou|treinaram/i);
  });

  it("teste negativo: na nuvem, os textos de antes", () => {
    expect(textosDoPainel(false)).toEqual({ sub: "Quem treinou, quem está com a ficha vencendo e quem precisa de um empurrão.", semana: "Treinaram na semana" });
  });
});

describe("convite de retomar dispensável (R3-8)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** localStorage em memória; `quebrado` = acesso que lança (janela privada, armazenamento bloqueado). */
  function armazenamento(quebrado = false) {
    const m = new Map<string, string>();
    const falha = () => {
      throw new Error("bloqueado");
    };
    vi.stubGlobal("localStorage", {
      getItem: quebrado ? falha : (k: string) => m.get(k) ?? null,
      setItem: quebrado ? falha : (k: string, v: string) => void m.set(k, v),
    });
    return m;
  }

  it("ultimoTreinoId: o de início mais recente, pela data (não pela ordem da lista); data ilegível fica fora", () => {
    expect(ultimoTreinoId([])).toBeNull();
    expect(ultimoTreinoId([sessao("a", local(10)), sessao("b", local(12)), sessao("c", local(11))])).toBe("b");
    expect(ultimoTreinoId([sessao("ruim", "x"), sessao("ok", local(1))])).toBe("ok");
  });

  it("aparece com 7 a 13 dias; some depois de dispensado para o mesmo último treino", () => {
    const sessions = [sessao("velho", local(11))];
    const aviso = avisoDePausa(sessions, NOW);
    expect(aviso?.tipo).toBe("retomar");
    expect(mostraRetomar(aviso, "velho", null)).toBe(true);
    expect(mostraRetomar(aviso, "velho", "velho")).toBe(false);
  });

  it("um treino novo e outra pausa trazem o convite de volta", () => {
    const depois = [sessao("novo", local(11)), sessao("velho", local(1))];
    expect(mostraRetomar(avisoDePausa(depois, NOW), ultimoTreinoId(depois), "velho")).toBe(true);
  });

  it("teste negativo: nunca com o aviso de volta (14+) nem sem pausa", () => {
    expect(mostraRetomar(avisoDePausa([sessao("v", local(1))], NOW), "v", null)).toBe(false);
    expect(mostraRetomar(avisoDePausa([sessao("r", local(18))], NOW), "r", null)).toBe(false);
    expect(mostraRetomar(null, null, null)).toBe(false);
  });

  it("grava só o id do último treino, por pessoa, fora de sr:v1:* (não entra na cópia nem no formato dos dados)", () => {
    const m = armazenamento();
    expect(retomarDispensadoPara("u1")).toBeNull();
    expect(dispensarRetomar("u1", "s-123")).toBe(true);
    expect(retomarDispensadoPara("u1")).toBe("s-123");
    expect(retomarDispensadoPara("u2")).toBeNull();
    expect([...m.keys()]).toEqual(["sr:hoje-retomar:u1"]);
    expect([...m.values()]).toEqual(["s-123"]);
  });

  it("sem armazenamento: não quebra (o convite só volta a aparecer)", () => {
    armazenamento(true);
    expect(retomarDispensadoPara("u1")).toBeNull();
    expect(dispensarRetomar("u1", "s-1")).toBe(false);
  });
});
