import { afterEach, describe, expect, it, vi } from "vitest";
import { simulateSessions } from "@/lib/data/demo";
import { generateProgram, type GenerateInput } from "./generator";
import {
  bestMarkOf,
  compareMarks,
  comparisonDates,
  comparisonLabels,
  deltaLine,
  exerciseMarks,
  exerciseProgress,
  markDeltaPct,
  progressExercises,
  progressKind,
  sessionMark,
  strengthIndicator,
  type ExerciseProgress,
} from "./evolution";
import type { ExerciseLog, Goal, Level, MuscleGroup, SetLog, Session, SystemId, Unit } from "./types";

// Datas montadas no fuso do aparelho: o teste vale em qualquer fuso (a data da marca é o dia local).
const day = (d: number, month = 10, hour = 18) => new Date(2026, month, d, hour, 0).toISOString();

let n = 0;
type S = [number, number];
function log(exerciseId: string, sets: S[], extra: Partial<ExerciseLog> = {}): ExerciseLog {
  return { uid: `l${n++}`, exerciseId, name: exerciseId, sets: sets.map(([loadKg, reps]): SetLog => ({ loadKg, reps, done: true })), ...extra };
}
function session(startedAt: string, exercises: ExerciseLog[], prs: string[] = []): Session {
  return { id: `s${n++}`, userId: "u1", startedAt, exercises, volumeKg: 0, prs };
}
/** Um treino por dia (1, 2, 3… de novembro), uma série por treino. */
function series(exerciseId: string, marks: S[], extra: Partial<ExerciseLog> = {}): Session[] {
  return marks.map((m, i) => session(day(i + 1), [log(exerciseId, [m], extra)]));
}
const progress = (exerciseId: string, marks: S[], extra: Partial<ExerciseLog> = {}) => exerciseProgress(series(exerciseId, marks, extra), exerciseId)!;
const marksOf = (p: ExerciseProgress) => p.marks.map((m) => [m.mark.loadKg, m.mark.reps]);
const set = (loadKg: number, reps: number): SetLog => ({ loadKg, reps, done: true });

describe("tipo de progresso (R-2)", () => {
  it("barra, halter, máquina e caneleira com carga → força; sem carga → reps", () => {
    expect(progressKind("supino_reto_barra", "reps", [set(40, 8)])).toBe("forca");
    expect(progressKind("gluteo_4_apoios_caneleira", "reps", [set(3, 12)])).toBe("forca");
    expect(progressKind("gluteo_4_apoios_caneleira", "reps", [set(0, 15)])).toBe("reps");
    expect(progressKind("exercicio_custom_desconhecido", "reps", [set(10, 10)])).toBe("forca");
  });

  it("peso do corpo e elástico com carga → duplo; segundos → tempo ou duplo; graviton → ajuda; minutos → fora", () => {
    expect(progressKind("barra_fixa", "reps", [set(0, 5)])).toBe("reps");
    expect(progressKind("barra_fixa", "reps", [set(0, 5), set(10, 5)])).toBe("duplo");
    expect(progressKind("prancha", "seg", [set(0, 45)])).toBe("tempo");
    expect(progressKind("farmer_walk", "seg", [set(20, 40)])).toBe("duplo");
    expect(progressKind("barra_fixa_assistida", "reps", [set(40, 8)])).toBe("ajuda");
    expect(progressKind("esteira_caminhada", "min", [set(0, 30)])).toBeNull();
  });

  it("série não feita não conta como carga", () => {
    expect(progressKind("barra_fixa", "reps", [set(0, 5), { loadKg: 10, reps: 5, done: false }])).toBe("reps");
  });
});

describe("marca do treino (R-3)", () => {
  it("força: maior 1RM estimado; empate pelo teto de 12 reps vai para mais reps", () => {
    expect(sessionMark(log("supino_reto_barra", [[40, 20], [60, 8]]), "forca")).toEqual({ loadKg: 60, reps: 8 });
    expect(sessionMark(log("supino_reto_barra", [[25, 10], [25, 20]]), "forca")).toEqual({ loadKg: 25, reps: 20 });
    expect(sessionMark(log("gluteo_4_apoios_caneleira", [[3, 15], [3, 14], [3, 14]]), "forca")).toEqual({ loadKg: 3, reps: 15 });
  });

  it("força: a guarda de digitação dentro do treino tira a série errada (14 / 140 / 14)", () => {
    expect(sessionMark(log("rosca_direta_barra", [[14, 10], [140, 10], [14, 10]]), "forca")).toEqual({ loadKg: 14, reps: 10 });
  });

  it("força sem série com carga: o treino não conta", () => {
    expect(sessionMark(log("supino_reto_barra", [[0, 10]]), "forca")).toBeNull();
  });

  it("ajuda: menos ajuda entre as séries com o mínimo de reps; série abaixo do mínimo não conta", () => {
    const planned = { sets: 3, repsMin: 8, repsMax: 12 };
    expect(sessionMark(log("barra_fixa_assistida", [[40, 8], [30, 5], [35, 8]], { planned }), "ajuda")).toEqual({ loadKg: 35, reps: 8 });
    expect(sessionMark(log("barra_fixa_assistida", [[30, 5]], { planned }), "ajuda")).toBeNull();
    expect(sessionMark(log("barra_fixa_assistida", [[30, 5]]), "ajuda")).toEqual({ loadKg: 30, reps: 5 });
  });

  it("duplo: a de mais carga; reps e tempo: a de mais reps", () => {
    expect(sessionMark(log("barra_fixa", [[10, 5], [0, 8]]), "duplo")).toEqual({ loadKg: 10, reps: 5 });
    expect(sessionMark(log("barra_fixa", [[0, 7], [0, 6]]), "reps")).toEqual({ loadKg: 0, reps: 7 });
    expect(sessionMark(log("prancha", [[0, 45], [0, 60]], { unit: "seg" }), "tempo")).toEqual({ loadKg: 0, reps: 60 });
  });
});

describe("comparação (R-6 a R-8, R-11, R-12)", () => {
  it("27,5 × 8 → 27,5 × 12: subiu, +11%, \"+4 reps com a mesma carga\"", () => {
    const p = progress("stiff", [[27.5, 8], [27.5, 12]]);
    expect(p.kind).toBe("forca");
    expect(p.comparison).toMatchObject({ state: "ok", direction: "subiu", deltaPct: 11 });
    expect(deltaLine(p.kind, p.comparison.first.mark, p.comparison.last!.mark, p.unit)).toBe("+4 reps com a mesma carga");
    expect(strengthIndicator(p.comparison)).toBe("Força estimada (1RM): +11%");
  });

  it("90 × 3 → 105 × 4: \"+15 kg e +1 rep\", +20%", () => {
    const p = progress("agachamento_livre", [[90, 3], [105, 4]]);
    expect(p.comparison.deltaPct).toBe(20);
    expect(deltaLine("forca", p.comparison.first.mark, p.comparison.last!.mark, "reps")).toBe("+15 kg e +1 rep");
    expect(p.chart?.metric).toBe("e1rm");
  });

  it("100 × 5 → 105 × 3: caiu, −1%, \"+5 kg e −2 reps\" (sinais opostos: decide o 1RM)", () => {
    const p = progress("supino_reto_barra", [[100, 5], [105, 3]]);
    expect(p.comparison).toMatchObject({ direction: "caiu", deltaPct: -1 });
    expect(deltaLine("forca", { loadKg: 100, reps: 5 }, { loadKg: 105, reps: 3 }, "reps")).toBe("+5 kg e −2 reps");
    expect(strengthIndicator(p.comparison)).toBe("Força estimada (1RM): −1%");
  });

  it("indicador: arredondou para 0 → \"menos de 1% de diferença\"; sem % → null", () => {
    expect(strengthIndicator({ deltaPct: 0 })).toBe("Força estimada (1RM): menos de 1% de diferença");
    expect(strengthIndicator({ deltaPct: null })).toBeNull();
    expect(markDeltaPct({ loadKg: 100, reps: 10 }, { loadKg: 100.5, reps: 10 })).toBe(1);
    expect(markDeltaPct({ loadKg: 100, reps: 10 }, { loadKg: 100.2, reps: 10 })).toBe(0);
    expect(Object.is(markDeltaPct({ loadKg: 100.2, reps: 10 }, { loadKg: 100, reps: 10 }), -0)).toBe(false);
  });

  it("mesma carga e mesmas reps: igual", () => {
    expect(compareMarks({ loadKg: 40, reps: 8 }, { loadKg: 40, reps: 8 }, "forca")).toBe("igual");
    expect(deltaLine("forca", { loadKg: 40, reps: 8 }, { loadKg: 40, reps: 8 }, "reps")).toBe("Mesma carga e mesmas reps");
    expect(deltaLine("forca", { loadKg: 40, reps: 8 }, { loadKg: 42.5, reps: 8 }, "reps")).toBe("+2,5 kg com as mesmas reps");
    expect(deltaLine("forca", { loadKg: 42.5, reps: 8 }, { loadKg: 40, reps: 7 }, "reps")).toBe("−2,5 kg e −1 rep");
  });

  it("um registro: uma sessão, ou duas no mesmo dia", () => {
    const one = progress("supino_reto_barra", [[50, 8]]);
    expect(one.comparison).toMatchObject({ state: "um_registro", last: null, best: null, direction: null, deltaPct: null });
    expect(one.comparison.first.mark).toEqual({ loadKg: 50, reps: 8 });
    expect(one.chart).toBeNull();
    expect(one.noChartReason).toBe("um_registro");

    const sameDay = [session(day(12, 8, 8), [log("supino_reto_barra", [[50, 8]])]), session(day(12, 8, 19), [log("supino_reto_barra", [[52.5, 8]])])];
    const p = exerciseProgress(sameDay, "supino_reto_barra")!;
    expect(p.marks).toHaveLength(2);
    expect(p.comparison.state).toBe("um_registro");
  });
});

describe("melhor marca (R-9)", () => {
  it("60, 70, 65 (× 8) → a melhor é 70", () => {
    const p = progress("supino_reto_barra", [[60, 8], [70, 8], [65, 8]]);
    expect(p.comparison.best?.mark).toEqual({ loadKg: 70, reps: 8 });
  });

  it("a última é a melhor, ou a primeira é a melhor → nenhuma", () => {
    expect(progress("supino_reto_barra", [[60, 8], [65, 8], [70, 8]]).comparison.best).toBeNull();
    expect(progress("supino_reto_barra", [[70, 8], [60, 8], [65, 8]]).comparison.best).toBeNull();
  });

  it("3 × 12, 3 × 15, 3 × 17 → nenhuma: a 3 × 17 é a última", () => {
    expect(progress("gluteo_4_apoios_caneleira", [[3, 12], [3, 15], [3, 17]]).comparison.best).toBeNull();
  });

  it("3 × 12, 3 × 17, 3 × 15 → 3 × 17: com o teto de 12, o desempate por reps vence o \"mais antiga\"", () => {
    const p = progress("gluteo_4_apoios_caneleira", [[3, 12], [3, 17], [3, 15]]);
    expect(p.comparison.best?.mark).toEqual({ loadKg: 3, reps: 17 });
  });

  it("empate total: a mais antiga; duplo: nenhuma", () => {
    const marks = series("supino_reto_barra", [[60, 8], [60, 8]]).map((s, i) => ({ sessionId: s.id, startedAt: s.startedAt, date: `2026-11-0${i + 1}`, mark: { loadKg: 60, reps: 8 }, e1rm: 76, record: false, suspect: false }));
    expect(bestMarkOf(marks, "forca")).toBe(marks[0]);
    expect(bestMarkOf(marks, "duplo")).toBeNull();
  });
});

describe("marca suspeita entre treinos (R-5)", () => {
  it("40, 42,5, 100 (× 8): a última fica fora e ganha aviso; a comparação usa 40 → 42,5", () => {
    const p = progress("supino_reto_barra", [[40, 8], [42.5, 8], [100, 8]]);
    expect(p.comparison.suspectLatest?.mark).toEqual({ loadKg: 100, reps: 8 });
    expect(p.comparison.last?.mark).toEqual({ loadKg: 42.5, reps: 8 });
    expect(p.comparison.direction).toBe("subiu");
    expect(p.comparison.deltaPct).toBe(6);
    expect(p.comparison.best?.mark.loadKg).not.toBe(100);
    expect(p.chart?.points.map((x) => x.value)).not.toContain(p.marks[2]!.e1rm);
    expect(p.chart?.points).toHaveLength(2);
    expect(p.marks.map((m) => m.suspect)).toEqual([false, false, true]);
  });

  it("20, 20, 200, 22: a de 200 fica suspeita no meio, sem aviso; a última válida é 22", () => {
    const p = progress("agachamento_smith", [[20, 10], [20, 10], [200, 10], [22, 10]]);
    expect(p.marks.map((m) => m.suspect)).toEqual([false, false, true, false]);
    expect(p.comparison.suspectLatest).toBeNull();
    expect(p.comparison.last?.mark).toEqual({ loadKg: 22, reps: 10 });
    expect(p.marks).toHaveLength(4); // "(4 treinos)": válidas e suspeitas
  });

  it("10, 25: não é suspeita (a maior anterior não chega a 20 kg)", () => {
    const p = progress("rosca_direta_barra", [[10, 10], [25, 10]]);
    expect(p.marks.some((m) => m.suspect)).toBe(false);
    expect(p.comparison.last?.mark.loadKg).toBe(25);
  });

  it("a suspeita não sobe o máximo: 20, 200, 40, 81 → 40 vale (até 2 × 20) e 81 é suspeita (mais de 2 × 40)", () => {
    const p = progress("agachamento_smith", [[20, 10], [200, 10], [40, 10], [81, 10]]);
    expect(p.marks.map((m) => m.suspect)).toEqual([false, true, false, true]);
  });
});

describe("muitas repetições, graviton, peso do corpo e tempo", () => {
  it("3 × 12 a 3 × 17: subiu, sem %, sem gráfico (reps_altas)", () => {
    const p = progress("gluteo_4_apoios_caneleira", [[3, 12], [3, 13], [3, 14], [3, 15], [3, 16], [3, 17]]);
    expect(p.kind).toBe("forca");
    expect(p.comparison).toMatchObject({ direction: "subiu", deltaPct: null });
    expect(p.chart).toBeNull();
    expect(p.noChartReason).toBe("reps_altas");
    expect(deltaLine(p.kind, p.comparison.first.mark, p.comparison.last!.mark, p.unit)).toBe("+5 reps com a mesma carga");
    expect(strengthIndicator(p.comparison)).toBeNull();
  });

  it("gráfico de força quando metade ou mais das marcas tem até 12 reps", () => {
    const p = progress("gluteo_4_apoios_caneleira", [[3, 10], [3, 12], [3, 14], [3, 15]]);
    expect(p.chart?.metric).toBe("e1rm");
    expect(p.chart?.points).toHaveLength(4);
  });

  it("graviton 40 × 8 → 35 × 8: ajuda, \"5 kg a menos de ajuda\", sem gráfico", () => {
    const p = progress("barra_fixa_assistida", [[40, 8], [35, 8]]);
    expect(p.kind).toBe("ajuda");
    expect(p.comparison).toMatchObject({ direction: "subiu", deltaPct: null });
    expect(deltaLine("ajuda", p.comparison.first.mark, p.comparison.last!.mark, p.unit)).toBe("5 kg a menos de ajuda");
    expect(p.chart).toBeNull();
    expect(p.noChartReason).toBe("ajuda");
    expect(p.marks.every((m) => m.e1rm === null)).toBe(true);
  });

  it("graviton 40 × 8 → 50 × 10: caiu, \"10 kg a mais de ajuda e +2 reps\"", () => {
    const p = progress("barra_fixa_assistida", [[40, 8], [50, 10]]);
    expect(p.comparison.direction).toBe("caiu");
    expect(deltaLine("ajuda", p.comparison.first.mark, p.comparison.last!.mark, p.unit)).toBe("10 kg a mais de ajuda e +2 reps");
    expect(deltaLine("ajuda", { loadKg: 40, reps: 8 }, { loadKg: 40, reps: 10 }, "reps")).toBe("+2 reps com a mesma ajuda");
    expect(deltaLine("ajuda", { loadKg: 40, reps: 8 }, { loadKg: 40, reps: 8 }, "reps")).toBe("Mesma ajuda e mesmas reps");
  });

  it("graviton: treino só com séries abaixo do mínimo da faixa não conta", () => {
    const planned = { sets: 3, repsMin: 8, repsMax: 12 };
    const sessions = [session(day(1), [log("barra_fixa_assistida", [[40, 8]], { planned })]), session(day(2), [log("barra_fixa_assistida", [[20, 4]], { planned })])];
    const p = exerciseProgress(sessions, "barra_fixa_assistida")!;
    expect(p.marks).toHaveLength(1);
    expect(p.comparison.state).toBe("um_registro");
  });

  it("peso do corpo 0 × 5 → 0 × 7: \"+2 reps na melhor série\", gráfico de reps", () => {
    const p = progress("barra_fixa", [[0, 5], [0, 7]]);
    expect(p.kind).toBe("reps");
    expect(deltaLine(p.kind, p.comparison.first.mark, p.comparison.last!.mark, p.unit)).toBe("+2 reps na melhor série");
    expect(p.chart).toEqual({ metric: "reps", points: [{ date: "2026-11-01", value: 5 }, { date: "2026-11-02", value: 7 }] });
    expect(deltaLine("reps", { loadKg: 0, reps: 7 }, { loadKg: 0, reps: 5 }, "reps")).toBe("−2 reps na melhor série");
    expect(deltaLine("reps", { loadKg: 0, reps: 7 }, { loadKg: 0, reps: 7 }, "reps")).toBe("Mesmas reps na melhor série");
  });

  it("duplo 0 × 5, 0 × 7, 10 × 5: \"+10 kg com as mesmas reps\", subiu, sem melhor marca e sem gráfico", () => {
    const p = progress("barra_fixa", [[0, 5], [0, 7], [10, 5]]);
    expect(p.kind).toBe("duplo");
    expect(p.marks).toHaveLength(3);
    expect(p.comparison).toMatchObject({ direction: "subiu", best: null, deltaPct: null });
    expect(deltaLine(p.kind, p.comparison.first.mark, p.comparison.last!.mark, p.unit)).toBe("+10 kg com as mesmas reps");
    expect(p.chart).toBeNull();
    expect(p.noChartReason).toBe("duplo");
  });

  it("duplo 10 × 3 → 0 × 8: indefinido", () => {
    expect(progress("barra_fixa", [[10, 3], [0, 8]]).comparison.direction).toBe("indefinido");
  });

  it("tempo 0 × 45 → 0 × 60: \"+15 s na melhor série\"; com carga vira duplo, \"+10 kg e +15 s\"", () => {
    const t = progress("prancha", [[0, 45], [0, 60]], { unit: "seg" });
    expect(t.kind).toBe("tempo");
    expect(deltaLine(t.kind, t.comparison.first.mark, t.comparison.last!.mark, t.unit)).toBe("+15 s na melhor série");
    expect(t.chart?.metric).toBe("seg");
    const d = progress("prancha", [[0, 45], [10, 60]], { unit: "seg" });
    expect(d.kind).toBe("duplo");
    expect(deltaLine(d.kind, d.comparison.first.mark, d.comparison.last!.mark, d.unit)).toBe("+10 kg e +15 s");
    expect(deltaLine("duplo", { loadKg: 20, reps: 40 }, { loadKg: 24, reps: 40 }, "seg")).toBe("+4 kg no mesmo tempo");
    expect(deltaLine("duplo", { loadKg: 20, reps: 40 }, { loadKg: 20, reps: 55 }, "seg")).toBe("+15 s com a mesma carga");
    expect(deltaLine("duplo", { loadKg: 20, reps: 40 }, { loadKg: 20, reps: 40 }, "seg")).toBe("Mesma carga e mesmo tempo");
    expect(deltaLine("tempo", { loadKg: 0, reps: 60 }, { loadKg: 0, reps: 50 }, "seg")).toBe("−10 s na melhor série");
    expect(deltaLine("tempo", { loadKg: 0, reps: 60 }, { loadKg: 0, reps: 60 }, "seg")).toBe("Mesmo tempo na melhor série");
  });

  it("aeróbio em minutos fica fora", () => {
    expect(progress("esteira_caminhada", [[0, 30], [0, 40]], { unit: "min" })).toBeNull();
  });
});

describe("registros considerados (R-1, R-4) e datas", () => {
  it("carga não digitada: 30, 0, 35 → força com 2 marcas; tudo 0 → reps", () => {
    const p = progress("supino_reto_barra", [[30, 10], [0, 10], [35, 10]]);
    expect(p.kind).toBe("forca");
    expect(marksOf(p)).toEqual([
      [30, 10],
      [35, 10],
    ]);
    expect(progress("supino_reto_barra", [[0, 10], [0, 12]]).kind).toBe("reps");
  });

  it("unidade trocada no meio do histórico: vale a do registro mais recente, e o nome também", () => {
    const sessions = [
      session(day(1), [log("prancha", [[0, 12]], { unit: "reps", name: "Prancha (antiga)" })]),
      session(day(2), [log("prancha", [[0, 45]], { unit: "seg", name: "Prancha" })]),
      session(day(3), [log("prancha", [[0, 60]], { unit: "seg", name: "Prancha" })]),
    ];
    const p = exerciseProgress(sessions, "prancha")!;
    expect(p.unit).toBe("seg" satisfies Unit);
    expect(p.name).toBe("Prancha");
    expect(marksOf(p)).toEqual([
      [0, 45],
      [0, 60],
    ]);
  });

  it("por treino, o 1º registro do exercício com séries feitas; treino sem séries feitas não conta", () => {
    const sessions = [
      session(day(1), [log("supino_reto_barra", [[40, 8]]), log("supino_reto_barra", [[60, 8]])]),
      session(day(2), [{ ...log("supino_reto_barra", [[50, 8]]), sets: [{ loadKg: 50, reps: 8, done: false }] }]),
      session(day(3), [log("supino_reto_barra", [[45, 8]])], ["supino_reto_barra"]),
    ];
    const p = exerciseProgress(sessions, "supino_reto_barra")!;
    expect(marksOf(p)).toEqual([
      [40, 8],
      [45, 8],
    ]);
    expect(p.marks.map((m) => m.record)).toEqual([false, true]);
    expect(p.marks[1]!.e1rm).toBe(57);
  });

  it("as marcas vão do mais antigo ao mais recente, mesmo com a lista fora de ordem", () => {
    const sessions = series("supino_reto_barra", [[40, 8], [45, 8], [50, 8]]).reverse();
    expect(marksOf(exerciseProgress(sessions, "supino_reto_barra")!)).toEqual([
      [40, 8],
      [45, 8],
      [50, 8],
    ]);
  });

  it("data local: treino às 22h de 20/11 continua em 20/11 (em São Paulo, 01:00Z de 21/11)", () => {
    const late = new Date(2026, 10, 20, 22, 0).toISOString();
    const h = exerciseMarks([session(late, [log("supino_reto_barra", [[40, 8]])])], "supino_reto_barra")!;
    expect(h.marks[0]!.date).toBe("2026-11-20");
  });

  it("sem registro do exercício → null", () => {
    expect(exerciseProgress([session(day(1), [log("supino_reto_barra", [[40, 8]])])], "agachamento_livre")).toBeNull();
  });

  it("datas da comparação: dd/mm; com anos diferentes, dd/mm/aa nas duas", () => {
    expect(comparisonDates("2026-10-19", "2026-11-20")).toEqual({ first: "19/10", last: "20/11" });
    expect(comparisonDates("2025-12-20", "2026-01-08")).toEqual({ first: "20/12/25", last: "08/01/26" });
    expect(comparisonDates("2026-09-12")).toEqual({ first: "12/09", last: null });
  });
});

describe("ordem do seletor (R-15)", () => {
  const ids = (sessions: Session[]) => progressExercises(sessions).map((o) => o.exerciseId);

  it("contagem: o exercício com mais treinos vem primeiro, e a contagem bate com as marcas", () => {
    const sessions = [
      session(day(1), [log("rosca_direta_barra", [[14, 10]]), log("supino_reto_barra", [[40, 8]])]),
      session(day(2), [log("supino_reto_barra", [[42.5, 8]])]),
    ];
    expect(progressExercises(sessions)).toEqual([
      { exerciseId: "supino_reto_barra", name: "supino_reto_barra", count: 2, kind: "forca" },
      { exerciseId: "rosca_direta_barra", name: "rosca_direta_barra", count: 1, kind: "forca" },
    ]);
  });

  it("empate na contagem: força antes de peso do corpo, tempo e graviton", () => {
    const sessions = [
      session(day(1), [log("barra_fixa", [[0, 6]]), log("prancha", [[0, 45]], { unit: "seg" }), log("supino_reto_barra", [[40, 8]])]),
      session(day(2), [log("barra_fixa", [[0, 7]]), log("prancha", [[0, 50]], { unit: "seg" }), log("supino_reto_barra", [[40, 9]])]),
    ];
    expect(ids(sessions)[0]).toBe("supino_reto_barra");
  });

  it("empate na contagem e no tipo: a marca mais recente primeiro; no mesmo treino, a posição", () => {
    const sessions = [
      session(day(1), [log("supino_reto_barra", [[40, 8]])]),
      session(day(2), [log("agachamento_livre", [[60, 8]]), log("remada_curvada_barra", [[30, 10]])]),
    ];
    expect(ids(sessions)).toEqual(["agachamento_livre", "remada_curvada_barra", "supino_reto_barra"]);
  });

  it("empate total: o id decide; aeróbio em minutos e exercício sem série feita ficam fora", () => {
    const sessions = [
      session(day(1), [log("supino_reto_barra", [[40, 8]])]),
      session(day(1, 10, 19), [log("agachamento_livre", [[60, 8]])]),
      session(day(2), [log("esteira_caminhada", [[0, 30]], { unit: "min" }), { ...log("leg_press_45", [[100, 10]]), sets: [{ loadKg: 100, reps: 10, done: false }] }]),
    ];
    expect(ids(sessions)).toEqual(["agachamento_livre", "supino_reto_barra"]);
  });

  it("marca suspeita conta no \"(N treinos)\"", () => {
    const p = progressExercises(series("agachamento_smith", [[20, 10], [20, 11], [200, 10]]));
    expect(p[0]!.count).toBe(3);
  });

  describe("dados do /testar com relógio fixo (23/11/2026, 10h)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    // As mesmas fichas e simulações de seedTester (src/lib/data/demo.ts). Hora local: o resultado vale em qualquer fuso.
    const SAMPLES: { name: string; sex: "M" | "F"; goal: Goal; level: Level; system: SystemId; days: number; weeks: number; seed: number; skip: number; emphasis?: MuscleGroup[]; stopDaysAgo?: number; first: string }[] = [
      { name: "Juliana", sex: "F", goal: "emagrecimento", level: "intermediario", system: "abcd_inferiores", days: 4, weeks: 6, seed: 11, skip: 0.08, emphasis: ["gluteos"], first: "Stiff com barra" },
      { name: "Marcos", sex: "M", goal: "forca", level: "avancado", system: "forca_5x5", days: 3, weeks: 6, seed: 23, skip: 0.05, first: "Agachamento livre" },
      { name: "Beatriz", sex: "F", goal: "hipertrofia", level: "iniciante", system: "fullbody", days: 3, weeks: 5, seed: 37, skip: 0.45, stopDaysAgo: 9, first: "Stiff com halteres" },
    ];

    for (const s of SAMPLES) {
      it(`${s.name}: o primeiro do seletor é ${s.first}`, () => {
        vi.useFakeTimers({ now: new Date(2026, 10, 23, 10, 0) });
        const input: GenerateInput = { goal: s.goal, level: s.level, daysPerWeek: s.days, sessionMinutes: 60, equipment: "academia", system: s.system, seed: s.seed, emphasis: s.emphasis };
        const program = generateProgram(input, { ownerId: s.name, createdBy: "teste-personal" });
        const factor = (s.sex === "F" ? 0.55 : 1) * (s.level === "iniciante" ? 0.7 : s.level === "avancado" ? 1.25 : 1);
        let sessions = simulateSessions(s.name, program, s.weeks, s.days, s.seed, s.skip, factor);
        if (s.stopDaysAgo) sessions = sessions.filter((x) => new Date(x.startedAt).getTime() <= Date.now() - s.stopDaysAgo! * 86_400_000);
        const options = progressExercises(sessions);
        expect(options[0]!.name).toBe(s.first);
        expect(options[0]!.kind).toBe("forca");
      });
    }
  });
});

describe("rótulos do cartão (R-14)", () => {
  it("aluno com a última marca a 14 dias: \"Antes e agora\"", () => {
    expect(comparisonLabels(false, "2026-11-09", "2026-11-23")).toEqual({ title: "Antes e agora", before: "Antes", after: "Agora" });
    expect(comparisonLabels(false, "2026-11-23", "2026-11-23").title).toBe("Antes e agora");
  });

  it("aluno com a última marca a 15 dias: \"Primeiro e último registro\"", () => {
    expect(comparisonLabels(false, "2026-11-08", "2026-11-23")).toEqual({ title: "Primeiro e último registro", before: "Primeiro", after: "Último" });
  });

  it("personal: sempre \"Primeiro e último registro\", mesmo com marca de hoje", () => {
    expect(comparisonLabels(true, "2026-11-23", "2026-11-23").title).toBe("Primeiro e último registro");
  });

  it("conta dias de calendário, inclusive na virada do ano e do horário de verão", () => {
    expect(comparisonLabels(false, "2025-12-20", "2026-01-03").title).toBe("Antes e agora");
    expect(comparisonLabels(false, "2025-12-19", "2026-01-03").title).toBe("Primeiro e último registro");
  });
});
