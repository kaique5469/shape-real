import { describe, expect, it } from "vitest";
import { EXERCISES, getExercise } from "./exercises";
import { SYSTEMS, suggestSystem } from "./systems";
import { avoidedByLimitations, estimateDayMinutes, generateProgram, type GenerateInput } from "./generator";
import { bestSet, detectPRs, e1rm, sessionVolume, suggestNext, weekStart, weeklyVolume, weekStreak } from "./progression";
import { platesFor } from "./plates";
import { programToCsv, sessionsToCsv } from "./export";
import type { ExerciseLog, Session } from "./types";

const owner = { ownerId: "u1", createdBy: "u1" };
const base: GenerateInput = { goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc" };

describe("biblioteca", () => {
  it("tem IDs únicos e referências válidas", () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SYSTEMS) for (const t of s.templates) expect(t.slots.length).toBeGreaterThan(0);
  });
  it("sugere sistema coerente com a frequência", () => {
    expect(suggestSystem(3, "iniciante")).toBe("fullbody");
    expect(suggestSystem(4, "intermediario")).toBe("upper_lower");
    expect(suggestSystem(5, "avancado")).toBe("abcde");
  });
});

describe("gerador de fichas", () => {
  it("gera todos os dias do sistema, sem exercício repetido no mesmo dia", () => {
    const p = generateProgram(base, owner);
    expect(p.days.map((d) => d.key)).toEqual(["A", "B", "C"]);
    for (const d of p.days) {
      const ids = d.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(d.exercises.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("respeita o tempo disponível", () => {
    const p = generateProgram({ ...base, sessionMinutes: 35 }, owner);
    for (const d of p.days) expect(d.exercises.length <= 3 || estimateDayMinutes(d) <= 35).toBe(true);
  });

  it("treino em casa usa só exercícios caseiros", () => {
    const p = generateProgram({ ...base, equipment: "home", system: "fullbody" }, owner);
    for (const d of p.days) for (const e of d.exercises) expect(getExercise(e.exerciseId)?.home).toBe(true);
  });

  it("peso corporal usa só peso corporal", () => {
    const p = generateProgram({ ...base, equipment: "peso_corporal", system: "fullbody" }, owner);
    for (const d of p.days) for (const e of d.exercises) expect(getExercise(e.exerciseId)?.implement).toBe("peso_corporal");
  });

  it("evita exercícios que agravam lesões citadas", () => {
    const avoid = avoidedByLimitations("Tenho dor no joelho e hérnia de disco");
    expect(avoid.has("agachamento_livre")).toBe(true);
    expect(avoid.has("levantamento_terra")).toBe(true);
    const p = generateProgram({ ...base, limitations: "dor no joelho" }, owner);
    const all = p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
    expect(all).not.toContain("agachamento_livre");
  });

  it("5×5 usa 5 repetições nos básicos", () => {
    const p = generateProgram({ ...base, goal: "forca", system: "forca_5x5" }, owner);
    expect(p.days[0]!.exercises[0]!.repsMin).toBe(5);
    expect(p.days[0]!.exercises[0]!.sets).toBe(5);
  });

  it("variações com seeds diferentes mudam a ficha", () => {
    const a = generateProgram({ ...base, system: "fullbody", seed: 1 }, owner);
    const b = generateProgram({ ...base, system: "fullbody", seed: 99 }, owner);
    const flat = (p: typeof a) => p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)).join();
    expect(flat(a)).not.toBe(flat(b));
  });
});

const log = (sets: [number, number][], id = "supino_reto_barra"): ExerciseLog => ({
  uid: "x",
  exerciseId: id,
  name: id,
  sets: sets.map(([loadKg, reps]) => ({ loadKg, reps, done: true })),
});

const session = (id: string, startedAt: string, logs: ExerciseLog[]): Session => ({
  id,
  userId: "u1",
  startedAt,
  exercises: logs,
  volumeKg: 0,
  prs: [],
});

describe("progressão", () => {
  it("calcula 1RM estimado (Epley)", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.3, 1);
    expect(e1rm(0, 10)).toBe(0);
  });

  it("volume ignora séries não concluídas", () => {
    const l = log([[40, 10], [40, 10]]);
    l.sets.push({ loadKg: 40, reps: 10, done: false });
    expect(sessionVolume({ exercises: [l] })).toBe(800);
    expect(bestSet(l)?.loadKg).toBe(40);
  });

  it("progressão dupla: sobe carga ao bater o topo em todas as séries", () => {
    const s = suggestNext(log([[40, 12], [40, 12], [40, 12]]), { sets: 3, repsMin: 8, repsMax: 12 }, "supino_reto_barra");
    expect(s.kind).toBe("aumentar");
    expect(s.loadKg).toBe(42.5);
  });

  it("mantém quando está dentro da faixa e reduz quando falha", () => {
    expect(suggestNext(log([[40, 10], [40, 9], [40, 8]]), { sets: 3, repsMin: 8, repsMax: 12 }, "supino_reto_barra").kind).toBe("manter");
    const r = suggestNext(log([[60, 5], [60, 4], [60, 6]]), { sets: 3, repsMin: 8, repsMax: 12 }, "supino_reto_barra");
    expect(r.kind).toBe("reduzir");
    expect(r.loadKg).toBe(57.5);
  });

  it("pernas com barra sobem 5 kg", () => {
    const s = suggestNext(log([[80, 8], [80, 8], [80, 8]], "agachamento_livre"), { sets: 3, repsMin: 6, repsMax: 8 }, "agachamento_livre");
    expect(s.loadKg).toBe(85);
  });

  it("detecta recordes contra o histórico anterior", () => {
    const old = session("a", "2026-01-01T10:00:00Z", [log([[60, 8]])]);
    const now = session("b", "2026-01-08T10:00:00Z", [log([[62.5, 8]])]);
    expect(detectPRs(now, [old, now])).toEqual(["supino_reto_barra"]);
    expect(detectPRs(old, [old])).toEqual([]);
  });

  it("volume semanal e sequência de semanas", () => {
    const now = new Date("2026-03-18T12:00:00Z");
    const s1 = { ...session("1", "2026-03-16T10:00:00Z", [log([[50, 10]])]), volumeKg: 500 };
    const s2 = { ...session("2", "2026-03-10T10:00:00Z", [log([[50, 10]])]), volumeKg: 500 };
    const w = weeklyVolume([s1, s2], 4, now);
    expect(w).toHaveLength(4);
    expect(w[3]!.volume).toBe(500);
    expect(weekStreak([s1, s2], now)).toBe(2);
  });
});

describe("semana no fuso do usuário", () => {
  it("treino à noite no Brasil fica na semana certa (a chave é a data local, não a de UTC)", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    try {
      // Quarta, 18/11/2026, 21h30 em Brasília = quinta 00h30 em UTC. A segunda-feira daquela semana é 16/11.
      expect(weekStart("2026-11-19T00:30:00Z")).toBe("2026-11-16");
      // Segunda às 22h em Brasília (terça 01h em UTC) ainda é a semana que começa na própria segunda.
      expect(weekStart("2026-11-17T01:00:00Z")).toBe("2026-11-16");
      // Domingo às 23h em Brasília continua na semana anterior.
      expect(weekStart("2026-11-16T02:00:00Z")).toBe("2026-11-09");
      const now = new Date("2026-11-19T00:30:00Z");
      const monday = { ...session("m", "2026-11-16T22:00:00Z", [log([[50, 10]])]), volumeKg: 500 };
      expect(weeklyVolume([monday], 2, now)[1]).toEqual({ week: "2026-11-16", volume: 500, sessions: 1 });
      expect(weekStreak([monday], now)).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe("anilhas", () => {
  it("monta 100 kg na barra de 20", () => {
    const r = platesFor(100);
    expect(r.perSide.map((p) => p.kg)).toEqual([25, 15]);
    expect(r.remainder).toBe(0);
  });
  it("informa o que não fecha", () => {
    expect(platesFor(61).remainder).toBe(1);
  });
});

describe("exportação", () => {
  it("gera CSV no padrão do Excel brasileiro", () => {
    const p = generateProgram(base, owner);
    const csv = programToCsv(p);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")[0]).toContain("Exercício;Séries");
    const s = sessionsToCsv([session("1", "2026-03-16T10:00:00Z", [log([[42.5, 10]])])]);
    expect(s).toContain("42,5");
  });
});
