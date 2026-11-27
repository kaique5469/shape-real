import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { NAO_QUER_IDS } from "./anamnese-ficha";
import { EXERCISES, getExercise, registerCustomExercises, searchExercises, unitOf } from "./exercises";
import { EMPHASIS_SLOTS, SYSTEMS, getSystem, suggestSystem } from "./systems";
import {
  TECHNIQUE_LABEL,
  allowedByEquipment,
  analyzeLimitations,
  avoidedByLimitations,
  buildPlanned,
  estimateDayMinutes,
  estimateSeconds,
  fitDayToTime,
  generateProgram,
  isGymRegression,
  repScheme,
  type GenerateInput,
} from "./generator";
import {
  compareWithLastSameDay,
  completedSets,
  detectPRs,
  e1rm,
  e1rmSeries,
  firstOfWeek,
  firstRecordSet,
  fmtMark,
  lastPerformance,
  lastPerformanceWithDate,
  loadIncrement,
  priorSets,
  recentPerformances,
  recordFlags,
  recordSetOf,
  setRecord,
  suggestFromHistory,
  suggestNext,
  type SuggestionKind,
} from "./progression";
import { PROGRAM_JSON_SCHEMA, PROGRAM_SYSTEM, programFromAI, programInputSchema, programUserPrompt } from "@/lib/ai/program";
import type { Equipment, Exercise, ExerciseLog, Goal, Level, MuscleGroup, PlannedExercise, Program, Session, SetLog, SystemId, WorkoutDay } from "./types";

/**
 * Contrato do motor de fichas (parte 2: tempo, prioridade, divisões, aeróbio, limitações, determinismo, drop-set e
 * observações). Separado de engine.test.ts só para cada arquivo rodar em menos de 60 s: o vitest acusa "Timeout calling
 * onTaskUpdate" quando um arquivo de testes síncronos passa disso. Mesmas regras, mesmos auxiliares.
 */

const owner = { ownerId: "u1", createdBy: "u1" };
const base: GenerateInput = { goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc" };
const gen = (i: Partial<GenerateInput> = {}): Program => generateProgram({ ...base, ...i }, owner);

const SEEDS = Array.from({ length: 12 }, (_, i) => i * 37 + 1);
const MANY_SEEDS = Array.from({ length: 60 }, (_, i) => i * 13 + 2);
const ALL = SYSTEMS.map((s) => s.id);
const LEVELS: Level[] = ["iniciante", "intermediario", "avancado"];
const GOALS: Goal[] = ["hipertrofia", "forca", "emagrecimento", "condicionamento", "saude"];
const EQUIPMENTS: Equipment[] = ["academia", "home", "peso_corporal"];
const LOWER: MuscleGroup[] = ["quadriceps", "posteriores", "gluteos", "panturrilhas", "adutores"];

const ex = (p: { exerciseId: string }): Exercise => getExercise(p.exerciseId)!;
const idsOf = (d: WorkoutDay) => d.exercises.map((e) => e.exerciseId);
const all = (p: Program) => p.days.flatMap((d) => d.exercises);
const strength = (d: WorkoutDay) => d.exercises.filter((e) => (e.unit ?? "reps") === "reps" && ex(e).pattern !== "core" && ex(e).pattern !== "cardio");
const signature = (p: Program) => p.days.map((d) => `${d.key}:${d.title}:` + d.exercises.map((e) => `${e.exerciseId}/${e.sets}x${e.repsMin}-${e.repsMax}/${e.restSec}/${e.technique}/${e.notes ?? ""}`).join(",")).join("|");
const count = (p: Program, group: MuscleGroup) => all(p).filter((e) => ex(e).group === group).length;
const where = (i: Partial<GenerateInput>, d?: WorkoutDay) => `${JSON.stringify(i)}${d ? ` dia ${d.key}: ${idsOf(d).join(", ")}` : ""}`;

/** Roda `check` em todas as combinações pedidas. */
function sweep(
  opts: { systems?: SystemId[]; levels?: Level[]; goals?: Goal[]; equipments?: Equipment[]; minutes?: number[]; seeds?: number[]; extra?: Partial<GenerateInput> },
  check: (program: Program, input: GenerateInput) => void,
) {
  for (const system of opts.systems ?? ALL)
    for (const level of opts.levels ?? LEVELS)
      for (const goal of opts.goals ?? ["hipertrofia"])
        for (const equipment of opts.equipments ?? ["academia"])
          for (const sessionMinutes of opts.minutes ?? [60])
            for (const seed of opts.seeds ?? SEEDS) {
              const input: GenerateInput = { ...base, system, level, goal, equipment, sessionMinutes, seed, daysPerWeek: getSystem(system).fits[0] ?? 3, ...opts.extra };
              check(generateProgram(input, owner), input);
            }
}

afterEach(() => registerCustomExercises([]));

// ───────────────────────── 5. Tempo ─────────────────────────

describe("5. ajuste ao tempo", () => {
  it("a sessão informada é teto: 30, 45 e 60 min em todos os sistemas, objetivos e níveis", () => {
    sweep({ goals: GOALS, minutes: [30, 45, 60], seeds: SEEDS.slice(0, 4) }, (p, input) => {
      for (const d of p.days) {
        expect(estimateDayMinutes(d), where(input, d)).toBeLessThanOrEqual(input.sessionMinutes);
        expect(d.exercises.length, where(input, d)).toBeGreaterThanOrEqual(3);
      }
    });
    sweep({ equipments: ["home", "peso_corporal"], goals: ["hipertrofia", "emagrecimento"], minutes: [30, 45], seeds: SEEDS.slice(0, 3) }, (p, input) => {
      for (const d of p.days) expect(estimateDayMinutes(d), where(input, d)).toBeLessThanOrEqual(input.sessionMinutes);
    });
  });

  it("corta séries e exercícios redundantes antes de apagar um grupo do foco", () => {
    sweep({ goals: ["hipertrofia", "forca", "emagrecimento"], minutes: [45], seeds: SEEDS.slice(0, 6) }, (p, input) => {
      const full = generateProgram({ ...input, sessionMinutes: 120 }, owner);
      p.days.forEach((d, i) => {
        const wide = full.days[i]!;
        for (const g of d.focus) {
          if (!wide.exercises.some((e) => ex(e).group === g)) continue;
          expect(d.exercises.some((e) => ex(e).group === g), `${g} sumiu de ${where(input, d)}`).toBe(true);
        }
        expect(d.exercises.length, where(input, d)).toBeGreaterThanOrEqual(4);
      });
    });
  });

  it("ABC em 30 min: A mantém peito, ombros e tríceps; B mantém bíceps", () => {
    for (const level of LEVELS)
      for (const seed of SEEDS) {
        const p = gen({ level, sessionMinutes: 30, seed });
        const groups = (d: WorkoutDay) => new Set(d.exercises.map((e) => ex(e).group));
        expect([...groups(p.days[0]!)].sort(), `${level} ${seed}`).toEqual(["ombros", "peito", "triceps"]);
        expect(groups(p.days[1]!).has("biceps") && groups(p.days[1]!).has("costas"), `${level} ${seed}`).toBe(true);
        expect(groups(p.days[2]!).has("quadriceps") && groups(p.days[2]!).has("posteriores") && groups(p.days[2]!).has("gluteos"), `${level} ${seed}`).toBe(true);
      }
  });

  it("o levantamento principal nunca é cortado", () => {
    sweep({ goals: ["hipertrofia", "forca"], levels: ["intermediario", "avancado"], seeds: SEEDS.slice(0, 6) }, (p, input) => {
      const short = generateProgram({ ...input, sessionMinutes: 30 }, owner);
      const sys = getSystem(input.system);
      p.days.forEach((d, i) => {
        const mains = sys.templates[i]!.slots.filter((s) => s.main).length;
        // Os principais são os multiarticulares mais pesados do dia na versão de 60 min.
        const heavy = [...strength(d)].filter((e) => ex(e).compound).sort((a, b) => a.repsMin - b.repsMin || b.restSec - a.restSec).slice(0, mains);
        for (const e of heavy) expect(idsOf(short.days[i]!), `${e.exerciseId} em ${where(input, short.days[i])}`).toContain(e.exerciseId);
      });
    });
  });

  it("pedir 90 min rende mais trabalho do que 60", () => {
    const work = (p: Program) => all(p).reduce((acc, e) => acc + ((e.unit ?? "reps") === "min" ? e.repsMax / 2 : e.sets), 0);
    sweep({ levels: ["intermediario", "avancado"], goals: ["hipertrofia", "emagrecimento"], seeds: SEEDS.slice(0, 6) }, (p, input) => {
      const long = generateProgram({ ...input, sessionMinutes: 90 }, owner);
      expect(work(long), where(input)).toBeGreaterThan(work(p));
      long.days.forEach((d, i) => {
        expect(estimateDayMinutes(d), where(input, d)).toBeLessThanOrEqual(90);
        expect(d.exercises.length, where(input, d)).toBeGreaterThanOrEqual(p.days[i]!.exercises.length);
      });
    });
    // Iniciante não ganha volume só porque tem tempo: nunca menos, e sem 4ª série.
    sweep({ levels: ["iniciante"], goals: ["hipertrofia"], seeds: SEEDS.slice(0, 4) }, (p, input) => {
      const long = generateProgram({ ...input, sessionMinutes: 90 }, owner);
      expect(work(long), where(input)).toBeGreaterThanOrEqual(work(p));
    });
  });

  it("os encaixes opcionais entram na posição certa quando sobra tempo", () => {
    const short = gen({ sessionMinutes: 45, seed: 5 });
    const long = gen({ sessionMinutes: 90, seed: 5 });
    expect(long.days[0]!.exercises.length).toBeGreaterThan(short.days[0]!.exercises.length);
    // ABC A com 90 min: o 3º supino entra logo depois do inclinado, antes do crucifixo.
    const chest = long.days[0]!.exercises.filter((e) => ex(e).group === "peito");
    expect(chest.length).toBe(4);
    expect(chest.slice(0, 3).every((e) => ex(e).compound)).toBe(true);
    expect(ex(chest[3]!).compound).toBe(false);
  });

  it("até 60 min os acessórios descansam 60–90 s em todos os dias; a ficha fica uniforme", () => {
    sweep({ levels: ["intermediario", "avancado"], goals: ["hipertrofia"], minutes: [60] }, (p, input) => {
      const sys = getSystem(input.system);
      p.days.forEach((d, i) => {
        const mains = sys.templates[i]!.slots.filter((s) => s.main).length;
        const accessories = strength(d).filter((e) => e.restSec < 120 || !ex(e).compound);
        expect(strength(d).length - accessories.length, where(input, d)).toBeLessThanOrEqual(mains);
        for (const e of accessories) expect(e.restSec, `${e.exerciseId} em ${where(input, d)}`).toBeLessThanOrEqual(ex(e).compound ? 90 : 60);
        // Sem séries desencontradas: isolados com 3 séries (2 se o tempo apertou).
        for (const e of strength(d).filter((x) => !ex(x).compound)) expect(e.sets, e.exerciseId).toBeLessThanOrEqual(3);
      });
    });
  });

  it("a estimativa conta aquecimento, séries de aproximação e exercício unilateral", () => {
    const scheme = { sets: 3, repsMin: 10, repsMax: 12, restSec: 60 };
    expect(estimateSeconds({ ...scheme, exerciseId: "afundo" })).toBeGreaterThan(estimateSeconds({ ...scheme, exerciseId: "leg_press" }));
    expect(estimateSeconds({ ...scheme, exerciseId: "afundo" }) - estimateSeconds({ ...scheme, exerciseId: "leg_press" })).toBe(3 * 11 * 3);
    expect(estimateSeconds({ sets: 1, repsMin: 20, repsMax: 20, restSec: 0, exerciseId: "esteira_caminhada" })).toBe(1200);
    const day = (exercises: PlannedExercise[]): WorkoutDay => ({ key: "A", title: "A", focus: ["peito"], exercises });
    const light = buildPlanned(getExercise("supino_maquina")!, scheme);
    const heavy = buildPlanned(getExercise("supino_reto_barra")!, { sets: 4, repsMin: 6, repsMax: 8, restSec: 150 });
    expect(estimateDayMinutes(day([]))).toBe(0);
    expect(estimateDayMinutes(day([light])) * 60).toBeGreaterThanOrEqual(estimateSeconds(light) + 150);
    // Primeiro exercício pesado: 2 min a mais de séries de aproximação.
    expect(Math.round((estimateSeconds(heavy) + 300) / 60)).toBe(estimateDayMinutes(day([heavy])));
    // Só aeróbio: sem aquecimento somado.
    expect(estimateDayMinutes(day([buildPlanned(getExercise("esteira_caminhada")!, { sets: 1, repsMin: 20, repsMax: 20, restSec: 0 })]))).toBe(20);
  });

  it("fitDayToTime ajusta um dia pronto sem perder o principal nem a prioridade", () => {
    const p = gen({ sessionMinutes: 120, emphasis: ["gluteos"], seed: 3 });
    const legs = p.days[2]!;
    const fitted = fitDayToTime(legs, 40, ["gluteos"]);
    expect(estimateDayMinutes(fitted)).toBeLessThanOrEqual(40);
    expect(fitted.exercises[0]!.exerciseId).toBe(legs.exercises[0]!.exerciseId);
    expect(fitted.exercises.filter((e) => ex(e).group === "gluteos").length).toBe(legs.exercises.filter((e) => ex(e).group === "gluteos").length);
    // Não altera o dia original.
    expect(legs.exercises.length).toBeGreaterThan(fitted.exercises.length);
    expect(fitDayToTime(legs, 300)).toEqual(legs);
  });
});

// ───────────────────────── 6. Prioridade do aluno ─────────────────────────

describe("6. prioridade (ênfase)", () => {
  it("glúteos: 2+ exercícios diretos em todo dia de inferiores, mesmo com 45 min, com o multiarticular até o 2º exercício", () => {
    sweep({ goals: ["hipertrofia", "emagrecimento", "saude"], minutes: [45, 60], seeds: SEEDS.slice(0, 6), extra: { emphasis: ["gluteos"] } }, (p, input) => {
      const sys = getSystem(input.system);
      p.days.forEach((d, i) => {
        const tpl = sys.templates[i]!;
        const lowerDay = tpl.focus.every((g) => LOWER.includes(g));
        if (!lowerDay && !tpl.focus.includes("gluteos")) return;
        const glutes = d.exercises.filter((e) => ex(e).group === "gluteos");
        expect(glutes.length, where(input, d)).toBeGreaterThanOrEqual(2);
        expect(glutes.some((e) => ex(e).compound) && glutes.some((e) => !ex(e).compound), where(input, d)).toBe(true);
        expect(d.exercises.findIndex((e) => ex(e).group === "gluteos" && ex(e).compound), where(input, d)).toBeLessThanOrEqual(1);
      });
    });
  });

  it("glúteos em casa e sem equipamento também rendem 2+ exercícios diretos nos dias de pernas", () => {
    sweep({ systems: ["fullbody", "ab", "abc", "upper_lower", "abc_inferiores"], equipments: ["home", "peso_corporal"], minutes: [45], seeds: SEEDS.slice(0, 5), extra: { emphasis: ["gluteos"] } }, (p, input) => {
      const sys = getSystem(input.system);
      p.days.forEach((d, i) => {
        if (!sys.templates[i]!.focus.every((g) => LOWER.includes(g))) return;
        expect(d.exercises.filter((e) => ex(e).group === "gluteos").length, where(input, d)).toBeGreaterThanOrEqual(2);
      });
    });
  });

  it("qualquer grupo priorizado ganha exercício direto e ele sobrevive ao corte de tempo", () => {
    const groups: MuscleGroup[] = ["peito", "costas", "ombros", "biceps", "triceps", "quadriceps", "posteriores", "gluteos", "panturrilhas", "adutores", "abdomen"];
    for (const system of ["abc", "upper_lower", "fullbody", "abcde", "ppl6"] as SystemId[])
      for (const g of groups)
        for (const seed of SEEDS.slice(0, 5)) {
          const input = { system, seed, daysPerWeek: getSystem(system).fits[0]! };
          const plain = gen(input);
          const with60 = gen({ ...input, emphasis: [g] });
          const with45 = gen({ ...input, emphasis: [g], sessionMinutes: 45 });
          expect(count(with60, g), `${system} ${g} ${seed}`).toBeGreaterThan(count(plain, g));
          expect(count(with45, g), `${system} ${g} ${seed} (45 min)`).toBeGreaterThanOrEqual(Math.max(count(plain, g), 1));
          expect(count(with45, g), `${system} ${g} ${seed} (45 min)`).toBeGreaterThanOrEqual(count(gen({ ...input, sessionMinutes: 45 }), g));
        }
  });

  it("três prioridades de uma vez continuam cabendo no tempo", () => {
    sweep({ minutes: [45, 60], seeds: SEEDS.slice(0, 4), extra: { emphasis: ["gluteos", "posteriores", "ombros"] } }, (p, input) => {
      for (const d of p.days) {
        expect(estimateDayMinutes(d), where(input, d)).toBeLessThanOrEqual(input.sessionMinutes);
        expect(new Set(idsOf(d)).size).toBe(d.exercises.length);
      }
    });
  });
});

// ───────────────────────── 7. Divisões ─────────────────────────

describe("7. divisões e frequência de inferiores", () => {
  it("as duas divisões novas ficam no fim da lista; a landing continua em SYSTEMS[2] = ABC", () => {
    expect(SYSTEMS[2]!.id).toBe("abc");
    expect(SYSTEMS.slice(-2).map((s) => s.id)).toEqual(["abc_inferiores", "abcd_inferiores"]);
    expect(SYSTEMS.some((s) => s.id === "livre")).toBe(false);
    for (const s of SYSTEMS) {
      expect(s.templates.length, s.id).toBe(s.days);
      expect(new Set(s.templates.map((t) => t.key)).size, s.id).toBe(s.days);
      for (const t of s.templates) {
        expect(t.slots.filter((x) => !x.optional).length, `${s.id}/${t.key}`).toBeGreaterThanOrEqual(4);
        // Todo abdômen é encaixe isolado de core (nenhum exercício de abdômen é multiarticular).
        for (const slot of t.slots.filter((x) => x.group === "abdomen")) expect(slot.compound, `${s.id}/${t.key}`).toBe(false);
      }
    }
  });

  it("abc_inferiores e abcd_inferiores treinam pernas e glúteos 2x, com 2+ exercícios diretos de glúteo por dia", () => {
    sweep({ systems: ["abc_inferiores", "abcd_inferiores"], goals: ["hipertrofia", "emagrecimento"], seeds: MANY_SEEDS.slice(0, 20) }, (p, input) => {
      const lower = p.days.filter((d) => d.focus.every((g) => LOWER.includes(g)));
      expect(lower.length).toBe(2);
      for (const d of lower) {
        expect(d.exercises.filter((e) => ex(e).group === "gluteos").length, where(input, d)).toBeGreaterThanOrEqual(2);
        expect(d.exercises.filter((e) => LOWER.includes(ex(e).group)).length, where(input, d)).toBe(d.exercises.filter((e) => ex(e).group !== "cardio").length);
      }
      // Um coice e uma abdução, não dois coices.
      for (const d of lower) expect(idsOf(d).filter((id) => ["gluteo_cabo", "gluteo_maquina", "gluteo_4_apoios_caneleira", "gluteo_smith"].includes(id)).length, where(input, d)).toBeLessThanOrEqual(1);
    });
  });

  it("Full Body tem glúteo direto nos três dias e inferiores em todos", () => {
    sweep({ systems: ["fullbody"], goals: GOALS }, (p, input) => {
      for (const d of p.days) {
        expect(d.exercises.some((e) => ex(e).group === "gluteos"), where(input, d)).toBe(true);
        expect(d.exercises.filter((e) => LOWER.includes(ex(e).group)).length, where(input, d)).toBeGreaterThanOrEqual(3);
      }
    });
  });

  it("AB começa pelos inferiores (3x por semana dá pernas 2x)", () => {
    expect(getSystem("ab").templates[0]!.focus).toEqual(["quadriceps", "posteriores", "gluteos"]);
  });
});

// ───────────────────────── 8. Sugestão de sistema ─────────────────────────

describe("8. suggestSystem", () => {
  it("mantém as sugestões padrão sem opções", () => {
    expect(suggestSystem(2, "iniciante")).toBe("fullbody");
    expect(suggestSystem(2, "avancado")).toBe("ab");
    expect(suggestSystem(3, "iniciante")).toBe("fullbody");
    expect(suggestSystem(3, "intermediario")).toBe("abc");
    expect(suggestSystem(4, "intermediario")).toBe("upper_lower");
    expect(suggestSystem(4, "avancado")).toBe("abcd");
    expect(suggestSystem(5, "avancado")).toBe("abcde");
    expect(suggestSystem(6, "intermediario")).toBe("ppl6");
  });

  it("prioridade em inferiores pede divisão com pernas 2x", () => {
    expect(suggestSystem(3, "intermediario", { emphasis: ["gluteos"] })).toBe("abc_inferiores");
    expect(suggestSystem(4, "avancado", { emphasis: ["gluteos", "posteriores"] })).toBe("abcd_inferiores");
    expect(suggestSystem(3, "iniciante", { emphasis: ["gluteos"] })).toBe("fullbody");
    expect(suggestSystem(4, "iniciante", { emphasis: ["quadriceps"] })).toBe("upper_lower");
    // Prioridade mista (superior + inferior) não muda a sugestão.
    expect(suggestSystem(3, "intermediario", { emphasis: ["gluteos", "ombros"] })).toBe("abc");
    expect(suggestSystem(3, "intermediario", { emphasis: ["peito"] })).toBe("abc");
  });

  it("força sugere o 5×5 (só em academia) e sem equipamento sugere corpo inteiro", () => {
    expect(suggestSystem(3, "intermediario", { goal: "forca" })).toBe("forca_5x5");
    expect(suggestSystem(3, "iniciante", { goal: "forca", equipment: "academia" })).toBe("forca_5x5");
    expect(suggestSystem(3, "intermediario", { goal: "forca", equipment: "home" })).toBe("fullbody");
    expect(suggestSystem(4, "intermediario", { goal: "forca" })).toBe("upper_lower");
    expect(suggestSystem(6, "avancado", { goal: "forca" })).toBe("ppl6");
    expect(suggestSystem(3, "avancado", { equipment: "peso_corporal" })).toBe("fullbody");
    expect(suggestSystem(5, "avancado", { equipment: "peso_corporal", goal: "forca", emphasis: ["gluteos"] })).toBe("upper_lower");
  });

  it("sempre devolve um sistema que o motor sabe gerar", () => {
    for (let days = 1; days <= 7; days++)
      for (const level of LEVELS)
        for (const goal of GOALS)
          for (const equipment of EQUIPMENTS)
            for (const emphasis of [[], ["gluteos"], ["peito"]] as MuscleGroup[][]) {
              const id = suggestSystem(days, level, { goal, equipment, emphasis });
              expect(ALL, `${days} ${level} ${goal} ${equipment}`).toContain(id);
            }
  });
});

// ───────────────────────── 9. Aeróbio ─────────────────────────

describe("9. aeróbio de fechamento", () => {
  const cardioOf = (d: WorkoutDay) => d.exercises.filter((e) => ex(e).group === "cardio");

  it("emagrecimento, condicionamento e saúde fecham com 10–20 min quando sobra tempo", () => {
    sweep({ goals: ["emagrecimento", "condicionamento", "saude"], equipments: EQUIPMENTS, minutes: [90], seeds: SEEDS.slice(0, 5) }, (p, input) => {
      for (const d of p.days) {
        const cardio = cardioOf(d);
        expect(cardio.length, where(input, d)).toBe(1);
        const c = cardio[0]!;
        expect(d.exercises[d.exercises.length - 1], where(input, d)).toBe(c);
        expect([c.unit, c.sets, c.restSec]).toEqual(["min", 1, 0]);
        expect(c.repsMin).toBe(c.repsMax);
        expect(c.repsMax).toBeGreaterThanOrEqual(10);
        expect(c.repsMax).toBeLessThanOrEqual(20);
        expect(c.repsMax % 5).toBe(0);
        expect(estimateDayMinutes(d), where(input, d)).toBeLessThanOrEqual(90);
        if (input.equipment === "academia") expect(ex(c).implement, c.exerciseId).toBe("maquina");
        if (input.level === "iniciante") expect(["hiit_esteira", "hiit_bike", "esteira_corrida", "corrida_rua", "pular_corda"]).not.toContain(c.exerciseId);
      }
    });
  });

  it("hipertrofia e força não recebem aeróbio; sem tempo sobrando, ninguém recebe", () => {
    sweep({ goals: ["hipertrofia", "forca"], minutes: [60, 90], seeds: SEEDS.slice(0, 4) }, (p, input) => {
      for (const d of p.days) expect(cardioOf(d).length, where(input, d)).toBe(0);
    });
    sweep({ goals: ["emagrecimento"], minutes: [30], seeds: SEEDS.slice(0, 4), levels: ["intermediario"] }, (p, input) => {
      for (const d of p.days) expect(cardioOf(d).length, where(input, d)).toBe(0);
    });
  });

  it("com dor no joelho o aeróbio não é de impacto", () => {
    sweep({ goals: ["emagrecimento", "condicionamento"], minutes: [90], seeds: SEEDS.slice(0, 6), extra: { limitations: "condromalácia patelar" } }, (p, input) => {
      for (const d of p.days) for (const c of cardioOf(d)) expect(["esteira_corrida", "hiit_esteira", "escada_simulador", "pular_corda", "corrida_rua"], where(input, d)).not.toContain(c.exerciseId);
    });
  });
});

// ───────────────────────── 10. Limitações ─────────────────────────

describe("10. limitações", () => {
  it("reconhece as formas comuns de escrever e não dispara em palavras parecidas", () => {
    const labels = (t: string) => analyzeLimitations(t).labels;
    expect(labels("dor no joelho")).toEqual(["joelho"]);
    expect(labels("condromalacia")).toEqual(["joelho"]);
    expect(labels("Condromalácia patelar grau 2")).toEqual(["joelho"]);
    expect(labels("rompi o ligamento cruzado")).toEqual(["joelho"]);
    expect(labels("LCA operado")).toEqual(["joelho"]);
    expect(labels("dor nas costas")).toEqual(["lombar"]);
    expect(labels("minhas costas doem")).toEqual(["lombar"]);
    expect(labels("ciático")).toEqual(["lombar"]);
    expect(labels("protrusão discal")).toEqual(["lombar"]);
    expect(labels("hérnia de disco lombar")).toEqual(["lombar"]);
    expect(labels("escoliose")).toEqual(["lombar"]);
    expect(labels("tendinite no ombro")).toEqual(["ombro"]);
    expect(labels("tendinopatia do supraespinhal")).toEqual(["ombro"]);
    expect(labels("bursite")).toEqual(["ombro"]);
    expect(labels("bursite no quadril")).toEqual(["quadril"]);
    expect(labels("bursite trocantérica")).toEqual(["quadril"]);
    expect(labels("artrose de quadril")).toEqual(["quadril", "artrose"]);
    expect(labels("idoso com artrose")).toEqual(["idade e artrose"]);
    // Nunca nomear o que não foi escrito: idade sozinha não vira "artrose" (QA da rodada 2, aluno de 76 anos).
    expect(labels("idoso")).toEqual(["idade"]);
    expect(labels("terceira idade, joelho")).toEqual(["joelho", "idade"]);
    expect(labels("osteopenia")).toEqual(["osteopenia"]);
    expect(labels("prótese de quadril")).toContain("prótese");
    expect(labels("dor no punho")).toEqual(["punho"]);
    expect(labels("tendinite no punho")).toEqual(["punho"]);
    expect(labels("epicondilite")).toEqual(["cotovelo"]);
    expect(labels("cervical")).toEqual(["cervical"]);
    expect(labels("entorse de tornozelo")).toEqual(["tornozelo ou pé"]);
    expect(labels("hipertensão controlada")).toEqual(["pressão ou coração"]);
    expect(labels("gestante de 20 semanas")).toEqual(["gestação"]);
    // "lca" dentro de "calcanhar" não tira os agachamentos; "tendinite patelar" não aciona cotovelo.
    expect(avoidedByLimitations("dor no calcanhar").has("agachamento_livre")).toBe(false);
    expect(labels("tendinite patelar")).toEqual(["joelho"]);
    expect(avoidedByLimitations("tendinite patelar").has("triceps_testa")).toBe(false);
    expect(avoidedByLimitations("bursite no quadril").has("desenvolvimento_barra")).toBe(false);
    expect(avoidedByLimitations("bursite no quadril").has("cadeira_abdutora")).toBe(true);
    expect(avoidedByLimitations("condromalácia").has("cadeira_extensora")).toBe(true);
    expect(avoidedByLimitations("dor no joelho").has("cadeira_extensora")).toBe(false);
  });

  it("frase negada ou sem limitação não tira nada nem gera aviso", () => {
    for (const t of ["sem dor no joelho, liberado pelo fisio", "não tenho limitações", "Nenhuma", "nada", "", "  ", "Não tenho nenhuma lesão."]) {
      const plan = analyzeLimitations(t);
      expect(plan.avoid.size, t).toBe(0);
      expect(plan.unrecognized, t).toBe(false);
    }
    expect(gen({ limitations: "nenhuma" }).notes).not.toContain("Limitações");
    // Negou uma coisa e informou outra.
    expect(analyzeLimitations("sem dor no ombro, mas tenho hérnia de disco").labels).toEqual(["lombar"]);
  });

  it("todo id evitado existe na biblioteca", () => {
    const everything = "joelho condromalácia lombar ombro bursite punho cotovelo quadril cervical tornozelo idoso hipertensão gestante";
    const avoid = avoidedByLimitations(everything);
    expect(avoid.size).toBeGreaterThan(80);
    for (const id of avoid) expect(getExercise(id), id).toBeDefined();
  });

  it("limitação que o motor não reconhece vira aviso na ficha", () => {
    const p = gen({ limitations: "labirintite" });
    expect(p.notes).toContain("não reconheci a limitação informada (“labirintite”)");
    expect(analyzeLimitations("labirintite").unrecognized).toBe(true);
    expect(gen({ limitations: "dor no joelho" }).notes).toContain("Limitações consideradas: joelho.");
    expect(gen().notes).not.toContain("Limitações");
  });

  const CASES: [string, MuscleGroup[], number][] = [
    ["dor no joelho", ["quadriceps", "posteriores", "gluteos"], 8],
    ["condromalácia patelar", ["quadriceps", "posteriores", "gluteos"], 8],
    ["hérnia de disco lombar", ["quadriceps", "posteriores", "gluteos", "costas"], 8],
    ["tendinite no ombro", ["peito", "ombros"], 8],
    ["dor no punho", [], 0],
    ["epicondilite no cotovelo", [], 0],
    ["artrose de quadril", ["quadriceps", "posteriores", "gluteos"], 10],
    ["dor na cervical", [], 0],
    ["idoso com artrose", ["peito", "costas", "ombros", "quadriceps", "posteriores", "gluteos", "biceps", "triceps"], 10],
    ["hipertensão", ["peito", "costas", "quadriceps"], 10],
    ["gestante", ["peito", "costas", "quadriceps"], 10],
  ];

  it.each(CASES)("“%s”: nada do que foi evitado aparece, o dia continua completo e sem série pesada na região", (text, groups, minReps) => {
    const avoid = avoidedByLimitations(text);
    expect(avoid.size).toBeGreaterThan(0);
    sweep({ systems: ["fullbody", "abc", "forca_5x5", "upper_lower", "abc_inferiores", "abcde"], goals: ["hipertrofia", "forca", "saude"], equipments: ["academia", "home"], seeds: SEEDS.slice(0, 4), extra: { limitations: text } }, (p, input) => {
      expect(p.notes, where(input)).toContain("Limitações consideradas");
      for (const d of p.days) {
        expect(d.exercises.length, where(input, d)).toBeGreaterThanOrEqual(4);
        expect(estimateDayMinutes(d), where(input, d)).toBeLessThanOrEqual(60);
        for (const e of d.exercises) expect(avoid.has(e.exerciseId), `${e.exerciseId} em ${where(input, d)}`).toBe(false);
        for (const e of strength(d)) if (groups.includes(ex(e).group)) expect(e.repsMin, `${e.exerciseId} em ${where(input, d)}`).toBeGreaterThanOrEqual(minReps);
      }
    });
  });

  it("hérnia de disco: sem dobradiça com carga, sem flexão de tronco, core só de estabilização", () => {
    sweep({ systems: ["fullbody", "abc", "upper_lower", "abcd"], goals: ["hipertrofia", "saude"], levels: LEVELS, extra: { limitations: "hérnia de disco lombar" } }, (p, input) => {
      for (const e of all(p)) {
        expect(ex(e).pattern === "quadril" && ex(e).group === "posteriores", `${e.exerciseId} em ${where(input)}`).toBe(false);
        if (ex(e).group === "abdomen") expect(["prancha", "prancha_lateral", "dead_bug", "pallof", "prancha_toque_ombro", "mountain_climber"], e.exerciseId).toContain(e.exerciseId);
      }
      // O dia de pernas continua com posteriores (flexoras) e glúteo.
      const legs = p.days.filter((d) => d.focus.includes("posteriores"));
      for (const d of legs) expect(d.exercises.some((e) => ex(e).group === "posteriores" || ex(e).group === "gluteos"), where(input, d)).toBe(true);
    });
    const p = gen({ limitations: "hérnia de disco lombar", seed: 4 });
    const leg = all(p).find((e) => e.exerciseId === "leg_press" || e.exerciseId === "hack" || e.exerciseId === "leg_press_horizontal")!;
    expect(leg.notes).toContain("lombar do encosto");
  });

  it("joelho: leg press vira o principal de pernas, com 8+ repetições e orientação de amplitude", () => {
    for (const seed of SEEDS) {
      const legs = gen({ limitations: "dor no joelho", seed }).days[2]!;
      const first = legs.exercises[0]!;
      expect(["leg_press", "leg_press_horizontal"]).toContain(first.exerciseId);
      expect(first.repsMin).toBeGreaterThanOrEqual(8);
      expect(first.sets).toBeLessThanOrEqual(3);
      expect(first.notes).toContain("Amplitude sem dor");
      expect(legs.exercises.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("5×5 com limitação que tira um básico (ou condição geral) vira Full Body com aviso", () => {
    for (const text of ["dor no joelho", "hérnia de disco", "tendinite no ombro", "idoso com artrose", "gestante"]) {
      const p = gen({ system: "forca_5x5", goal: "forca", limitations: text });
      expect(p.system, text).toBe("fullbody");
      expect(p.notes, text).toContain("Full Body mais seguro");
      expect(all(p).some((e) => e.repsMax <= 5), text).toBe(false);
    }
    // Punho e cotovelo não tiram nenhum básico: continua 5×5.
    expect(gen({ system: "forca_5x5", goal: "forca", limitations: "dor no punho" }).system).toBe("forca_5x5");
  });

  it("idoso em Full Body de saúde: nada de terra, agachamento livre ou barra fixa, e tudo com 10+ repetições", () => {
    sweep({ systems: ["fullbody"], goals: ["saude", "forca"], levels: LEVELS, extra: { limitations: "idoso com artrose" } }, (p, input) => {
      for (const d of p.days) for (const e of strength(d)) {
        expect(["levantamento_terra", "agachamento_livre", "barra_fixa", "remada_curvada_barra", "desenvolvimento_barra"], where(input, d)).not.toContain(e.exerciseId);
        expect(e.repsMin, `${e.exerciseId} em ${where(input, d)}`).toBeGreaterThanOrEqual(10);
        expect(e.sets, e.exerciseId).toBeLessThanOrEqual(3);
      }
    });
  });
});

// ───────────────────────── 11. Determinismo ─────────────────────────

describe("11. determinismo", () => {
  it("mesma seed, mesma ficha", () => {
    sweep({ goals: ["hipertrofia", "emagrecimento"], equipments: EQUIPMENTS, minutes: [45, 90], seeds: SEEDS.slice(0, 3), extra: { emphasis: ["gluteos"], limitations: "dor no ombro" } }, (p, input) => {
      expect(signature(generateProgram(input, owner)), where(input)).toBe(signature(p));
    });
    expect(signature(gen())).toBe(signature(gen({ seed: 1 })));
  });

  it("seeds diferentes variam a ficha, sem sair das escolhas de personal", () => {
    for (const system of ["abc", "fullbody", "upper_lower"] as SystemId[]) {
      const variants = new Set(MANY_SEEDS.map((seed) => signature(gen({ system, seed }))));
      expect(variants.size, system).toBeGreaterThan(20);
    }
  });

  it("a nota de cada candidato é sorteada uma vez: os básicos dominam, as variações aparecem", () => {
    const tally = (pick: (p: Program) => string) => {
      const out = new Map<string, number>();
      for (const seed of Array.from({ length: 300 }, (_, i) => i + 1)) out.set(pick(gen({ seed })), (out.get(pick(gen({ seed }))) ?? 0) + 1);
      return out;
    };
    // 2º de quadríceps no ABC: leg press 45° na maioria, hack e leg horizontal dividem o resto.
    const second = tally((p) => p.days[2]!.exercises[1]!.exerciseId);
    expect([...second.keys()].sort()).toEqual(["hack", "leg_press", "leg_press_horizontal"]);
    expect(second.get("leg_press")!).toBeGreaterThan(150);
    expect(second.get("hack")!).toBeGreaterThan(10);
    // Principal de peito: supino reto com barra quase sempre, Smith e máquina às vezes.
    const bench = tally((p) => p.days[0]!.exercises[0]!.exerciseId);
    expect(bench.get("supino_reto_barra")!).toBeGreaterThan(180);
    expect(bench.size).toBeGreaterThanOrEqual(2);
    // Panturrilha: em pé domina, sentado aparece (antes o sorteio favorecia a ordem do catálogo).
    const calf = tally((p) => p.days[2]!.exercises.find((e) => ex(e).group === "panturrilhas")?.exerciseId ?? "-");
    expect(calf.get("panturrilha_em_pe")!).toBeGreaterThan(calf.get("panturrilha_sentado")!);
    expect(calf.get("panturrilha_sentado")!).toBeGreaterThan(15);
  });
});

// ───────────────────────── 12. Técnicas ─────────────────────────

describe("12. drop-set", () => {
  it("só para avançado em hipertrofia, um por dia, em isolado com carga (nunca core ou peso corporal)", () => {
    // Fora o 5×5, que não tem isolado com carga para receber a técnica.
    sweep({ systems: ALL.filter((id) => id !== "forca_5x5"), levels: ["avancado"], goals: ["hipertrofia"], equipments: EQUIPMENTS, minutes: [60, 90], seeds: SEEDS.slice(0, 6) }, (p, input) => {
      for (const d of p.days) {
        const drops = d.exercises.filter((e) => e.technique === "drop_set");
        expect(drops.length, where(input, d)).toBeLessThanOrEqual(1);
        for (const e of drops) {
          const x = ex(e);
          expect(x.compound, e.exerciseId).toBe(false);
          expect(x.pattern, e.exerciseId).toBe("isolado");
          expect(["maquina", "cabo", "halter"], e.exerciseId).toContain(x.implement);
          expect(["abdomen", "antebraco", "lombar", "cardio"], e.exerciseId).not.toContain(x.group);
        }
      }
      if (input.equipment === "academia") expect(all(p).some((e) => e.technique === "drop_set"), where(input)).toBe(true);
    });
    sweep({ levels: ["iniciante", "intermediario"], goals: GOALS, seeds: SEEDS.slice(0, 3) }, (p) => {
      expect(all(p).every((e) => e.technique === "normal")).toBe(true);
    });
    sweep({ levels: ["avancado"], goals: ["forca", "emagrecimento"], seeds: SEEDS.slice(0, 3) }, (p) => {
      expect(all(p).every((e) => e.technique === "normal")).toBe(true);
    });
  });
});

// ───────────────────────── 13. Observações ─────────────────────────

describe("13. observações da ficha", () => {
  it("a ficha orienta o aquecimento", () => {
    sweep({ goals: GOALS, equipments: EQUIPMENTS, seeds: [1] }, (p, input) => {
      expect(p.notes, where(input)).toMatch(/[Aa]quecimento/);
      expect(p.notes!.length).toBeLessThan(600);
    });
    expect(gen().notes).toContain("séries de aproximação");
    expect(gen({ equipment: "peso_corporal" }).notes).not.toContain("Carga inicial");
  });

  it("exercício unilateral leva “Repetições por lado.” (ou “Tempo por lado.”)", () => {
    sweep({ goals: ["hipertrofia", "saude"], equipments: EQUIPMENTS, seeds: SEEDS.slice(0, 4) }, (p, input) => {
      for (const e of all(p)) {
        if (!ex(e).unilateral) expect(e.notes ?? "", e.exerciseId).not.toContain("por lado");
        else expect(e.notes, `${e.exerciseId} em ${where(input)}`).toContain(e.unit === "seg" ? "Tempo por lado." : "Repetições por lado.");
      }
    });
    expect(buildPlanned(getExercise("agachamento_bulgaro")!, { sets: 3, repsMin: 8, repsMax: 12, restSec: 90 }).notes).toBe("Repetições por lado.");
    expect(buildPlanned(getExercise("prancha_lateral")!, { sets: 3, repsMin: 30, repsMax: 45, restSec: 45 })).toMatchObject({ notes: "Tempo por lado.", unit: "seg" });
    expect(buildPlanned(getExercise("leg_press")!, { sets: 3, repsMin: 8, repsMax: 12, restSec: 90 }).notes).toBeUndefined();
  });

  it("nome, sistema e origem da ficha", () => {
    const p = gen({ system: "abc_inferiores", goal: "emagrecimento" });
    expect(p).toMatchObject({ name: "ABC Glúteos · Emagrecimento", system: "abc_inferiores", source: "modelo", active: true, ownerId: "u1" });
    expect(p.days.map((d) => d.key)).toEqual(["A", "B", "C"]);
  });
});

// ───────────────────────── 14. Questionário: avoidIds, intensityCap e pós-parto (spec §8.4) ─────────────────────────

describe("14. entradas do questionário", () => {
  /** Ficha sem o que muda a cada chamada (ids, uids e datas). */
  const fingerprint = (p: Program): string => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = p;
    void _id;
    void _c;
    void _u;
    const days = rest.days.map((d) => ({ ...d, exercises: d.exercises.map(({ uid: _x, ...e }) => (void _x, e)) }));
    return createHash("sha256").update(JSON.stringify({ ...rest, days })).digest("hex").slice(0, 16);
  };
  // Impressões digitais tiradas com o generator.ts de ANTES do lote (commit 6d39f27), seed 42.
  const REGRESSAO: [GenerateInput, string][] = [
    [{ goal: "hipertrofia", level: "intermediario", daysPerWeek: 4, sessionMinutes: 60, equipment: "academia", system: "abc", seed: 42 }, "3c61b9d88461a445"],
    [{ goal: "saude", level: "iniciante", daysPerWeek: 3, sessionMinutes: 45, equipment: "peso_corporal", system: "fullbody", seed: 42 }, "4f815b65c0fe9842"],
    [{ goal: "forca", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "forca_5x5", seed: 42 }, "f86a508e815b722b"],
    [{ goal: "emagrecimento", level: "intermediario", daysPerWeek: 4, sessionMinutes: 60, equipment: "academia", system: "upper_lower", emphasis: ["gluteos"], limitations: "dor no joelho direito", seed: 42 }, "ac81b04f8cf42608"],
    [{ goal: "hipertrofia", level: "avancado", daysPerWeek: 6, sessionMinutes: 75, equipment: "academia", system: "ppl6", seed: 42 }, "7039952ecbc06ad2"],
  ];

  it.each(REGRESSAO)("regressão: sem avoidIds nem intensityCap, a ficha é a mesma de antes do lote (%#)", (input, hash) => {
    expect(fingerprint(generateProgram(input, owner))).toBe(hash);
    // avoidIds vazio e intensityCap ausente também não mudam nada.
    expect(fingerprint(generateProgram({ ...input, avoidIds: [], intensityCap: undefined }, owner))).toBe(hash);
  });

  const TODOS_NAO_QUER = Object.values(NAO_QUER_IDS).flat();

  it("avoidIds com todos os ids de NAO_QUER_IDS: nenhum aparece e cada dia continua completo", () => {
    sweep({ systems: ["fullbody", "abc", "upper_lower", "abcde", "ppl6", "abc_inferiores"], goals: ["hipertrofia", "emagrecimento", "condicionamento"], equipments: EQUIPMENTS, levels: ["iniciante", "intermediario"], seeds: SEEDS.slice(0, 3) }, (p, input) => {
      const sem = generateProgram({ ...input, avoidIds: TODOS_NAO_QUER }, owner);
      sem.days.forEach((d, i) => {
        for (const e of d.exercises) expect(TODOS_NAO_QUER, `${e.exerciseId} em ${where(input, d)}`).not.toContain(e.exerciseId);
        const antes = p.days[i]!.exercises.length;
        expect(d.exercises.length >= antes || d.exercises.length >= 4, `${where(input, d)} (antes ${antes})`).toBe(true);
      });
    });
  });

  it("avoidIds não muta o plano de limitações (o conjunto da limitação continua o mesmo)", () => {
    const text = "dor no joelho";
    const antes = [...analyzeLimitations(text).avoid].sort();
    generateProgram({ ...base, limitations: text, avoidIds: ["leg_press", "cadeira_extensora"], intensityCap: "moderada" }, owner);
    expect([...analyzeLimitations(text).avoid].sort()).toEqual(antes);
  });

  it("intensityCap: repetições a partir de 10, sem drop-set, sem tiros nem burpee e com a nota", () => {
    const NOTA = "Intensidade moderada (dá para conversar treinando): repetições a partir de 10, sem drop-set e sem tiros. Vale para esta ficha; ao gerar outra, o app confere de novo.";
    sweep({ systems: ["abc", "fullbody", "upper_lower", "ppl6", "abcde"], goals: GOALS, levels: LEVELS, equipments: ["academia", "home"], seeds: SEEDS.slice(0, 2), extra: { intensityCap: "moderada" } }, (p, input) => {
      expect(p.notes, where(input)).toContain(NOTA);
      for (const d of p.days)
        for (const e of d.exercises) {
          if ((e.unit ?? "reps") === "reps") {
            expect(e.repsMin, `${e.exerciseId} em ${where(input, d)}`).toBeGreaterThanOrEqual(10);
            expect(e.repsMax, `${e.exerciseId} em ${where(input, d)}`).toBeGreaterThanOrEqual(12);
          }
          expect(e.technique, `${e.exerciseId} em ${where(input, d)}`).not.toBe("drop_set");
          expect(["hiit_esteira", "hiit_bike", "burpee"], where(input, d)).not.toContain(e.exerciseId);
        }
    });
    // Avançado em hipertrofia: sem o teto tem drop-set; com o teto, não.
    const adv = { level: "avancado" as const, goal: "hipertrofia" as const, system: "abc" as const, sessionMinutes: 75 };
    expect(all(gen(adv)).some((e) => e.technique === "drop_set")).toBe(true);
    expect(all(gen({ ...adv, intensityCap: "moderada" })).some((e) => e.technique === "drop_set")).toBe(false);
    // Condicionamento em academia: sem o teto o fechamento pode ser tiro; com o teto, nunca.
    for (const seed of SEEDS) {
      const ids = all(gen({ goal: "condicionamento", sessionMinutes: 75, seed, intensityCap: "moderada" })).map((e) => e.exerciseId);
      expect(ids).not.toContain("hiit_esteira");
      expect(ids).not.toContain("hiit_bike");
    }
  });

  it("intensityCap: o 5×5 vira Full Body com a nota de hoje e nada de série pesada", () => {
    const p = gen({ system: "forca_5x5", goal: "forca", intensityCap: "moderada" });
    expect(p.system).toBe("fullbody");
    expect(p.notes).toContain("Full Body mais seguro");
    expect(all(p).some((e) => (e.unit ?? "reps") === "reps" && e.repsMin < 10)).toBe(false);
    // Sem o teto, o mesmo pedido continua 5×5.
    expect(gen({ system: "forca_5x5", goal: "forca" }).system).toBe("forca_5x5");
  });

  it("analyzeLimitations('pós-parto'): rótulo próprio, reconhecido, sem impacto nem flexão de tronco, ficha inteira conservadora", () => {
    const IMPACT = ["agachamento_salto", "burpee", "pular_corda", "polichinelo", "esteira_corrida", "corrida_rua", "hiit_esteira"];
    const TRUNK_FLEXION = [
      "abdominal_supra", "abdominal_infra", "abdominal_polia", "abdominal_maquina", "abdominal_declinado", "abdominal_canivete", "abdominal_remador",
      "abdominal_obliquo", "abdominal_bicicleta", "abdominal_infra_paralela", "abdominal_roda", "elevacao_pernas_barra", "russian_twist", "rotacao_tronco_polia",
    ];
    for (const text of ["pós-parto", "pos-parto recente", "puerpério"]) {
      const plan = analyzeLimitations(text);
      expect(plan.labels, text).toEqual(["pós-parto"]);
      expect(plan.unrecognized, text).toBe(false);
      expect(plan.population, text).toBe(true);
      for (const id of [...IMPACT, ...TRUNK_FLEXION]) expect(plan.avoid.has(id), `${id} (${text})`).toBe(true);
      expect(plan.minRepsFor("quadriceps")).toBe(10);
    }
    // Não dispara em palavras parecidas.
    expect(analyzeLimitations("parto normal há 2 anos").labels).not.toContain("pós-parto");
    // Na ficha: nada de impacto nem flexão de tronco.
    sweep({ systems: ["fullbody", "abc", "upper_lower"], goals: ["emagrecimento", "saude"], levels: ["iniciante"], equipments: ["academia", "home"], seeds: SEEDS.slice(0, 3), extra: { limitations: "pós-parto" } }, (p, input) => {
      for (const e of all(p)) expect([...IMPACT, ...TRUNK_FLEXION], `${e.exerciseId} em ${where(input)}`).not.toContain(e.exerciseId);
    });
  });
});
