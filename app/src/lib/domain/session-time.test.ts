import { describe, expect, it } from "vitest";
import {
  activeMinutes,
  ajustarMinutosAtivos,
  cardioNovoMs,
  completude,
  duracaoDoTreino,
  duracaoTexto,
  faixaMinutosAtivos,
  iniciarTempo,
  LIMIAR_PARCIAL,
  MAX_AJUSTE,
  MAX_MINUTOS_BRUTOS,
  minutosAtivosAoFinalizar,
  PAUSA_LONGA_MS,
  registrarAtividade,
  sessionCompleteness,
  tempoFromDraft,
  textoPausa,
  type TempoAtivo,
} from "./session-time";
import type { ExerciseLog, SetLog } from "./types";

/** Rodada 3, Fundação (R3-4): leitores de tempo ativo e completude. A trilha S acrescenta os casos de gravação. */
const t0 = "2026-11-20T10:00:00.000Z";
const depois = (min: number) => new Date(Date.parse(t0) + min * 60_000).toISOString();
const set = (done: boolean, reps: number | null = 10): SetLog => ({ loadKg: 40, reps, done });
const ex = (sets: SetLog[]): ExerciseLog => ({ uid: "u", exerciseId: "supino_reto_barra", name: "Supino", sets });

describe("activeMinutes", () => {
  it("com activeMin: esse valor, mesmo com o fim muito depois do início (30 min ativos + 8 h parado = 30)", () => {
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(30 + 8 * 60), activeMin: 30 })).toBe(30);
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(50), activeMin: 41.6 })).toBe(42);
  });

  it("sessão antiga sem activeMin: a duração bruta só até 180 min; acima, nada", () => {
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(55) })).toBe(55);
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(MAX_MINUTOS_BRUTOS) })).toBe(180);
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(181) })).toBeNull();
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(3 * 24 * 60) })).toBeNull();
  });

  it("relógio ou fuso mudado, data ilegível, sem fim ou zero: nunca negativo, nunca inventa", () => {
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(-20) })).toBeNull();
    expect(activeMinutes({ startedAt: "ontem", finishedAt: depois(10) })).toBeNull();
    expect(activeMinutes({ startedAt: t0, finishedAt: null })).toBeNull();
    expect(activeMinutes({ startedAt: t0 })).toBeNull();
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(0.2) })).toBeNull();
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(40), activeMin: 0 })).toBeNull();
    expect(activeMinutes({ startedAt: t0, finishedAt: depois(40), activeMin: -5 })).toBeNull();
  });
});

describe("sessionCompleteness", () => {
  it("feitas = séries marcadas com reps; planejadas = plannedSets", () => {
    const s = { exercises: [ex([set(true), set(false), set(true, null)])], plannedSets: 24 };
    expect(sessionCompleteness(s)).toEqual({ feitas: 1, planejadas: 24 });
  });

  it("sem plannedSets (sessão antiga ou link antigo): planejadas null, nunca derivada de sets.length", () => {
    expect(sessionCompleteness({ exercises: [ex([set(true), set(false), set(false), set(false)])] })).toEqual({ feitas: 1, planejadas: null });
  });

  it("plannedSets inválido (0, negativo, fração) vira null", () => {
    for (const plannedSets of [0, -3, 2.5, Number.NaN]) expect(sessionCompleteness({ exercises: [], plannedSets }).planejadas).toBeNull();
  });
});

describe("faixaMinutosAtivos (workout_completed.minutos_ativos)", () => {
  it("faixas", () => {
    expect([1, 14, 15, 29, 30, 44, 45, 59, 60, 90, 91, 240].map(faixaMinutosAtivos)).toEqual(["<15", "<15", "15-30", "15-30", "30-45", "30-45", "45-60", "45-60", "60-90", "60-90", ">90", ">90"]);
  });

  it("sem minutos: null", () => {
    expect(faixaMinutosAtivos(null)).toBeNull();
    expect(faixaMinutosAtivos(0)).toBeNull();
    expect(faixaMinutosAtivos(Number.NaN)).toBeNull();
  });
});

// ───────────────────────── Trilha S (R3-4): gravação, rótulos e completude ─────────────────────────

const ms = (min: number) => Date.parse(t0) + min * 60_000;
/** Atividades em minutos desde t0 (marcar série, editar, voltar ao app). */
function relogio(minutos: number[], start = iniciarTempo(t0)): { tempo: TempoAtivo; pausas: number[] } {
  let tempo = start;
  const pausas: number[] = [];
  for (const m of minutos) {
    const r = registrarAtividade(tempo, ms(m));
    tempo = r.tempo;
    if (r.pausaMs) pausas.push(r.pausaMs);
  }
  return { tempo, pausas };
}

describe("relógio do treino (registrarAtividade, minutosAtivosAoFinalizar)", () => {
  it("aceite: 30 min ativos + 8 h parado = 30 min", () => {
    const { tempo, pausas } = relogio([5, 10, 15, 20, 25, 30]);
    expect(minutosAtivosAoFinalizar(tempo, ms(30 + 8 * 60))).toBe(30);
    expect(pausas).toEqual([]);
  });

  it("8 h parado no meio e a pessoa volta: o tempo de antes e o de depois contam, a pausa não (com aviso)", () => {
    const { tempo, pausas } = relogio([10, 20, 20 + 8 * 60, 20 + 8 * 60 + 15]);
    expect(Math.round(tempo.activeMs / 60_000)).toBe(35);
    expect(pausas).toEqual([8 * 60 * 60_000]);
    expect(textoPausa(pausas[0]!)).toBe("Você ficou 8 h fora. Esse tempo não entra no treino.");
  });

  it("troca curta de app e descanso normal não perdem tempo (até 30 min contam inteiros)", () => {
    const { tempo, pausas } = relogio([3, 6, 9, 9 + 4, 9 + 4 + 30]);
    expect(Math.round(tempo.activeMs / 60_000)).toBe(43);
    expect(pausas).toEqual([]);
  });

  it("logo acima de 30 min é pausa; exatamente 30 min ainda conta", () => {
    expect(registrarAtividade(iniciarTempo(t0), ms(30)).pausaMs).toBe(0);
    expect(registrarAtividade(iniciarTempo(t0), ms(30) + 1).pausaMs).toBe(PAUSA_LONGA_MS + 1);
  });

  it("relógio voltou ou fuso mudou: nunca negativo; recomeça a contar de agora", () => {
    const a = registrarAtividade(iniciarTempo(t0), ms(20)).tempo;
    const back = registrarAtividade(a, ms(-60));
    expect(back.tempo.activeMs).toBe(20 * 60_000);
    expect(back.pausaMs).toBe(0);
    expect(back.tempo.lastActivityAt).toBe(new Date(ms(-60)).toISOString());
    // Depois do ajuste, os intervalos seguintes contam a partir da hora nova.
    expect(minutosAtivosAoFinalizar(back.tempo, ms(-50))).toBe(30);
    // O fuso não muda o instante (ISO com Z): a mesma conta em qualquer TZ.
    expect(minutosAtivosAoFinalizar(iniciarTempo("2026-11-20T07:00:00-03:00"), Date.parse("2026-11-20T10:25:00Z"))).toBe(25);
  });

  it("hora ilegível não quebra nem soma", () => {
    expect(registrarAtividade(iniciarTempo(t0), Number.NaN)).toEqual({ tempo: iniciarTempo(t0), pausaMs: 0 });
    const torto = { lastActivityAt: "ontem", activeMs: 60_000, pausedMs: 0 };
    expect(registrarAtividade(torto, ms(5)).tempo.activeMs).toBe(60_000);
  });

  it("cardio longo marcado agora justifica o intervalo (esteira de 40 min não é pausa)", () => {
    const ate = registrarAtividade(iniciarTempo(t0), ms(20)).tempo;
    const esteira = registrarAtividade(ate, ms(20 + 45), 40 * 60_000);
    expect(esteira.pausaMs).toBe(0);
    expect(Math.round(esteira.tempo.activeMs / 60_000)).toBe(65);
    // Cardio de 10 min não cobre 2 h: o que sobra além do cardio é pausa.
    const longo = registrarAtividade(ate, ms(20 + 120), 10 * 60_000);
    expect(longo.pausaMs).toBe(110 * 60_000);
    expect(Math.round(longo.tempo.activeMs / 60_000)).toBe(30);
  });
});

describe("cardioNovoMs", () => {
  const esteira = (done: boolean, reps: number | null): ExerciseLog => ({ uid: "e", exerciseId: "esteira", name: "Esteira", unit: "min", sets: [{ loadKg: null, reps, done }] });
  it("só séries em minutos que acabaram de virar feitas", () => {
    expect(cardioNovoMs({ exercises: [esteira(false, 40)] }, { exercises: [esteira(true, 40)] })).toBe(40 * 60_000);
    expect(cardioNovoMs({ exercises: [esteira(true, 40)] }, { exercises: [esteira(true, 40)] })).toBe(0);
    expect(cardioNovoMs(null, { exercises: [esteira(true, 15)] })).toBe(15 * 60_000);
    expect(cardioNovoMs({ exercises: [] }, { exercises: [ex([set(true)])] })).toBe(0);
  });
});

describe("tempoFromDraft (rascunho gravado)", () => {
  it("válido passa; partes inválidas → undefined (rascunho antigo ou alterado)", () => {
    const t = { lastActivityAt: t0, activeMs: 120_000, pausedMs: 0 };
    expect(tempoFromDraft(t)).toEqual(t);
    expect(tempoFromDraft(undefined)).toBeUndefined();
    expect(tempoFromDraft({ ...t, activeMs: -1 })).toBeUndefined();
    expect(tempoFromDraft({ ...t, pausedMs: "0" })).toBeUndefined();
    expect(tempoFromDraft({ ...t, lastActivityAt: "x" })).toBeUndefined();
    expect(tempoFromDraft([t])).toBeUndefined();
  });
});

describe("textoPausa", () => {
  it("minutos e horas, sem culpa; até 30 min nada", () => {
    expect(textoPausa(45 * 60_000)).toBe("Você ficou 45 min fora. Esse tempo não entra no treino.");
    expect(textoPausa(80 * 60_000)).toBe("Você ficou 1 h 20 min fora. Esse tempo não entra no treino.");
    expect(textoPausa(PAUSA_LONGA_MS)).toBeNull();
    expect(textoPausa(Number.NaN)).toBeNull();
  });
});

describe("duracaoDoTreino e duracaoTexto", () => {
  it("ativos, ajustado e a duração registrada da sessão antiga", () => {
    expect(duracaoTexto(duracaoDoTreino({ startedAt: t0, finishedAt: depois(90), activeMin: 42 }))).toBe("42 min ativos");
    expect(duracaoTexto(duracaoDoTreino({ startedAt: t0, finishedAt: depois(90), activeMin: 40, activeEdited: true }))).toBe("40 min ativos (ajustado)");
    expect(duracaoTexto(duracaoDoTreino({ startedAt: t0, finishedAt: depois(55) }))).toBe("55 min (início ao fim)");
    expect(duracaoTexto(duracaoDoTreino({ startedAt: t0, finishedAt: depois(55) }), { longo: true })).toBe("Duração registrada (início ao fim): 55 min");
    expect(duracaoTexto(duracaoDoTreino({ startedAt: t0, finishedAt: depois(90), activeMin: 42 }), { longo: true })).toBe("42 min ativos");
  });

  it("sessão antiga acima de 180 min: sem minutos (nunca inventa)", () => {
    expect(duracaoDoTreino({ startedAt: t0, finishedAt: depois(181) })).toBeNull();
    expect(duracaoTexto(null)).toBeNull();
  });

  it("activeMin 0 (treino de segundos): sem minutos, e não cai na duração bruta", () => {
    expect(duracaoDoTreino({ startedAt: t0, finishedAt: depois(50), activeMin: 0 })).toBeNull();
  });
});

describe("ajustarMinutosAtivos (correção no resumo final)", () => {
  it("inteiro de 1 a 300 grava activeMin e activeEdited", () => {
    expect(ajustarMinutosAtivos({ activeMin: 55 }, 40)).toEqual({ activeMin: 40, activeEdited: true });
    expect(ajustarMinutosAtivos({}, MAX_AJUSTE)).toEqual({ activeMin: 300, activeEdited: true });
  });
  it("vazio, zero, negativo, fração ou acima do teto: nada muda (null)", () => {
    for (const v of [0, -5, 2.5, Number.NaN, MAX_AJUSTE + 1]) expect(ajustarMinutosAtivos({ activeMin: 55 }, v)).toBeNull();
  });
});

describe("completude (R3-4 item 2: '{feitas} de {planejadas}' e o rótulo 'parcial')", () => {
  const done = (n: number, total: number) => ({ exercises: [ex(Array.from({ length: total }, (_, i) => set(i < n)))] });
  it("aceite: 1 de 24 → '1 de 24 séries' e parcial", () => {
    expect(completude({ ...done(1, 1), plannedSets: 24 })).toEqual({ feitas: 1, planejadas: 24, texto: "1 de 24 séries", parcial: true });
  });
  it("aceite: 23 de 24 → texto sem 'parcial'", () => {
    expect(completude({ ...done(23, 23), plannedSets: 24 })).toMatchObject({ texto: "23 de 24 séries", parcial: false });
  });
  it("limiar: metade exata não é parcial; abaixo é", () => {
    expect(LIMIAR_PARCIAL).toBe(0.5);
    expect(completude({ ...done(12, 12), plannedSets: 24 }).parcial).toBe(false);
    expect(completude({ ...done(11, 11), plannedSets: 24 }).parcial).toBe(true);
  });
  it("sem plannedSets (sessão antiga, link antigo): nenhum número nem rótulo", () => {
    expect(completude(done(1, 4))).toEqual({ feitas: 1, planejadas: null, texto: null, parcial: false });
  });
  it("treino inteiro ou com série a mais: sem texto", () => {
    expect(completude({ ...done(24, 24), plannedSets: 24 }).texto).toBeNull();
    expect(completude({ ...done(26, 26), plannedSets: 24 }).texto).toBeNull();
  });
  it("1 completa + 1 parcial → 1 parcial de 2", () => {
    const sessoes = [{ ...done(24, 24), plannedSets: 24 }, { ...done(2, 2), plannedSets: 24 }];
    expect(sessoes.filter((s) => completude(s).parcial)).toHaveLength(1);
  });
  it("singular", () => {
    expect(completude({ ...done(0, 0), plannedSets: 1 }).texto).toBe("0 de 1 série");
  });
});
