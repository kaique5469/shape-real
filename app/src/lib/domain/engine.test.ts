import { afterEach, describe, expect, it } from "vitest";
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
 * Contrato do motor de fichas: cada regra que um personal cobraria numa ficha gerada sem IA,
 * conferida em muitas seeds, sistemas, níveis e equipamentos. As seções 5 a 13 ficam em generator.test.ts.
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

// ───────────────────────── Biblioteca ─────────────────────────

describe("biblioteca de exercícios", () => {
  it("ids únicos, nomes únicos e campos coerentes", () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(198);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    expect(new Set(EXERCISES.map((e) => e.name)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.id).toMatch(/^[a-z0-9_]+$/);
      if (e.group === "cardio") expect(e.pattern).toBe("cardio");
      if (e.unit === "min") expect(e.group).toBe("cardio");
      if (e.pattern === "mobilidade") expect(e.compound).toBe(false);
      if (e.main) expect(e.compound && e.implement === "barra").toBe(true);
      if (e.cue) expect(e.cue.length).toBeLessThanOrEqual(90);
    }
  });

  it("os ids antigos continuam existindo (histórico de cargas depende deles)", () => {
    for (const id of ["supino_reto_barra", "crucifixo_maquina", "terra_romeno_halter", "agachamento_livre_corporal", "farmer_walk", "abdominal_roda", "kettlebell_swing", "pulldown_braco_reto"]) {
      expect(getExercise(id), id).toBeDefined();
    }
  });

  it("nomes de academia e correções de campo da auditoria", () => {
    expect(getExercise("crucifixo_maquina")!.name).toBe("Voador (peck deck)");
    expect(getExercise("terra_romeno_halter")!.name).toBe("Stiff com halteres");
    expect(getExercise("elevacao_pelvica")!.name).toContain("hip thrust");
    expect(getExercise("abdominal_roda")!.implement).toBe("acessorio");
    expect(getExercise("abdominal_roda")!.home).toBeFalsy();
    expect(getExercise("farmer_walk")!.unit).toBe("seg");
    expect(getExercise("supino_inclinado_halter")!.home).toBeFalsy();
    expect(getExercise("kettlebell_swing")!.home).toBeFalsy();
    expect(getExercise("cadeira_adutora")!.group).toBe("adutores");
    expect(getExercise("esteira_caminhada")!.unit).toBe("min");
  });

  it("todo grupo tem exercício, inclusive adutores, lombar e cardio", () => {
    const groups = new Set(EXERCISES.map((e) => e.group));
    for (const g of ["peito", "costas", "ombros", "biceps", "triceps", "quadriceps", "posteriores", "gluteos", "panturrilhas", "abdomen", "antebraco", "adutores", "lombar", "cardio"]) {
      expect(groups.has(g as MuscleGroup), g).toBe(true);
    }
  });

  it("modelos e prioridades só citam exercícios que existem", () => {
    for (const s of SYSTEMS) for (const t of s.templates) for (const slot of t.slots) for (const id of slot.prefer ?? []) expect(getExercise(id), `${s.id}/${t.key}: ${id}`).toBeDefined();
    for (const spec of Object.values(EMPHASIS_SLOTS)) {
      for (const make of [spec!.compound, spec!.isolation, spec!.extra]) for (const id of make?.().prefer ?? []) expect(getExercise(id), id).toBeDefined();
    }
  });

  it("busca por apelido de academia, sem acento e com todas as palavras", () => {
    const found = (q: string) => searchExercises(q).map((e) => e.id);
    expect(found("peck deck")).toContain("crucifixo_maquina");
    expect(found("voador")).toContain("crucifixo_maquina");
    expect(found("pulley")).toEqual(expect.arrayContaining(["puxada_frente", "puxada_triangulo", "triceps_corda"]));
    expect(found("leg")[0]).toBe("leg_press");
    expect(found("gluteo")).toEqual(expect.arrayContaining(["elevacao_pelvica", "cadeira_abdutora", "gluteo_cabo"]));
    expect(found("glúteo")).toEqual(found("gluteo"));
    expect(found("rdl")).toEqual(expect.arrayContaining(["stiff", "terra_romeno_halter"]));
    expect(found("hip thrust")).toContain("elevacao_pelvica");
    expect(found("graviton")).toContain("barra_fixa_assistida");
    expect(found("triceps banco")).toContain("mergulho_banco");
    expect(found("trapezio")).toContain("encolhimento");
    expect(found("farmer")).toContain("farmer_walk");
    expect(found("pulley corda")).toContain("triceps_corda");
    expect(found("rosca direta polia")).toContain("rosca_cabo");
    expect(found("posterior de ombro")).toContain("face_pull");
    expect(found("stiff halter")).toContain("terra_romeno_halter");
    expect(found("SUPINO   inclinado")).toContain("supino_inclinado_halter");
    expect(found("zzzz")).toEqual([]);
    expect(searchExercises("", "adutores").every((e) => e.group === "adutores")).toBe(true);
    expect(searchExercises("supino", "ombros")).toEqual([]);
  });

  it("ordena a busca: do usuário, depois básicos (pri 2, 1) e os demais", () => {
    registerCustomExercises([{ id: "custom_supino_x", name: "Supino do meu jeito", group: "peito", implement: "barra", pattern: "empurrar_h", compound: true }]);
    const list = searchExercises("supino");
    expect(list[0]!.id).toBe("custom_supino_x");
    const rank = list.slice(1).map((e) => e.pri ?? 0);
    expect(rank).toEqual([...rank].sort((a, b) => b - a));
    expect(rank[0]).toBe(2);
    // Sem texto, a lista começa pelos básicos.
    expect(searchExercises("")[1]!.pri).toBe(2);
  });
});

// ───────────────────────── 1. Equipamento ─────────────────────────

describe("1. equipamento", () => {
  it("academia nunca recebe elástico nem regressão sem carga (exceto core)", () => {
    sweep({ goals: GOALS }, (p, input) => {
      for (const d of p.days)
        for (const e of d.exercises) {
          expect(ex(e).implement, where(input, d)).not.toBe("elastico");
          expect(isGymRegression(ex(e)), `${e.exerciseId} em ${where(input, d)}`).toBe(false);
        }
    });
  });

  it("em casa usa só halteres, elástico, caneleira e peso do corpo", () => {
    sweep({ equipments: ["home"], goals: GOALS, seeds: SEEDS.slice(0, 6) }, (p, input) => {
      for (const d of p.days) {
        expect(d.exercises.length, where(input, d)).toBeGreaterThanOrEqual(4);
        for (const e of d.exercises) {
          expect(ex(e).home, `${e.exerciseId} em ${where(input)}`).toBe(true);
          expect(["halter", "elastico", "caneleira", "peso_corporal", "acessorio"]).toContain(ex(e).implement);
        }
      }
    });
  });

  it("em casa prefere o exercício com carga ao sem carga quando o grupo tem os dois", () => {
    sweep({ equipments: ["home"], systems: ["upper_lower", "abc", "fullbody"], levels: ["intermediario"] }, (p, input) => {
      const picked = all(p).map(ex);
      // Há halteres: o agachamento e o stiff do dia de pernas usam halteres.
      expect(picked.some((e) => e.group === "quadriceps" && e.implement === "halter"), where(input)).toBe(true);
      expect(picked.some((e) => e.id === "terra_romeno_halter" || e.id === "stiff_unilateral"), where(input)).toBe(true);
    });
  });

  it("sem equipamento é sem equipamento mesmo, com 4+ exercícios e um de lombar por dia", () => {
    sweep({ equipments: ["peso_corporal"], goals: GOALS, minutes: [30, 45, 60], seeds: SEEDS.slice(0, 5) }, (p, input) => {
      for (const d of p.days) {
        expect(d.exercises.length, where(input, d)).toBeGreaterThanOrEqual(4);
        for (const e of d.exercises) {
          expect(ex(e).implement, where(input, d)).toBe("peso_corporal");
          expect(ex(e).home, e.exerciseId).toBe(true);
          expect(["barra_fixa", "barra_fixa_supinada", "paralelas_peito", "paralelas_triceps", "elevacao_pernas_barra", "abdominal_roda", "remada_invertida", "suspensao_barra"]).not.toContain(e.exerciseId);
        }
        expect(d.exercises.some((e) => ex(e).group === "lombar" || ex(e).pattern === "puxar_h" || ex(e).pattern === "puxar_v"), where(input, d)).toBe(true);
      }
    });
  });

  it("o 5×5 sem academia vira Full Body, com aviso", () => {
    for (const equipment of ["home", "peso_corporal"] as Equipment[]) {
      const p = gen({ system: "forca_5x5", goal: "forca", equipment });
      expect(p.system).toBe("fullbody");
      expect(p.notes).toContain("5×5 precisa de barra");
      for (const d of p.days) expect(d.exercises.length).toBeGreaterThanOrEqual(4);
      // Nada de 5×5 em exercício sem barra.
      expect(all(p).some((e) => e.repsMax <= 5)).toBe(false);
    }
  });

  it("alongamento e mobilidade nunca entram como exercício de força; cardio só fecha o dia", () => {
    sweep({ goals: GOALS, equipments: EQUIPMENTS, seeds: SEEDS.slice(0, 5) }, (p, input) => {
      for (const d of p.days) {
        d.exercises.forEach((e, i) => {
          expect(ex(e).pattern, where(input, d)).not.toBe("mobilidade");
          if (ex(e).group === "cardio") expect(i, where(input, d)).toBe(d.exercises.length - 1);
        });
        // O dia nunca abre com isometria.
        expect(d.exercises[0]!.unit ?? "reps", where(input, d)).toBe("reps");
      }
    });
  });

  it("allowedByEquipment separa academia, casa e sem equipamento", () => {
    const e = (id: string) => getExercise(id)!;
    expect(allowedByEquipment(e("leg_press"), "academia")).toBe(true);
    expect(allowedByEquipment(e("leg_press"), "home")).toBe(false);
    expect(allowedByEquipment(e("supino_reto_halter"), "home")).toBe(true);
    expect(allowedByEquipment(e("supino_reto_halter"), "peso_corporal")).toBe(false);
    expect(allowedByEquipment(e("flexao"), "peso_corporal")).toBe(true);
    for (const id of ["barra_fixa", "paralelas_peito", "abdominal_roda", "elevacao_pernas_barra", "kettlebell_swing"]) {
      expect(allowedByEquipment(e(id), "peso_corporal"), id).toBe(false);
      expect(allowedByEquipment(e(id), "home"), id).toBe(false);
    }
    expect(isGymRegression(e("remada_elastico"))).toBe(true);
    expect(isGymRegression(e("agachamento_livre_corporal"))).toBe(true);
    expect(isGymRegression(e("prancha"))).toBe(false);
    expect(isGymRegression(e("barra_fixa"))).toBe(false);
  });
});

// ───────────────────────── 2. Nível ─────────────────────────

describe("2. nível", () => {
  const NOT_5X5 = ALL.filter((s) => s !== "forca_5x5");

  it("iniciante nunca recebe os exercícios com nível mínimo", () => {
    sweep({ systems: NOT_5X5, levels: ["iniciante"], goals: GOALS, equipments: EQUIPMENTS, seeds: SEEDS.slice(0, 8) }, (p, input) => {
      for (const d of p.days) for (const e of d.exercises) expect(ex(e).minLevel, `${e.exerciseId} em ${where(input, d)}`).toBeUndefined();
    });
    const blocked = ["agachamento_livre", "levantamento_terra", "good_morning", "remada_curvada_barra", "barra_fixa", "desenvolvimento_barra", "agachamento_frontal", "agachamento_bulgaro", "abdominal_roda", "elevacao_pernas_barra", "paralelas_peito", "remada_cavalinho", "kettlebell_swing"];
    for (const id of blocked) expect(getExercise(id)!.minLevel, id).toBeDefined();
  });

  it("iniciante em academia abre os dias com máquina, Smith, polia ou halter", () => {
    sweep({ systems: NOT_5X5, levels: ["iniciante"], goals: GOALS }, (p, input) => {
      for (const d of p.days) {
        const first = ex(d.exercises[0]!);
        if (first.id === "supino_reto_barra" || first.id === "stiff") continue; // básicos leves que o personal usa desde o início
        expect(["maquina", "smith", "cabo", "halter"], `${first.id} em ${where(input, d)}`).toContain(first.implement);
      }
    });
    const legs = MANY_SEEDS.map((seed) => idsOf(gen({ level: "iniciante", seed }).days[2]!)[0]);
    expect(new Set(legs)).toEqual(new Set(["leg_press", "agachamento_smith", "leg_press_horizontal"].filter((id) => legs.includes(id))));
    expect(legs.filter((id) => id === "leg_press").length).toBeGreaterThan(legs.length / 2);
  });

  it("intermediário não recebe exercício de avançado", () => {
    sweep({ levels: ["intermediario"], goals: ["hipertrofia", "forca"], equipments: EQUIPMENTS, seeds: SEEDS.slice(0, 6) }, (p, input) => {
      for (const e of all(p)) expect(ex(e).minLevel, `${e.exerciseId} em ${where(input)}`).not.toBe("avancado");
    });
  });

  it("avançado nunca recebe graviton, goblet ou flexão de joelhos", () => {
    sweep({ levels: ["avancado"], goals: GOALS, equipments: EQUIPMENTS, seeds: SEEDS.slice(0, 6) }, (p, input) => {
      for (const id of all(p).map((e) => e.exerciseId)) {
        expect(["barra_fixa_assistida", "agachamento_goblet", "flexao_joelhos", "flexao_inclinada", "agachamento_banco"], where(input)).not.toContain(id);
      }
    });
  });

  it("no 5×5 os básicos com barra valem para todos os níveis (é o programa)", () => {
    for (const level of LEVELS) {
      const p = gen({ system: "forca_5x5", goal: "forca", level });
      expect(idsOf(p.days[0]!).slice(0, 3)).toEqual(["agachamento_livre", "supino_reto_barra", "remada_curvada_barra"]);
      expect(idsOf(p.days[1]!).slice(0, 3)).toEqual(["agachamento_livre", "desenvolvimento_barra", "levantamento_terra"]);
    }
  });
});

// ───────────────────────── 3. Escolhas e ordem ─────────────────────────

describe("3. escolhas e ordem dos exercícios", () => {
  const SPLITS: SystemId[] = ["abc", "abcd", "abcde", "upper_lower", "ppl", "ppl6"];
  const FLAT_FREE = ["supino_reto_barra", "supino_reto_halter", "supino_reto_smith"];

  it("com tempo de sobra, todo encaixe do modelo sai da lista de preferidos do personal", () => {
    sweep({ levels: ["intermediario"], minutes: [90] }, (p, input) => {
      const sys = getSystem(input.system);
      p.days.forEach((d, i) => {
        for (const slot of sys.templates[i]!.slots) {
          if (!slot.prefer || slot.optional) continue;
          expect(idsOf(d).some((id) => slot.prefer!.includes(id)), `${slot.prefer.join("|")} em ${where(input, d)}`).toBe(true);
        }
      });
    });
  });

  it("peito: inclinado como segundo supino e no máximo um supino reto livre", () => {
    sweep({ systems: [...SPLITS, "abcd_inferiores"], seeds: MANY_SEEDS.slice(0, 25) }, (p, input) => {
      for (const d of p.days) {
        const chest = d.exercises.filter((e) => ex(e).group === "peito");
        if (chest.length >= 2) expect(chest.some((e) => e.exerciseId.includes("inclinado")), where(input, d)).toBe(true);
        expect(chest.filter((e) => FLAT_FREE.includes(e.exerciseId)).length, where(input, d)).toBeLessThanOrEqual(1);
        expect(chest.filter((e) => ["crucifixo_maquina", "crucifixo_halter", "crucifixo_inclinado_halter"].includes(e.exerciseId)).length, where(input, d)).toBeLessThanOrEqual(1);
        expect(idsOf(d), where(input, d)).not.toContain("supino_declinado_barra");
      }
    });
  });

  it("ombros: elevação lateral nos dias de empurrar/ombros e posterior nos dias de puxar", () => {
    const LAT = ["elevacao_lateral", "elevacao_lateral_cabo", "elevacao_lateral_maquina"];
    const POST = ["crucifixo_inverso", "crucifixo_inverso_maquina", "crucifixo_inverso_cabo", "face_pull"];
    sweep({ systems: SPLITS, seeds: MANY_SEEDS.slice(0, 25) }, (p, input) => {
      const sys = getSystem(input.system);
      p.days.forEach((d, i) => {
        const slots = sys.templates[i]!.slots.filter((s) => !s.optional);
        const ids = idsOf(d);
        if (slots.some((s) => s.prefer?.includes("elevacao_lateral"))) expect(ids.some((id) => LAT.includes(id)), where(input, d)).toBe(true);
        if (slots.some((s) => s.prefer?.includes("face_pull"))) expect(ids.some((id) => POST.includes(id)), where(input, d)).toBe(true);
        expect(ids, where(input, d)).not.toContain("elevacao_frontal");
        expect(ids, where(input, d)).not.toContain("remada_alta");
        // Multiarticular de ombro nunca depois de isolado de ombro; e só um desenvolvimento por dia.
        const shoulders = d.exercises.filter((e) => ex(e).group === "ombros");
        const firstIso = shoulders.findIndex((e) => !ex(e).compound);
        if (firstIso >= 0) expect(shoulders.slice(firstIso).some((e) => ex(e).compound), where(input, d)).toBe(false);
        expect(shoulders.filter((e) => ex(e).compound).length, where(input, d)).toBeLessThanOrEqual(1);
      });
    });
  });

  it("dia de ombros (ABCD/ABCDE): desenvolvimento, duas laterais, posterior e trapézio", () => {
    for (const system of ["abcd", "abcde"] as SystemId[])
      for (const seed of MANY_SEEDS.slice(0, 25)) {
        const d = gen({ system, seed }).days[3]!;
        const ids = idsOf(d);
        expect(ex(d.exercises[0]!).pattern, ids.join()).toBe("empurrar_v");
        expect(ids.filter((id) => id.startsWith("elevacao_lateral")).length, ids.join()).toBe(2);
        expect(ids.some((id) => id.startsWith("crucifixo_inverso") || id === "face_pull"), ids.join()).toBe(true);
        expect(ids.some((id) => id.startsWith("encolhimento")), ids.join()).toBe(true);
      }
  });

  it("pernas: leg press/hack como segundo de quadríceps, stiff como dobradiça, terra só no encaixe principal", () => {
    sweep({ seeds: MANY_SEEDS.slice(0, 25) }, (p, input) => {
      const sys = getSystem(input.system);
      const withTerra = p.days.filter((d) => idsOf(d).includes("levantamento_terra"));
      expect(withTerra.length, where(input)).toBeLessThanOrEqual(1);
      p.days.forEach((d, i) => {
        const tpl = sys.templates[i]!;
        const ids = idsOf(d);
        expect(ids, where(input, d)).not.toContain("good_morning");
        expect(ids, where(input, d)).not.toContain("agachamento_frontal");
        if (input.system !== "forca_5x5") expect(ids.includes("agachamento_livre") && ids.includes("levantamento_terra"), where(input, d)).toBe(false);
        if (ids.includes("levantamento_terra")) expect(tpl.slots.some((s) => s.main && s.group === "posteriores"), where(input, d)).toBe(true);
        if (tpl.slots.some((s) => !s.optional && s.prefer?.includes("leg_press") && !s.prefer.includes("afundo"))) {
          expect(ids.some((id) => ["leg_press", "hack", "leg_press_horizontal"].includes(id)), where(input, d)).toBe(true);
        }
        // Nunca dois leg press, dois agachamentos com barra/Smith ou dois stiffs no mesmo dia.
        for (const family of [["leg_press", "leg_press_horizontal", "leg_press_unilateral"], ["agachamento_livre", "agachamento_smith", "agachamento_frontal"], ["stiff", "terra_romeno_halter", "stiff_smith"]]) {
          expect(ids.filter((id) => family.includes(id)).length, where(input, d)).toBeLessThanOrEqual(1);
        }
      });
    });
  });

  it("glúteo: a elevação pélvica é o multiarticular de glúteo em todo dia de pernas", () => {
    const THRUST = ["elevacao_pelvica", "elevacao_pelvica_maquina", "elevacao_pelvica_smith"];
    sweep({ seeds: MANY_SEEDS.slice(0, 25) }, (p, input) => {
      const sys = getSystem(input.system);
      p.days.forEach((d, i) => {
        const tpl = sys.templates[i]!;
        if (!tpl.slots.some((s) => !s.optional && s.group === "gluteos" && s.compound)) return;
        expect(idsOf(d).some((id) => THRUST.includes(id)), where(input, d)).toBe(true);
        expect(idsOf(d).filter((id) => THRUST.includes(id)).length, where(input, d)).toBe(1);
      });
      // Todo dia que anuncia glúteos no foco tem exercício direto de glúteo.
      p.days.forEach((d, i) => {
        if (sys.templates[i]!.focus.includes("gluteos")) expect(d.exercises.some((e) => ex(e).group === "gluteos"), where(input, d)).toBe(true);
      });
    });
  });

  it("braços: polia primeiro no tríceps, rosca direta/alternada/Scott primeiro no bíceps, sem pares redundantes", () => {
    const BI1 = ["rosca_direta_barra", "rosca_alternada", "rosca_scott", "rosca_direta_barra_w", "rosca_direta_halter"];
    sweep({ systems: ["abc", "abcd", "ppl", "upper_lower"], seeds: MANY_SEEDS.slice(0, 25) }, (p, input) => {
      for (const d of p.days) {
        const ids = idsOf(d);
        expect(ids.filter((id) => ["triceps_corda", "triceps_barra_polia", "triceps_inverso"].includes(id)).length, where(input, d)).toBeLessThanOrEqual(1);
        expect(ids.filter((id) => ["rosca_direta_barra", "rosca_direta_barra_w", "rosca_direta_halter", "rosca_cabo"].includes(id)).length, where(input, d)).toBeLessThanOrEqual(1);
        expect(ids, where(input, d)).not.toContain("triceps_coice");
        const biceps = d.exercises.filter((e) => ex(e).group === "biceps");
        if (biceps.length >= 2) expect(BI1, where(input, d)).toContain(biceps[0]!.exerciseId);
        const triceps = d.exercises.filter((e) => ex(e).group === "triceps");
        if (triceps.length >= 2 && input.system !== "ppl6") expect(["triceps_corda", "triceps_barra_polia"], where(input, d)).toContain(triceps[0]!.exerciseId);
      }
    });
  });

  it("ABCDE dia E é o dia de braços fixo: supino fechado e tríceps/bíceps alternados", () => {
    for (const seed of MANY_SEEDS.slice(0, 25)) {
      const d = gen({ system: "abcde", seed }).days[4]!;
      expect(d.exercises[0]!.exerciseId).toBe("supino_fechado");
      // Antebraço é opcional (entra quando sobra tempo), logo antes do abdômen.
      expect(d.exercises.map((e) => ex(e).group).filter((g) => g !== "antebraco")).toEqual(["triceps", "biceps", "triceps", "biceps", "triceps", "biceps", "abdomen"]);
      expect(idsOf(d).some((id) => ["triceps_corda", "triceps_barra_polia"].includes(id))).toBe(true);
      expect(idsOf(d)).toContain(idsOf(d).find((id) => ["rosca_martelo", "rosca_martelo_corda"].includes(id)));
    }
  });

  it("dentro do grupo, multiarticular vem antes de isolado; abdômen e panturrilha fecham o dia", () => {
    sweep({ goals: ["hipertrofia", "emagrecimento"], seeds: SEEDS.slice(0, 8) }, (p, input) => {
      for (const d of p.days) {
        const groups = new Set(d.exercises.map((e) => ex(e).group));
        for (const g of groups) {
          const mine = d.exercises.filter((e) => ex(e).group === g);
          const firstIso = mine.findIndex((e) => !ex(e).compound);
          if (firstIso >= 0) expect(mine.slice(firstIso).some((e) => ex(e).compound), `${g} em ${where(input, d)}`).toBe(false);
        }
        const firstAbs = d.exercises.findIndex((e) => ex(e).group === "abdomen");
        if (firstAbs >= 0) expect(d.exercises.slice(firstAbs).every((e) => ["abdomen", "cardio", "antebraco"].includes(ex(e).group)), where(input, d)).toBe(true);
      }
    });
  });

  it("os básicos pesados com barra só aparecem como levantamento principal", () => {
    sweep({ goals: GOALS, seeds: SEEDS.slice(0, 8) }, (p, input) => {
      const sys = getSystem(input.system);
      p.days.forEach((d, i) => {
        const tpl = sys.templates[i]!;
        for (const e of d.exercises) {
          if (!ex(e).main || e.exerciseId === "supino_reto_barra") continue;
          expect(tpl.slots.some((s) => s.main && s.group === ex(e).group), `${e.exerciseId} em ${where(input, d)}`).toBe(true);
        }
      });
    });
  });

  it("nenhum exercício repetido no dia", () => {
    sweep({ goals: GOALS, equipments: EQUIPMENTS, minutes: [45, 90], seeds: SEEDS.slice(0, 4) }, (p, input) => {
      for (const d of p.days) expect(new Set(idsOf(d)).size, where(input, d)).toBe(d.exercises.length);
    });
  });
});

// ───────────────────────── 4. Séries, repetições e descanso ─────────────────────────

describe("4. faixa pesada e esquemas", () => {
  it("hipertrofia: no máximo um exercício na faixa 6–8 por dia, sempre multiarticular com barra, Smith ou máquina", () => {
    // O 5×5 é a exceção desenhada: três básicos pesados por dia são o próprio programa.
    sweep({ systems: ALL.filter((id) => id !== "forca_5x5"), levels: ["intermediario", "avancado"], minutes: [45, 60, 90] }, (p, input) => {
      for (const d of p.days) {
        const heavy = strength(d).filter((e) => e.repsMax <= 8);
        expect(heavy.length, where(input, d)).toBeLessThanOrEqual(d.key === "U1" ? 2 : 1);
        for (const e of heavy) {
          expect(ex(e).compound, e.exerciseId).toBe(true);
          expect(["barra", "smith", "maquina"], e.exerciseId).toContain(ex(e).implement);
          expect(ex(e).unilateral, e.exerciseId).toBeFalsy();
        }
        for (const e of strength(d)) expect(e.repsMin, `${e.exerciseId} em ${where(input, d)}`).toBeGreaterThanOrEqual(6);
      }
    });
  });

  it("força: 3–5 repetições só no básico com barra do encaixe principal", () => {
    sweep({ systems: ALL.filter((s) => s !== "forca_5x5"), levels: ["intermediario", "avancado"], goals: ["forca"], minutes: [45, 60, 90] }, (p, input) => {
      for (const d of p.days) {
        const heavy = strength(d).filter((e) => e.repsMax <= 5);
        expect(heavy.length, where(input, d)).toBeLessThanOrEqual(d.key === "U1" ? 2 : 1);
        for (const e of heavy) expect(ex(e).main, e.exerciseId).toBe(true);
        // O principal abre o dia.
        if (heavy.length) expect(d.exercises[0]!.repsMax, where(input, d)).toBeLessThanOrEqual(5);
        for (const e of strength(d)) {
          const light = ["halter", "cabo", "peso_corporal", "elastico", "caneleira"].includes(ex(e).implement) || ex(e).unilateral;
          // Acessório nunca em faixa de força máxima nem com 2:30 de descanso.
          if (light) {
            expect(e.repsMin, `${e.exerciseId} em ${where(input, d)}`).toBeGreaterThanOrEqual(6);
            expect(e.restSec, e.exerciseId).toBeLessThanOrEqual(120);
          }
          if (!ex(e).compound) expect(e.repsMin, e.exerciseId).toBeGreaterThanOrEqual(8);
        }
      }
    });
  });

  it("5×5: 5×5 nos básicos (3×5 iniciante, 5×3–5 avançado) e terra 1×5", () => {
    const main = (level: Level) => gen({ system: "forca_5x5", goal: "forca", level, sessionMinutes: 75 });
    for (const [level, sets, repsMin] of [["iniciante", 3, 5], ["intermediario", 5, 5], ["avancado", 5, 3]] as [Level, number, number][]) {
      const p = main(level);
      for (const e of p.days[0]!.exercises.slice(0, 3)) expect([e.sets, e.repsMin, e.repsMax, e.restSec], `${level} ${e.exerciseId}`).toEqual([sets, repsMin, 5, 180]);
      const terra = p.days[1]!.exercises.find((e) => e.exerciseId === "levantamento_terra")!;
      expect([terra.sets, terra.repsMin, terra.repsMax]).toEqual([1, 5, 5]);
      expect(p.days[1]!.exercises.some((e) => ex(e).pattern === "puxar_v")).toBe(true);
      expect(p.notes).toContain("suba 2,5 kg");
    }
    // Com tempo curto os principais encolhem juntos (nunca 5×5 + 4×5).
    for (const sessionMinutes of [30, 45, 60]) {
      const d = gen({ system: "forca_5x5", goal: "forca", sessionMinutes }).days[0]!;
      const mains = d.exercises.filter((e) => ex(e).main);
      expect(mains.length).toBe(3);
      expect(new Set(mains.map((e) => `${e.sets}x${e.repsMin}/${e.restSec}`)).size, `${sessionMinutes} min`).toBe(1);
    }
  });

  it("iniciante: 3 séries, 10–15 repetições e descanso curto (força: sem faixa de 3–5)", () => {
    sweep({ systems: ALL.filter((s) => s !== "forca_5x5"), levels: ["iniciante"], goals: GOALS, minutes: [45, 60, 90] }, (p, input) => {
      for (const d of p.days)
        for (const e of strength(d)) {
          const tag = `${e.exerciseId} em ${where(input, d)}`;
          expect(e.sets, tag).toBeLessThanOrEqual(3);
          expect(e.technique, tag).toBe("normal");
          if (input.goal === "forca") {
            expect(e.repsMin, tag).toBeGreaterThanOrEqual(5);
            expect(e.repsMax, tag).toBeGreaterThanOrEqual(8);
          } else {
            expect(e.repsMin, tag).toBeGreaterThanOrEqual(10);
            expect(e.repsMax, tag).toBeLessThanOrEqual(20);
            expect(e.restSec, tag).toBeLessThanOrEqual(90);
          }
        }
    });
    // Sem cortes de tempo, são 3 séries cravadas.
    for (const e of strength(gen({ level: "iniciante", sessionMinutes: 75 }).days[0]!)) expect(e.sets).toBe(3);
  });

  it("iniciante tem no máximo 7 exercícios de força por dia nos modelos de até 7 encaixes", () => {
    sweep({ systems: ["fullbody", "abc", "abcd", "upper_lower", "ppl", "ab"], levels: ["iniciante"], goals: GOALS, minutes: [60, 90] }, (p, input) => {
      for (const d of p.days) expect(d.exercises.filter((e) => ex(e).group !== "cardio").length, where(input, d)).toBeLessThanOrEqual(7);
    });
  });

  it("dias de força e de volume diferem de verdade (Upper/Lower e PPL 6x)", () => {
    for (const seed of SEEDS) {
      const ul = gen({ system: "upper_lower", daysPerWeek: 4, seed });
      const [u1, , u2] = ul.days;
      expect(u1!.title).toContain("(força)");
      expect(u2!.title).toContain("(volume)");
      expect(strength(u1!).filter((e) => e.repsMax <= 8).length).toBe(2);
      expect(strength(u2!).some((e) => e.repsMax <= 8)).toBe(false);
      for (const e of strength(u2!).filter((x) => ex(x).compound)) expect(e.repsMin, e.exerciseId).toBeGreaterThanOrEqual(8);
      for (const e of strength(u2!).filter((x) => !ex(x).compound && !["elastico", "caneleira", "peso_corporal"].includes(ex(x).implement))) expect([e.repsMin, e.repsMax]).toEqual([12, 15]);

      const ppl6 = gen({ system: "ppl6", daysPerWeek: 6, seed });
      expect(ppl6.days[0]!.exercises[0]!.repsMax).toBe(8);
      expect(ppl6.days[3]!.exercises[0]!.repsMin).toBeGreaterThanOrEqual(8);
      expect(ppl6.days[3]!.title).toContain("(volume)");
    }
    // Iniciante e objetivos sem dia pesado não levam o rótulo.
    expect(gen({ system: "upper_lower", level: "iniciante" }).days[0]!.title).toBe("Superiores A");
    expect(gen({ system: "upper_lower", goal: "emagrecimento" }).days[0]!.title).toBe("Superiores A");
    expect(gen({ system: "upper_lower", goal: "emagrecimento" }).days.every((d) => !/força|volume/.test(d.title))).toBe(true);
  });

  it("levantamento terra nunca com repetições altas", () => {
    sweep({ goals: ["hipertrofia", "forca"], levels: ["intermediario", "avancado"], seeds: MANY_SEEDS.slice(0, 30) }, (p, input) => {
      for (const e of all(p).filter((x) => x.exerciseId === "levantamento_terra")) expect(e.repsMax, where(input)).toBeLessThanOrEqual(8);
    });
  });

  it("sem carga, elástico e caneleira: repetições altas e descanso curto, nunca esquema pesado", () => {
    sweep({ equipments: ["home", "peso_corporal"], goals: ["hipertrofia", "forca"], seeds: SEEDS.slice(0, 5) }, (p, input) => {
      for (const d of p.days)
        for (const e of strength(d)) {
          if (!["peso_corporal", "elastico", "caneleira"].includes(ex(e).implement)) continue;
          expect(e.repsMax, `${e.exerciseId} em ${where(input, d)}`).toBeGreaterThanOrEqual(10);
          expect(e.restSec, e.exerciseId).toBeLessThanOrEqual(90);
        }
    });
  });

  it("repScheme: core, isometria, cardio e ABC 6x", () => {
    const s = (id: string, level: Level = "intermediario", goal: Goal = "hipertrofia", main = false) => repScheme(goal, level, getExercise(id)!, "abc", main);
    expect(s("prancha")).toEqual({ sets: 3, repsMin: 30, repsMax: 45, restSec: 45 });
    expect(s("prancha", "iniciante").repsMax).toBe(30);
    expect(s("abdominal_roda")).toEqual({ sets: 3, repsMin: 8, repsMax: 12, restSec: 60 });
    expect(s("pallof").repsMax).toBe(12);
    expect(s("abdominal_supra")).toEqual({ sets: 3, repsMin: 15, repsMax: 20, restSec: 45 });
    expect(s("esteira_caminhada")).toEqual({ sets: 1, repsMin: 20, repsMax: 30, restSec: 0 });
    expect(s("hiit_bike").repsMax).toBe(15);
    expect(s("alongamento_posteriores").sets).toBe(2);
    // Compatível com o editor: (goal, level, ex, system, false).
    expect(s("supino_inclinado_halter")).toEqual({ sets: 3, repsMin: 8, repsMax: 12, restSec: 120 });
    expect(s("supino_reto_barra", "intermediario", "hipertrofia", true)).toEqual({ sets: 4, repsMin: 6, repsMax: 8, restSec: 150 });
    // ABC 6x (mesmo treino 2x na semana): sem a série extra do avançado.
    const six = gen({ level: "avancado", daysPerWeek: 6, sessionMinutes: 90 });
    for (const e of all(six).filter((x) => (x.unit ?? "reps") === "reps")) expect(e.sets, e.exerciseId).toBeLessThanOrEqual(4);
    expect(all(six).filter((e) => e.sets === 4).length).toBeLessThanOrEqual(3);
  });
});

// ───────────────────────── Progressão ─────────────────────────

const log = (sets: [number | null, number][], id = "supino_reto_barra", planned?: ExerciseLog["planned"]): ExerciseLog => ({
  uid: "x",
  exerciseId: id,
  name: id,
  planned,
  sets: sets.map(([loadKg, reps]) => ({ loadKg, reps, done: true })),
});
const session = (id: string, startedAt: string, logs: ExerciseLog[]): Session => ({ id, userId: "u1", startedAt, exercises: logs, volumeKg: 0, prs: [] });
const range = { sets: 3, repsMin: 8, repsMax: 12 };

describe("progressão: incrementos de carga", () => {
  it("segue o que existe nas academias brasileiras", () => {
    expect(loadIncrement("elevacao_lateral", 3)).toBe(1);
    expect(loadIncrement("elevacao_lateral", 10)).toBe(2);
    expect(loadIncrement("supino_reto_barra", 40)).toBe(2.5);
    expect(loadIncrement("agachamento_livre", 30)).toBe(2.5);
    expect(loadIncrement("agachamento_livre", 80)).toBe(5);
    expect(loadIncrement("leg_press", 200)).toBe(10);
    expect(loadIncrement("cadeira_extensora", 40)).toBe(5);
    expect(loadIncrement("triceps_corda", 12.5)).toBe(2.5);
    expect(loadIncrement("triceps_corda", 30)).toBe(5);
    expect(loadIncrement("kettlebell_swing", 8)).toBe(2);
    expect(loadIncrement("kettlebell_swing", 12)).toBe(4);
    expect(loadIncrement("gluteo_4_apoios_caneleira", 3)).toBe(1);
    expect(loadIncrement("abdominal_roda")).toBe(0);
    expect(loadIncrement("flexao")).toBe(0);
    expect(loadIncrement("remada_elastico")).toBe(0);
    // Compatível com a chamada antiga, sem carga atual.
    expect(loadIncrement("supino_reto_barra")).toBe(2.5);
  });
});

describe("progressão: suggestNext", () => {
  it("sobe ao fechar o topo, com o passo do equipamento", () => {
    expect(suggestNext(log([[40, 12], [40, 12], [40, 12]]), range, "supino_reto_barra")).toMatchObject({ kind: "aumentar", loadKg: 42.5 });
    expect(suggestNext(log([[3, 15], [3, 15], [3, 15]], "elevacao_lateral"), { sets: 3, repsMin: 10, repsMax: 15 }, "elevacao_lateral").loadKg).toBe(4);
    expect(suggestNext(log([[10, 12], [10, 12], [10, 12]], "rosca_alternada"), range, "rosca_alternada").loadKg).toBe(12);
    expect(suggestNext(log([[11, 12], [11, 12], [11, 12]], "rosca_alternada"), range, "rosca_alternada").loadKg).toBe(12);
    expect(suggestNext(log([[200, 12], [200, 12], [200, 12]], "leg_press"), range, "leg_press").loadKg).toBe(210);
    const cable = suggestNext(log([[25, 15], [25, 15], [25, 15]], "triceps_corda"), { sets: 3, repsMin: 10, repsMax: 15 }, "triceps_corda");
    expect(cable.loadKg).toBe(27.5);
    expect(cable.text).toContain("próxima placa");
    // Série extra não bloqueia a subida.
    expect(suggestNext(log([[40, 12], [40, 12], [40, 12], [40, 10]]), range, "supino_reto_barra").kind).toBe("aumentar");
    // 5×5: agachamento sobe 2,5 kg mesmo acima de 70 kg; fora das séries fixas sobe 5.
    expect(suggestNext(log([[100, 5], [100, 5], [100, 5], [100, 5], [100, 5]], "agachamento_livre"), { sets: 5, repsMin: 5, repsMax: 5 }, "agachamento_livre").loadKg).toBe(102.5);
    expect(suggestNext(log([[80, 8], [80, 8], [80, 8]], "agachamento_livre"), { sets: 3, repsMin: 6, repsMax: 8 }, "agachamento_livre").loadKg).toBe(85);
  });

  it("mantém com fadiga normal e diz quanto falta", () => {
    const keep = suggestNext(log([[40, 10], [40, 9], [40, 8]]), range, "supino_reto_barra");
    expect(keep).toMatchObject({ kind: "manter", loadKg: 40 });
    expect(keep.text).toBe("Manter 40 kg: faltaram 9 reps para fechar 3×12.");
    // Casos que antes mandavam reduzir sem motivo.
    expect(suggestNext(log([[40, 8], [40, 8], [40, 7], [40, 6]]), { sets: 4, repsMin: 8, repsMax: 12 }, "supino_reto_barra").kind).toBe("manter");
    expect(suggestNext(log([[100, 5], [100, 5], [100, 4], [100, 4], [100, 4]], "agachamento_livre"), { sets: 5, repsMin: 5, repsMax: 5 }, "agachamento_livre").kind).toBe("manter");
    expect(suggestNext(log([[40, 9], [40, 9], [40, 9]]), { sets: 3, repsMin: 10, repsMax: 10 }, "supino_reto_barra").kind).toBe("manter");
  });

  it("reduz só quando a carga está claramente acima, e nunca para a mesma carga", () => {
    expect(suggestNext(log([[60, 5], [60, 4], [60, 6]]), range, "supino_reto_barra")).toMatchObject({ kind: "reduzir", loadKg: 57.5 });
    expect(suggestNext(log([[100, 3], [100, 3], [100, 2], [100, 2], [100, 2]], "agachamento_livre"), { sets: 5, repsMin: 5, repsMax: 5 }, "agachamento_livre")).toMatchObject({ kind: "reduzir", loadKg: 90 });
    const cases: [string, number][] = [["elevacao_lateral", 7], ["elevacao_lateral", 4], ["crucifixo_maquina", 20], ["triceps_corda", 12.5], ["elevacao_lateral_cabo", 5], ["rosca_direta_barra", 20], ["rosca_direta_barra", 22.5], ["rosca_alternada", 12]];
    for (const [id, kg] of cases) {
      const s = suggestNext(log([[kg, 4], [kg, 4], [kg, 3]], id), range, id);
      expect(s.kind, `${id} ${kg}`).toBe("reduzir");
      expect(s.loadKg!, `${id} ${kg}`).toBeLessThan(kg);
      expect(s.loadKg!, `${id} ${kg}`).toBeGreaterThan(0);
    }
    expect(suggestNext(log([[12, 4], [12, 4], [12, 3]], "rosca_alternada"), range, "rosca_alternada").loadKg).toBe(10);
    // Menor carga possível: não há para onde reduzir.
    expect(suggestNext(log([[2.5, 4], [2.5, 3], [2.5, 3]], "elevacao_lateral_cabo"), range, "elevacao_lateral_cabo").kind).toBe("manter");
  });

  it("pirâmide, drop-set e cargas variadas não viram redução", () => {
    const pyramid = suggestNext(log([[50, 12], [55, 10], [60, 6]]), range, "supino_reto_barra");
    expect(pyramid).toMatchObject({ kind: "manter", loadKg: 60 });
    expect(pyramid.text).toContain("Cargas variadas");
    expect(suggestNext(log([[60, 12], [60, 12], [60, 12]]), { ...range, technique: "piramide" }, "supino_reto_barra").kind).toBe("manter");
    expect(suggestNext(log([[60, 5], [60, 5], [60, 5]]), { ...range, technique: "drop_set" }, "supino_reto_barra").kind).toBe("manter");
    // Aquecimento registrado + séries completas na carga de trabalho: avalia normalmente.
    expect(suggestNext(log([[40, 12], [60, 12], [60, 12], [60, 12]]), range, "supino_reto_barra").kind).toBe("aumentar");
  });

  it("faixa de repetições nova: recomeça de uma carga estimada, sem mandar reduzir", () => {
    const last = log([[100, 5], [100, 5], [100, 5], [100, 5], [100, 5]], "supino_reto_barra", { sets: 5, repsMin: 5, repsMax: 5 });
    const s = suggestNext(last, { sets: 3, repsMin: 10, repsMax: 15 }, "supino_reto_barra");
    expect(s.kind).toBe("primeira");
    expect(s.loadKg!).toBeGreaterThan(60);
    expect(s.loadKg!).toBeLessThan(85);
    expect(s.loadKg! % 2.5).toBe(0);
    expect(s.text).toContain("faixa de repetições mudou");
    // Mesma faixa (ou quase): segue a progressão normal.
    expect(suggestNext(log([[40, 12], [40, 12], [40, 12]], "supino_reto_barra", { sets: 3, repsMin: 8, repsMax: 12 }), range, "supino_reto_barra").kind).toBe("aumentar");
  });

  it("exercício contado em tempo progride em tempo, nunca em carga", () => {
    const plank = { sets: 3, repsMin: 30, repsMax: 45, unit: "seg" as const };
    const top = suggestNext(log([[null, 45], [null, 45], [null, 45]], "prancha"), plank, "prancha");
    expect(top).toMatchObject({ kind: "reps", loadKg: null });
    expect(top.text).toContain("45 s");
    expect(top.text).not.toContain("reps");
    expect(suggestNext(log([[null, 40], [null, 35], [null, 30]], "prancha"), plank, "prancha").text).toBe("Busque 45 s em todas as séries.");
    // Sem `unit` no planejado, vale a unidade do exercício.
    expect(suggestNext(log([[null, 45], [null, 45], [null, 45]], "prancha"), { sets: 3, repsMin: 30, repsMax: 45 }, "prancha").text).toContain("45 s");
    const walk = suggestNext(log([[null, 20]], "esteira_caminhada"), { sets: 1, repsMin: 20, repsMax: 20, unit: "min" }, "esteira_caminhada");
    expect(walk).toMatchObject({ kind: "reps", loadKg: null });
    expect(walk.text).toContain("min");
    // Mesmo com carga registrada por engano, exercício de tempo nunca sugere carga.
    expect(suggestNext(log([[20, 45], [20, 45], [20, 45]], "prancha"), plank, "prancha").loadKg).toBeNull();
    expect(suggestNext(null, plank, "prancha").text).not.toContain("carga");
    expect(suggestNext(null, range, "supino_reto_barra")).toMatchObject({ kind: "primeira", loadKg: null });
  });

  it("peso corporal: repetições; com peso extra, sobe o peso extra; máquina sem carga registrada pede o registro", () => {
    expect(suggestNext(log([[0, 12], [0, 12], [0, 12]], "barra_fixa"), range, "barra_fixa")).toMatchObject({ kind: "reps", loadKg: null });
    expect(suggestNext(log([[null, 10], [null, 9], [null, 8]], "flexao"), range, "flexao")).toMatchObject({ kind: "manter", loadKg: null });
    const extra = suggestNext(log([[10, 12], [10, 12], [10, 12]], "barra_fixa"), range, "barra_fixa");
    expect(extra).toMatchObject({ kind: "aumentar", loadKg: 12.5 });
    expect(extra.text).toContain("peso extra");
    expect(suggestNext(log([[0, 12], [0, 12], [0, 12]], "cadeira_extensora"), range, "cadeira_extensora")).toMatchObject({ kind: "primeira", loadKg: null });
    expect(suggestNext(log([[0, 12], [0, 12], [0, 12]], "cadeira_extensora"), range, "cadeira_extensora").text).toContain("Registre a carga");
    // Caneleira é opcional: sem ela, progride por repetições.
    expect(suggestNext(log([[null, 20], [null, 20], [null, 20]], "gluteo_4_apoios_caneleira"), { sets: 3, repsMin: 12, repsMax: 20 }, "gluteo_4_apoios_caneleira").kind).toBe("reps");
    expect(suggestNext(log([[3, 20], [3, 20], [3, 20]], "gluteo_4_apoios_caneleira"), { sets: 3, repsMin: 12, repsMax: 20 }, "gluteo_4_apoios_caneleira").loadKg).toBe(4);
  });

  it("graviton: progredir é tirar ajuda", () => {
    const up = suggestNext(log([[30, 12], [30, 12], [30, 12]], "barra_fixa_assistida"), range, "barra_fixa_assistida");
    expect(up).toMatchObject({ kind: "aumentar", loadKg: 25 });
    expect(up.text).toContain("Reduza a ajuda");
    const down = suggestNext(log([[30, 5], [30, 4], [30, 4]], "barra_fixa_assistida"), range, "barra_fixa_assistida");
    expect(down).toMatchObject({ kind: "reduzir", loadKg: 35 });
    expect(down.text).toContain("Aumente a ajuda");
    expect(suggestNext(log([[30, 10], [30, 9], [30, 8]], "barra_fixa_assistida"), range, "barra_fixa_assistida")).toMatchObject({ kind: "manter", loadKg: 30 });
    expect(suggestNext(log([[5, 12], [5, 12], [5, 12]], "barra_fixa_assistida"), range, "barra_fixa_assistida").loadKg).toBe(0);
  });
});

describe("progressão: recordes", () => {
  const at = (n: number) => `2026-02-${String(n).padStart(2, "0")}T10:00:00Z`;
  const pr = (prev: ExerciseLog, now: ExerciseLog) => detectPRs(session("b", at(8), [now]), [session("a", at(1), [prev]), session("b", at(8), [now])]);

  it("vale 1RM estimado, carga máxima e repetições na carga máxima", () => {
    expect(pr(log([[60, 8]]), log([[62.5, 8]]))).toEqual(["supino_reto_barra"]);
    // Acima de 12 reps o 1RM estimado empata: conta o recorde de repetições.
    expect(pr(log([[60, 12]]), log([[60, 15]]))).toEqual(["supino_reto_barra"]);
    // Carga inédita com menos repetições (1RM estimado menor) também é recorde.
    expect(pr(log([[60, 10]]), log([[65, 6]]))).toEqual(["supino_reto_barra"]);
    expect(pr(log([[60, 10]]), log([[60, 10]]))).toEqual([]);
    expect(pr(log([[60, 10]]), log([[55, 10]]))).toEqual([]);
    // Série leve de aquecimento com muitas repetições não é recorde.
    expect(pr(log([[60, 10]]), log([[20, 20], [60, 9]]))).toEqual([]);
  });

  it("peso corporal e isometria batem recorde por repetições ou segundos", () => {
    expect(pr(log([[null, 8]], "barra_fixa"), log([[null, 12]], "barra_fixa"))).toEqual(["barra_fixa"]);
    expect(pr(log([[null, 30]], "prancha"), log([[null, 60]], "prancha"))).toEqual(["prancha"]);
    expect(pr(log([[null, 12]], "barra_fixa"), log([[null, 10]], "barra_fixa"))).toEqual([]);
    // Aeróbio em minutos não gera recorde.
    expect(pr(log([[null, 20]], "esteira_caminhada"), log([[null, 30]], "esteira_caminhada"))).toEqual([]);
  });

  it("sem histórico não há recorde; sem duplicatas; erro de digitação é ignorado", () => {
    const first = session("a", at(1), [log([[60, 8]])]);
    expect(detectPRs(first, [first])).toEqual([]);
    const twice = session("b", at(8), [log([[62.5, 8]]), log([[65, 8]])]);
    expect(detectPRs(twice, [first, twice])).toEqual(["supino_reto_barra"]);
    expect(pr(log([[60, 8]]), log([[600, 8]]))).toEqual([]);
    // Sessões futuras não contam como histórico.
    const later = session("c", at(20), [log([[100, 8]])]);
    expect(detectPRs(twice, [first, twice, later])).toEqual(["supino_reto_barra"]);
  });

  it("graviton: recorde é fazer com menos ajuda", () => {
    expect(pr(log([[40, 8]], "barra_fixa_assistida"), log([[30, 8]], "barra_fixa_assistida"))).toEqual(["barra_fixa_assistida"]);
    expect(pr(log([[30, 8]], "barra_fixa_assistida"), log([[40, 8]], "barra_fixa_assistida"))).toEqual([]);
    expect(e1rmSeries([session("a", at(1), [log([[30, 8]], "barra_fixa_assistida")])], "barra_fixa_assistida")).toEqual([]);
  });

  it("a série do gráfico prefere as séries de até 12 repetições", () => {
    const s = session("a", at(1), [log([[40, 20], [60, 8]])]);
    expect(e1rmSeries([s], "supino_reto_barra")).toEqual([{ date: "2026-02-01", value: 76 }]);
    // Só séries longas: ainda mostra o ponto.
    expect(e1rmSeries([session("a", at(1), [log([[40, 20]])])], "supino_reto_barra")).toHaveLength(1);
  });
});

// ───────────────────────── Sugestão de carga: por que esse peso ─────────────────────────

const iso = (d: string) => `${d}T12:00:00Z`;
const DAY_MS = 86_400_000;
const lat = { sets: 3, repsMin: 10, repsMax: 12 };

describe("progressão: lastPerformance com data", () => {
  const a = session("a", iso("2026-03-01"), [log([[40, 10]])]);
  const b = session("b", iso("2026-03-08"), [log([[42.5, 8]]), log([[20, 12]], "elevacao_lateral")]);
  const c = session("c", iso("2026-03-15"), [log([[20, 12]], "elevacao_lateral")]);
  // Exercício presente mas sem série feita não conta.
  const d = session("d", iso("2026-03-20"), [{ ...log([[45, 8]]), sets: [{ loadKg: 45, reps: 8, done: false }] }]);
  const all = [a, c, d, b];

  it("devolve o registro e a data do treino; lastPerformance continua devolvendo só o registro", () => {
    expect(lastPerformanceWithDate(all, "supino_reto_barra")).toEqual({ log: b.exercises[0], startedAt: b.startedAt });
    expect(lastPerformance(all, "supino_reto_barra")).toBe(b.exercises[0]);
    expect(lastPerformanceWithDate(all, "supino_reto_barra", b.startedAt)?.startedAt).toBe(a.startedAt);
    expect(lastPerformanceWithDate(all, "agachamento_livre")).toBeNull();
    expect(lastPerformance(all, "agachamento_livre")).toBeNull();
  });

  it("recentPerformances: do mais recente ao mais antigo, com limite e data de corte", () => {
    expect(recentPerformances(all, "supino_reto_barra").map((p) => p.startedAt)).toEqual([b.startedAt, a.startedAt]);
    expect(recentPerformances(all, "elevacao_lateral", 1).map((p) => p.startedAt)).toEqual([c.startedAt]);
    expect(recentPerformances(all, "elevacao_lateral", 5, c.startedAt).map((p) => p.startedAt)).toEqual([b.startedAt]);
  });
});

describe("progressão: guarda contra digitação", () => {
  it("[14, 140, 14]: ignora a série digitada errada e sugere 14 kg com o aviso", () => {
    const s = suggestNext(log([[14, 12], [140, 12], [14, 12]], "elevacao_lateral"), lat, "elevacao_lateral");
    expect(s).toEqual({ kind: "manter", loadKg: 14, text: "Uma série parecia digitada errada (140 kg) e foi ignorada." });
    // Mesmo quando as séries que sobram fechariam o topo: depois de um erro, não sobe às cegas.
    expect(suggestNext(log([[14, 12], [140, 12], [14, 12], [14, 12]], "elevacao_lateral"), lat, "elevacao_lateral")).toMatchObject({ kind: "manter", loadKg: 14 });
    const two = suggestNext(log([[14, 12], [140, 12], [14, 12], [145, 12], [14, 12]], "elevacao_lateral"), lat, "elevacao_lateral");
    expect(two).toMatchObject({ kind: "manter", loadKg: 14 });
    expect(two.text).toBe("2 séries pareciam digitadas erradas (145 kg) e foram ignoradas.");
  });

  it("pirâmide 50/55/60 e aquecimento continuam valendo; com menos de 3 séries a guarda não age", () => {
    const pyramid = suggestNext(log([[50, 12], [55, 10], [60, 6]]), range, "supino_reto_barra");
    expect(pyramid).toMatchObject({ kind: "manter", loadKg: 60 });
    expect(pyramid.text).toContain("Cargas variadas");
    expect(suggestNext(log([[40, 12], [60, 12], [60, 12], [60, 12]]), range, "supino_reto_barra")).toMatchObject({ kind: "aumentar", loadKg: 62.5 });
    expect(suggestNext(log([[14, 12], [140, 12]], "elevacao_lateral"), lat, "elevacao_lateral").text).not.toContain("digitada");
    // Peso corporal com uma série de peso extra: mediana 0, nada é ignorado.
    expect(suggestNext(log([[0, 12], [0, 12], [10, 8]], "barra_fixa"), range, "barra_fixa").text).not.toContain("digitada");
  });

  it("série mais leve (erro para baixo ou aquecimento) nunca derruba as séries reais", () => {
    // 4/40/40: digitou 4 no lugar de 40. Antes, as duas séries de 40 eram "ignoradas" e a sugestão virava 4 kg.
    const low = suggestNext(log([[4, 10], [40, 10], [40, 10]]), range, "supino_reto_barra");
    expect(low).toMatchObject({ kind: "manter", loadKg: 40 });
    expect(low.text).not.toContain("digitad");
    // Aquecimento marcado 15/50/50 na remada.
    const warm = suggestNext(log([[15, 12], [50, 10], [50, 10]], "remada_baixa"), range, "remada_baixa");
    expect(warm).toMatchObject({ kind: "manter", loadKg: 50 });
    expect(warm.text).not.toContain("digitad");
    // Metade ou mais acima de 1,5× a mediana não é "erro": nada é ignorado.
    expect(suggestNext(log([[14, 12], [140, 12], [140, 12], [14, 12]], "elevacao_lateral"), lat, "elevacao_lateral").text).not.toContain("digitad");
  });

  it("treino anterior com uma série leve não contamina a trava de 2× do treino seguinte", () => {
    const s = suggestNext(log([[40, 10], [40, 10], [40, 10]]), range, "supino_reto_barra", { earlier: [log([[4, 10], [40, 10], [40, 10]])] });
    expect(s).toEqual({ kind: "manter", loadKg: 40, text: "Manter 40 kg: faltaram 6 reps para fechar 3×12." });
    expect(s.text).not.toContain("Confira");
  });

  it("mudança de faixa com o último treino suspeito: estima a partir do treino anterior, nunca do número errado", () => {
    const old = { sets: 3, repsMin: 3, repsMax: 5 };
    const typo = log([[400, 10], [400, 10], [400, 10]], "supino_reto_barra", old);
    const s = suggestNext(typo, range, "supino_reto_barra", { earlier: [log([[40, 5], [40, 5], [40, 5]], "supino_reto_barra", old)] });
    expect(s.kind).toBe("primeira");
    expect(s.text).toContain("faixa de repetições mudou");
    // 40 × 5 → 1RM ≈ 46,7 kg → para 12 reps, ~95% de 33 kg, no degrau da barra.
    expect(s.loadKg).toBe(30);
    // Sem treino anterior para comparar, a estimativa continua saindo do último registro.
    expect(suggestNext(log([[100, 5], [100, 5], [100, 5]], "supino_reto_barra", old), range, "supino_reto_barra").loadKg!).toBeGreaterThan(60);
  });

  it("topo inteiro mais de 2× acima da melhor carga dos 3 treinos anteriores: mantém a carga anterior e pede para conferir", () => {
    const earlier = [log([[20, 10], [20, 10], [20, 9]]), log([[20, 9], [20, 9], [20, 8]]), log([[17.5, 12], [17.5, 12], [17.5, 12]])];
    const s = suggestNext(log([[41, 10], [41, 10], [41, 9]]), range, "supino_reto_barra", { earlier });
    expect(s).toEqual({ kind: "manter", loadKg: 20, text: "Última vez: 41 kg? Confira se foi isso mesmo." });
    // A carga anterior é a do treino imediatamente antes, mesmo que um mais antigo tenha sido maior.
    expect(suggestNext(log([[41, 10], [41, 10]]), range, "supino_reto_barra", { earlier: [log([[17.5, 10]]), log([[20, 10]])] }).loadKg).toBe(17.5);
    // Só os 3 treinos anteriores contam: um 4º, antigo e pesado, não esconde o erro.
    expect(suggestNext(log([[41, 10], [41, 10]]), range, "supino_reto_barra", { earlier: [...earlier, log([[100, 5]])] }).kind).toBe("manter");
    expect(suggestNext(log([[41, 10], [41, 10]]), range, "supino_reto_barra", { earlier: [...earlier, log([[100, 5]])] }).text).toContain("Confira");
    // Até 2× é progressão normal; sem treinos anteriores, não há com o que comparar.
    expect(suggestNext(log([[40, 12], [40, 12], [40, 12]]), range, "supino_reto_barra", { earlier })).toMatchObject({ kind: "aumentar", loadKg: 42.5 });
    expect(suggestNext(log([[41, 10], [41, 10], [41, 9]]), range, "supino_reto_barra", { earlier: [] }).text).not.toContain("Confira");
  });
});

describe("progressão: retorno após pausa", () => {
  const now = new Date(iso("2026-03-19"));
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();

  it("18 dias sem o exercício: ~90% da carga no degrau real do implemento, com o texto de retorno", () => {
    const s = suggestNext(log([[40, 10], [40, 10], [40, 9]], "supino_reto_halter"), range, "supino_reto_halter", { lastAt: ago(18), now });
    expect(s).toEqual({ kind: "retorno", loadKg: 36, text: "Faz 18 dias sem este exercício: volte com 36 kg e reencontre o ritmo." });
    // Barra: 36 não existe, desce para 35.
    expect(suggestNext(log([[40, 10], [40, 10], [40, 9]]), range, "supino_reto_barra", { lastAt: ago(18), now }).loadKg).toBe(35);
    // Agachamento a 75 kg: 67,5 existe (passo de 2,5 abaixo de 70).
    expect(suggestNext(log([[75, 8], [75, 8], [75, 8]], "agachamento_livre"), { sets: 3, repsMin: 6, repsMax: 8 }, "agachamento_livre", { lastAt: ago(30), now }).loadKg).toBe(67.5);
  });

  it("vale a partir de 14 dias, mesmo quando teria subido; com 13 dias segue a progressão", () => {
    const top = log([[40, 12], [40, 12], [40, 12]]);
    expect(suggestNext(top, range, "supino_reto_barra", { lastAt: ago(13), now })).toMatchObject({ kind: "aumentar", loadKg: 42.5 });
    expect(suggestNext(top, range, "supino_reto_barra", { lastAt: ago(14), now })).toMatchObject({ kind: "retorno", loadKg: 35 });
    // Sem a data (chamada antiga), nunca é retorno.
    expect(suggestNext(top, range, "supino_reto_barra")).toMatchObject({ kind: "aumentar" });
    expect(suggestNext(top, range, "supino_reto_barra", { lastAt: "data inválida", now }).kind).toBe("aumentar");
  });

  it("suggestFromHistory monta tudo a partir do histórico", () => {
    const history = [session("a", ago(40), [log([[37.5, 10], [37.5, 10]])]), session("b", ago(18), [log([[40, 10], [40, 10], [40, 9]])])];
    expect(suggestFromHistory(history, range, "supino_reto_barra", now)).toMatchObject({ kind: "retorno", loadKg: 35 });
    expect(suggestFromHistory(history, range, "supino_reto_barra", now).text).toBe("Faz 18 dias sem este exercício: volte com 35 kg e reencontre o ritmo.");
    expect(suggestFromHistory(history, range, "supino_reto_barra", new Date(ago(10)))).toMatchObject({ kind: "manter", loadKg: 40 });
    expect(suggestFromHistory([], range, "supino_reto_barra", now)).toMatchObject({ kind: "primeira", loadKg: null });
    // Erro de digitação de um treino inteiro, visto pelo histórico.
    const typo = [session("a", ago(9), [log([[20, 10], [20, 10]])]), session("b", ago(2), [log([[200, 10], [200, 10]])])];
    expect(suggestFromHistory(typo, range, "supino_reto_barra", now)).toMatchObject({ kind: "manter", loadKg: 20 });
  });

  it("precedência: mudança de faixa > retorno > guarda de digitação > progressão dupla", () => {
    const old = { sets: 5, repsMin: 5, repsMax: 5 };
    const changed = suggestNext(log([[100, 5], [100, 5], [100, 5], [100, 5], [100, 5]], "supino_reto_barra", old), { sets: 3, repsMin: 10, repsMax: 15 }, "supino_reto_barra", { lastAt: ago(30), now });
    expect(changed.kind).toBe("primeira");
    expect(changed.text).toContain("faixa de repetições mudou");
    // Retorno ganha da guarda, mas parte da carga confiável (sem a série 140 e sem o topo suspeito).
    expect(suggestNext(log([[14, 12], [140, 12], [14, 12]], "elevacao_lateral"), lat, "elevacao_lateral", { lastAt: ago(20), now })).toMatchObject({ kind: "retorno", loadKg: 12 });
    const suspicious = suggestNext(log([[41, 10], [41, 10]]), range, "supino_reto_barra", { lastAt: ago(20), now, earlier: [log([[20, 10]])] });
    expect(suspicious).toMatchObject({ kind: "retorno", loadKg: 17.5 });
    // Guarda ganha da progressão dupla.
    expect(suggestNext(log([[41, 12], [41, 12], [41, 12]]), range, "supino_reto_barra", { lastAt: ago(3), now, earlier: [log([[20, 12]])] }).kind).toBe("manter");
  });

  it("graviton volta com mais ajuda; peso corporal volta sem forçar; peso extra e cargas pequenas", () => {
    expect(suggestNext(log([[30, 12], [30, 12], [30, 12]], "barra_fixa_assistida"), range, "barra_fixa_assistida", { lastAt: ago(20), now })).toEqual({
      kind: "retorno",
      loadKg: 35,
      text: "Faz 20 dias sem este exercício: volte com 35 kg de ajuda e reencontre o ritmo.",
    });
    expect(suggestNext(log([[null, 12], [null, 12], [null, 12]], "flexao"), range, "flexao", { lastAt: ago(20), now })).toEqual({
      kind: "retorno",
      loadKg: null,
      text: "Faz 20 dias sem este exercício: volte sem forçar e reencontre o ritmo.",
    });
    expect(suggestNext(log([[10, 10], [10, 10], [10, 10]], "barra_fixa"), range, "barra_fixa", { lastAt: ago(20), now }).text).toBe("Faz 20 dias sem este exercício: volte com 7,5 kg de peso extra e reencontre o ritmo.");
    // A menor placa: não há para onde descer, volta com a mesma.
    expect(suggestNext(log([[2.5, 10], [2.5, 10], [2.5, 10]], "elevacao_lateral_cabo"), range, "elevacao_lateral_cabo", { lastAt: ago(20), now }).loadKg).toBe(2.5);
    // Máquina sem carga registrada continua pedindo o registro; exercício por tempo não muda.
    expect(suggestNext(log([[0, 12], [0, 12], [0, 12]], "cadeira_extensora"), range, "cadeira_extensora", { lastAt: ago(20), now }).kind).toBe("primeira");
    expect(suggestNext(log([[null, 45]], "prancha"), { sets: 3, repsMin: 30, repsMax: 45, unit: "seg" }, "prancha", { lastAt: ago(20), now }).kind).not.toBe("retorno");
  });
});

describe("progressão: salto grande sem gangorra e plural", () => {
  it("elevação lateral 16 kg com 9-8-7 numa faixa 10-12 mantém 16 kg; com 6-6-5 reduz", () => {
    const keep = suggestNext(log([[16, 9], [16, 8], [16, 7]], "elevacao_lateral"), lat, "elevacao_lateral");
    expect(keep).toEqual({ kind: "manter", loadKg: 16, text: "Salto grande (14 → 16 kg): abaixo de 10 reps no início é normal. Mantenha 16 kg." });
    expect(suggestNext(log([[16, 6], [16, 6], [16, 5]], "elevacao_lateral"), lat, "elevacao_lateral")).toMatchObject({ kind: "reduzir", loadKg: 14 });
    // 1ª série 3 reps abaixo do mínimo: reduz.
    expect(suggestNext(log([[16, 7], [16, 7], [16, 7]], "elevacao_lateral"), lat, "elevacao_lateral").kind).toBe("reduzir");
  });

  it("acaba com a gangorra 14 → 16 → 14 → 16", () => {
    const up = suggestNext(log([[14, 12], [14, 12], [14, 12]], "elevacao_lateral"), lat, "elevacao_lateral");
    expect(up).toMatchObject({ kind: "aumentar", loadKg: 16 });
    expect(suggestNext(log([[16, 9], [16, 8], [16, 7]], "elevacao_lateral"), lat, "elevacao_lateral").loadKg).toBe(16);
    expect(suggestNext(log([[16, 10], [16, 9], [16, 8]], "elevacao_lateral"), lat, "elevacao_lateral")).toMatchObject({ kind: "manter", loadKg: 16 });
  });

  it("não vale no 5×5, nos exercícios principais nem com degrau de até 10%", () => {
    // 5×5 (séries fixas) com degrau grande: continua reduzindo.
    expect(suggestNext(log([[16, 4], [16, 4], [16, 3], [16, 3], [16, 3]], "elevacao_lateral"), { sets: 5, repsMin: 5, repsMax: 5 }, "elevacao_lateral").kind).toBe("reduzir");
    expect(suggestNext(log([[20, 3], [20, 3], [20, 3], [20, 3], [20, 3]], "agachamento_livre"), { sets: 5, repsMin: 5, repsMax: 5 }, "agachamento_livre").kind).toBe("reduzir");
    // Principal (supino com barra a 20 kg, degrau de 12,5%): regra antiga.
    expect(suggestNext(log([[20, 6], [20, 6], [20, 5]]), range, "supino_reto_barra")).toMatchObject({ kind: "reduzir", loadKg: 17.5 });
    // Halter a 20 kg: degrau de 2 kg = 10%, não é salto grande.
    expect(suggestNext(log([[20, 9], [20, 8], [20, 7]], "elevacao_lateral"), lat, "elevacao_lateral")).toMatchObject({ kind: "reduzir", loadKg: 18 });
  });

  it("faltou 1 rep no singular, faltaram N reps no plural", () => {
    expect(suggestNext(log([[40, 12], [40, 12], [40, 11]]), range, "supino_reto_barra").text).toBe("Manter 40 kg: faltou 1 rep para fechar 3×12.");
    expect(suggestNext(log([[40, 12], [40, 11], [40, 10]]), range, "supino_reto_barra").text).toBe("Manter 40 kg: faltaram 3 reps para fechar 3×12.");
  });

  it("séries puladas não viram reps que faltaram", () => {
    const four = { sets: 4, repsMin: 6, repsMax: 8 };
    expect(suggestNext(log([[40, 6], [40, 9]]), four, "supino_reto_barra")).toMatchObject({ kind: "manter", loadKg: 40, text: "Manter 40 kg: da última vez saíram 2 de 4 séries." });
    // Todas feitas, mas abaixo do topo: continua contando as reps.
    expect(suggestNext(log([[40, 8], [40, 8], [40, 7], [40, 7]]), four, "supino_reto_barra").text).toBe("Manter 40 kg: faltaram 2 reps para fechar 4×8.");
  });

  it("rascunho salvo antes da mudança continua válido", () => {
    // Forma gravada em sr:draft:* antes deste lote: os mesmos campos, sem "retorno".
    const saved = JSON.parse('{"kind":"manter","loadKg":40,"text":"Manter 40 kg: faltaram 9 reps para fechar 3×12."}') as { kind: SuggestionKind };
    const kinds: SuggestionKind[] = ["aumentar", "manter", "reduzir", "primeira", "reps", "retorno"];
    expect(kinds).toContain(saved.kind);
  });
});

// ───────────────────────── Recorde ao vivo ─────────────────────────

/** detectPRs como era antes da extração de setRecord (oráculo do teste de equivalência). */
function legacyDetectPRs(session: Session, history: Session[]): string[] {
  const ASSISTED = new Set(["barra_fixa_assistida"]);
  const prs = new Set<string>();
  const before = history.filter((h) => h.id !== session.id && h.startedAt < session.startedAt);
  for (const log of session.exercises) {
    if (prs.has(log.exerciseId) || unitOf(log.exerciseId, log.unit) === "min") continue;
    const prev = before.flatMap((h) => h.exercises.filter((e) => e.exerciseId === log.exerciseId).flatMap(completedSets));
    if (!prev.length) continue;
    const sets = completedSets(log);
    const load = (s: SetLog) => s.loadKg ?? 0;
    const reps = (s: SetLog) => s.reps ?? 0;
    if (ASSISTED.has(log.exerciseId)) {
      const floor = log.planned?.repsMin ?? 1;
      const prevHelp = prev.filter((s) => load(s) > 0 && reps(s) >= floor).map(load);
      if (prevHelp.length && sets.some((s) => load(s) > 0 && reps(s) >= floor && load(s) < Math.min(...prevHelp))) prs.add(log.exerciseId);
      continue;
    }
    const prevMaxLoad = Math.max(...prev.map(load));
    const prevBest = Math.max(...prev.map((s) => e1rm(load(s), reps(s))));
    const prevRepsAt = (kg: number) => Math.max(0, ...prev.filter((s) => load(s) >= kg).map(reps));
    const record = sets.some((s) => {
      const kg = load(s);
      if (prevMaxLoad >= 20 && kg > prevMaxLoad * 2) return false;
      if (prevMaxLoad === 0) return kg === 0 && reps(s) > prevRepsAt(0);
      if (kg <= 0) return false;
      return e1rm(kg, reps(s)) > prevBest || kg > prevMaxLoad || (kg === prevMaxLoad && reps(s) > prevRepsAt(kg));
    });
    if (record) prs.add(log.exerciseId);
  }
  return [...prs];
}

describe("recorde ao vivo: setRecord", () => {
  const at = (n: number) => `2026-02-${String(n).padStart(2, "0")}T10:00:00Z`;
  const hist = (sets: [number | null, number][], id = "supino_reto_barra") => priorSets([session("a", at(1), [log(sets, id)])], id, { id: "b", startedAt: at(8) });
  const set = (loadKg: number | null, reps: number, done = true): SetLog => ({ loadKg, reps, done });
  const target = (id = "supino_reto_barra", planned?: ExerciseLog["planned"]) => ({ exerciseId: id, planned });

  it("compara com o histórico e com as séries já feitas nesta sessão", () => {
    const prior = hist([[60, 8]]);
    expect(setRecord(set(62.5, 8), target(), prior)).toBe(true);
    // A mesma marca de novo, na mesma sessão, já não é recorde.
    expect(setRecord(set(62.5, 8), target(), prior, [set(62.5, 8)])).toBe(false);
    expect(setRecord(set(62.5, 9), target(), prior, [set(62.5, 8)])).toBe(true);
    // Série não concluída no meio das anteriores não conta.
    expect(setRecord(set(62.5, 8), target(), prior, [set(62.5, 8, false)])).toBe(true);
    expect(setRecord(set(60, 8), target(), prior)).toBe(false);
    expect(setRecord(set(62.5, 0), target(), prior)).toBe(false);
    // Sem histórico, não há recorde.
    expect(setRecord(set(100, 8), target(), [])).toBe(false);
  });

  it("trava de 2× só contra o histórico: o erro de digitação na sessão não esconde o recorde seguinte", () => {
    const prior = hist([[60, 8]]);
    expect(setRecord(set(600, 8), target(), prior)).toBe(false);
    expect(setRecord(set(62.5, 8), target(), prior, [set(600, 8)])).toBe(true);
  });

  it("peso corporal, isometria, graviton e aeróbio", () => {
    expect(setRecord(set(null, 13), target("barra_fixa"), hist([[null, 12]], "barra_fixa"))).toBe(true);
    // Série com peso extra no meio não muda a regra de quem nunca usou carga.
    expect(setRecord(set(null, 13), target("barra_fixa"), hist([[null, 12]], "barra_fixa"), [set(10, 15)])).toBe(true);
    expect(setRecord(set(null, 13), target("barra_fixa"), hist([[null, 12]], "barra_fixa"), [set(null, 13)])).toBe(false);
    expect(setRecord(set(null, 60), target("prancha"), hist([[null, 45]], "prancha"))).toBe(true);
    expect(setRecord(set(30, 8), target("barra_fixa_assistida"), hist([[40, 8]], "barra_fixa_assistida"))).toBe(true);
    expect(setRecord(set(30, 8), target("barra_fixa_assistida"), hist([[40, 8]], "barra_fixa_assistida"), [set(30, 8)])).toBe(false);
    expect(setRecord(set(25, 8), target("barra_fixa_assistida"), hist([[40, 8]], "barra_fixa_assistida"), [set(30, 8)])).toBe(true);
    // Menos ajuda com poucas reps (abaixo do mínimo da faixa) não vale.
    expect(setRecord(set(30, 3), target("barra_fixa_assistida", { sets: 3, repsMin: 6, repsMax: 10 }), hist([[40, 8]], "barra_fixa_assistida"))).toBe(false);
    expect(setRecord(set(null, 30), target("esteira_caminhada"), hist([[null, 20]], "esteira_caminhada"))).toBe(false);
  });

  it("recordFlags e firstRecordSet: estado derivado, desmarcar ou corrigir reps desfaz", () => {
    const history = [session("a", at(1), [log([[60, 8]])])];
    const now = { id: "b", startedAt: at(8) };
    const live = log([[62.5, 8], [62.5, 8], [65, 6]]);
    expect(recordFlags(live, priorSets(history, "supino_reto_barra", now))).toEqual([true, false, true]);
    expect(firstRecordSet(live, history, now)).toBe(0);
    const unmarked = { ...live, sets: live.sets.map((s, i) => (i === 0 ? { ...s, done: false } : s)) };
    expect(firstRecordSet(unmarked, history, now)).toBe(1);
    const fixed = { ...live, sets: [set(57.5, 8), set(60, 8), set(60, 7)] };
    expect(firstRecordSet(fixed, history, now)).toBe(-1);
  });

  it("ao vivo concorda com detectPRs no fim, e detectPRs é o mesmo de antes (equivalência em casos sorteados)", () => {
    // mulberry32: sorteio determinístico.
    let seed = 7;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const ids = ["supino_reto_barra", "barra_fixa", "barra_fixa_assistida", "prancha", "esteira_caminhada", "elevacao_lateral"];
    const loads = [null, 0, 0, 5, 10, 20, 25, 30, 40, 60, 62.5, 65, 70, 140, 600];
    const randomLog = (id: string): ExerciseLog => ({
      uid: String(rnd()),
      exerciseId: id,
      name: id,
      planned: rnd() < 0.5 ? { sets: 3, repsMin: pick([1, 5, 8]), repsMax: 12 } : undefined,
      sets: Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ loadKg: pick(loads), reps: Math.floor(rnd() * 16), done: rnd() < 0.85 })),
    });
    const randomSession = (id: string, day: number) => session(id, at(day), Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => randomLog(pick(ids))));
    let records = 0;
    for (let k = 0; k < 6000; k++) {
      const past = Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => randomSession(`h${i}`, 1 + Math.floor(rnd() * 20)));
      const now = randomSession("now", 10);
      const history = [...past, now];
      const prs = detectPRs(now, history);
      expect(prs, JSON.stringify({ past, now })).toEqual(legacyDetectPRs(now, history));
      for (const l of now.exercises) {
        const live = firstRecordSet(l, history, now) >= 0;
        if (live) expect(prs).toContain(l.exerciseId);
        if (live) records++;
      }
      for (const id of prs) expect(now.exercises.some((l) => l.exerciseId === id && firstRecordSet(l, history, now) >= 0)).toBe(true);
    }
    // O sorteio precisa exercitar recordes de verdade.
    expect(records).toBeGreaterThan(400);
  });
});

describe("recorde ao vivo: série que bateu a marca", () => {
  const at = (n: number) => `2026-02-${String(n).padStart(2, "0")}T10:00:00Z`;

  it("o resumo mostra a série do recorde, não a mais pesada; a última série recorde é a melhor marca", () => {
    const history = [session("a", at(1), [log([[70, 5], [60, 10]])])];
    const now = session("b", at(8), [log([[62.5, 10], [65, 3]])]);
    expect(recordSetOf(now, history, "supino_reto_barra")?.set).toMatchObject({ loadKg: 62.5, reps: 10 });
    const chain = session("c", at(8), [log([[72.5, 5], [72.5, 6], [60, 8]])]);
    expect(recordSetOf(chain, history, "supino_reto_barra")?.set).toMatchObject({ loadKg: 72.5, reps: 6 });
    expect(recordSetOf(session("d", at(8), [log([[60, 8]])]), history, "supino_reto_barra")).toBeNull();
  });

  it("fmtMark: nunca '0 kg × 15' no peso corporal", () => {
    expect(fmtMark({ loadKg: 42.5, reps: 8 }, "supino_reto_barra")).toBe("42,5 kg × 8");
    expect(fmtMark({ loadKg: 0, reps: 15 }, "barra_fixa")).toBe("15 reps");
    expect(fmtMark({ loadKg: null, reps: 1 }, "barra_fixa")).toBe("1 rep");
    expect(fmtMark({ loadKg: null, reps: 60 }, "prancha")).toBe("60 s");
    expect(fmtMark({ loadKg: 10, reps: 60 }, "prancha")).toBe("10 kg · 60 s");
    expect(fmtMark({ loadKg: 30, reps: 8 }, "barra_fixa_assistida")).toBe("30 kg de ajuda × 8");
    expect(fmtMark({ loadKg: null, reps: 20 }, "esteira_caminhada")).toBe("20 min");
    // Unidade do registro manda (exercício personalizado contado em segundos).
    expect(fmtMark({ loadKg: null, reps: 40 }, "custom_x", "seg")).toBe("40 s");
  });
});

// ───────────────────────── Fim de treino: desde o último Treino B ─────────────────────────

describe("fim de treino: compareWithLastSameDay", () => {
  const at = (n: number) => `2026-04-${String(n).padStart(2, "0")}T10:00:00Z`;
  const named = (name: string, sets: [number | null, number][], id: string, planned?: ExerciseLog["planned"]): ExerciseLog => ({ ...log(sets, id, planned), name });
  const day = (id: string, n: number, dayKey: string | undefined, logs: ExerciseLog[], programId: string | null = "p1"): Session => ({ ...session(id, at(n), logs), programId, dayKey });

  it("primeira vez naquele dia: variante própria, sem linhas", () => {
    const now = day("now", 10, "B", [named("Agachamento", [[60, 10]], "agachamento_livre")]);
    // Outro dia da mesma ficha e o mesmo dia de outra ficha não contam.
    const history = [day("a", 3, "A", [named("Agachamento", [[50, 10]], "agachamento_livre")]), day("b", 4, "B", [named("Agachamento", [[50, 10]], "agachamento_livre")], "p0"), now];
    expect(compareWithLastSameDay(now, history)).toEqual({ variant: "first", dayLabel: "Treino B", lines: [], firstText: "Primeiro Treino B registrado. Na próxima, a gente compara." });
    // Treino livre: nada a mostrar.
    expect(compareWithLastSameDay(day("free", 10, undefined, [], null), history)).toEqual({ variant: "none", dayLabel: null, lines: [] });
  });

  it("carga, reps com a mesma carga e tempo", () => {
    const prev = day("a", 3, "B", [named("Agachamento", [[60, 8], [60, 8]], "agachamento_livre"), named("Supino reto", [[40, 10], [40, 10], [40, 9]], "supino_reto_barra"), named("Prancha", [[null, 45], [null, 40]], "prancha")]);
    const now = day("b", 10, "B", [named("Agachamento", [[62.5, 8], [62.5, 6]], "agachamento_livre"), named("Supino reto", [[40, 11], [40, 10], [40, 9]], "supino_reto_barra"), named("Prancha", [[null, 60], [null, 45]], "prancha")]);
    expect(compareWithLastSameDay(now, [prev, now]).lines).toEqual(["Agachamento: 60 → 62,5 kg", "Supino reto: +1 rep com 40 kg", "Prancha: 45 → 60 s"]);
    expect(compareWithLastSameDay(now, [prev, now]).variant).toBe("compare");
  });

  it("peso corporal e graviton (menos ajuda conta como melhora)", () => {
    const prev = day("a", 3, "B", [named("Barra fixa", [[null, 8], [null, 7]], "barra_fixa"), named("Graviton", [[30, 8], [30, 8]], "barra_fixa_assistida"), named("Flexão", [[null, 10]], "flexao")]);
    const now = day("b", 10, "B", [named("Barra fixa", [[null, 10], [null, 7]], "barra_fixa"), named("Graviton", [[25, 8], [25, 7]], "barra_fixa_assistida"), named("Flexão", [[5, 8]], "flexao")]);
    expect(compareWithLastSameDay(now, [prev, now]).lines).toEqual(["Graviton: 30 → 25 kg de ajuda", "Flexão: +5 kg extra", "Barra fixa: 8 → 10 reps"]);
    // Mais ajuda não é melhora; mesma ajuda com mais reps é.
    const more = day("c", 10, "B", [named("Graviton", [[35, 10], [35, 10]], "barra_fixa_assistida")]);
    expect(compareWithLastSameDay(more, [prev, more]).lines).toEqual([]);
    const reps = day("d", 10, "B", [named("Graviton", [[30, 9], [30, 8]], "barra_fixa_assistida")]);
    expect(compareWithLastSameDay(reps, [prev, reps]).lines).toEqual(["Graviton: +1 rep com 30 kg de ajuda"]);
  });

  it("exercício trocado: compara com o último registro dele em qualquer treino", () => {
    const a = day("a", 2, "A", [named("Supino com halteres", [[20, 10]], "supino_reto_halter")]);
    const b = day("b", 3, "B", [named("Supino reto", [[40, 10]], "supino_reto_barra"), named("Remada", [[40, 10]], "remada_baixa")]);
    const now = day("c", 10, "B", [named("Supino com halteres", [[22, 10]], "supino_reto_halter"), named("Remada", [[45, 10]], "remada_baixa"), named("Crucifixo", [[14, 12]], "crucifixo_halter")]);
    expect(compareWithLastSameDay(now, [a, b, now]).lines).toEqual(["Supino com halteres: 20 → 22 kg", "Remada: 40 → 45 kg"]);
  });

  it("nenhum avanço: bloco vazio, nunca 'piorou'; aeróbio e erro de digitação não entram", () => {
    const prev = day("a", 3, "B", [named("Supino reto", [[40, 10], [40, 10]], "supino_reto_barra"), named("Esteira", [[null, 20]], "esteira_caminhada"), named("Leg press", [[100, 10], [100, 10]], "leg_press")]);
    const now = day("b", 10, "B", [named("Supino reto", [[37.5, 10], [40, 9]], "supino_reto_barra"), named("Esteira", [[null, 40]], "esteira_caminhada"), named("Leg press", [[1000, 10], [1000, 10]], "leg_press")]);
    expect(compareWithLastSameDay(now, [prev, now])).toEqual({ variant: "compare", dayLabel: "Treino B", lines: [] });
  });

  it("série mais leve no treino de hoje não esconde o avanço das séries reais", () => {
    const prev = day("a", 3, "B", [named("Supino reto", [[40, 10], [40, 10], [40, 10]], "supino_reto_barra")]);
    const now = day("b", 10, "B", [named("Supino reto", [[4, 10], [42.5, 10], [42.5, 10]], "supino_reto_barra")]);
    expect(compareWithLastSameDay(now, [prev, now]).lines).toEqual(["Supino reto: 40 → 42,5 kg"]);
  });

  it("usa o treino B mais recente, no máximo 3 linhas, carga antes de reps", () => {
    const old = day("a", 1, "B", [named("A1", [[10, 10]], "rosca_direta_barra")]);
    const prev = day("b", 3, "B", [named("A1", [[20, 10]], "rosca_direta_barra"), named("A2", [[30, 10]], "puxada_frente"), named("A3", [[40, 10]], "remada_baixa"), named("A4", [[50, 10]], "leg_press"), named("A5", [[20, 10]], "cadeira_extensora")]);
    const now = day("c", 10, "B", [named("A1", [[20, 12]], "rosca_direta_barra"), named("A2", [[35, 10]], "puxada_frente"), named("A3", [[45, 10]], "remada_baixa"), named("A4", [[60, 10]], "leg_press"), named("A5", [[25, 10]], "cadeira_extensora")]);
    const later = day("d", 20, "B", [named("A1", [[5, 5]], "rosca_direta_barra")]);
    const out = compareWithLastSameDay(now, [old, later, prev, now]);
    expect(out.lines).toEqual(["A2: 30 → 35 kg", "A3: 40 → 45 kg", "A4: 50 → 60 kg"]);
    expect(compareWithLastSameDay(now, [old, prev, now], 5).lines).toEqual(["A2: 30 → 35 kg", "A3: 40 → 45 kg", "A4: 50 → 60 kg", "A5: 20 → 25 kg", "A1: +2 reps com 20 kg"]);
  });
});

describe("fim de treino: 1º treino da semana", () => {
  it("'Semana N seguida' só no 1º treino da semana (segunda a domingo)", () => {
    const mon = { id: "mon", startedAt: "2026-03-16T12:00:00Z" };
    const wed = { id: "wed", startedAt: "2026-03-18T12:00:00Z" };
    const lastSun = { id: "sun", startedAt: "2026-03-15T12:00:00Z" };
    expect(firstOfWeek(mon, [lastSun, mon, wed])).toBe(true);
    expect(firstOfWeek(wed, [lastSun, mon, wed])).toBe(false);
    expect(firstOfWeek(wed, [lastSun, wed])).toBe(true);
  });
});

// ───────────────────────── IA ─────────────────────────

describe("IA: prompt e saneamento", () => {
  const request = programInputSchema.parse({ ...base, seed: 3 });
  /** Resposta da IA montada a partir de uma ficha do motor (forma do PROGRAM_JSON_SCHEMA). */
  const asAI = (p: Program) => ({
    name: p.name,
    notes: p.notes ?? "",
    days: p.days.map((d) => ({ key: d.key, title: d.title, focus: d.focus, exercises: d.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, repsMin: e.repsMin, repsMax: e.repsMax, restSec: e.restSec, technique: e.technique, notes: "" })) })),
  });

  it("o esquema de entrada aceita todo sistema gerável e recusa a divisão livre", () => {
    for (const id of ALL) expect(programInputSchema.safeParse({ ...base, system: id }).success, id).toBe(true);
    expect(programInputSchema.safeParse({ ...base, system: "livre" }).success).toBe(false);
    expect(programInputSchema.safeParse({ ...base, system: "abc_inferiores", emphasis: ["gluteos", "adutores"] }).success).toBe(true);
  });

  it("o esquema de saída lista todas as técnicas e todos os exercícios", () => {
    const item = PROGRAM_JSON_SCHEMA.properties.days.items.properties.exercises.items.properties;
    expect([...item.technique.enum].sort()).toEqual(Object.keys(TECHNIQUE_LABEL).sort());
    expect(item.exerciseId.enum.length).toBe(EXERCISES.length);
  });

  it("o prompt de sistema leva as regras de montagem e a biblioteca com tipo, unidade e nível", () => {
    for (const rule of ["Multiarticulares sempre antes dos isolados", "No máximo 1 exercício por dia na faixa pesada", "Iniciante:", "Avançado:", "Somente peso corporal", "elevação lateral", "leg press ou hack", "levantamento terra só como primeiro", "grupo cardio", "grupo prioritário", "Drop-set"]) {
      expect(PROGRAM_SYSTEM, rule).toContain(rule);
    }
    expect(PROGRAM_SYSTEM).toContain("Biblioteca (id | nome | grupo | implemento | tipo | unidade | nível | casa):");
    expect(PROGRAM_SYSTEM).toContain("prancha | Prancha | abdomen | peso_corporal | isolado | seg | iniciante | sim");
    expect(PROGRAM_SYSTEM).toContain("agachamento_livre | Agachamento livre | quadriceps | barra | multi | reps | intermediario | não");
    expect(PROGRAM_SYSTEM).toContain("esteira_caminhada | Caminhada na esteira | cardio | maquina | isolado | min | iniciante | não");
    expect(PROGRAM_SYSTEM).toContain("afundo | Afundo com halteres | quadriceps | halter | multi unilateral | reps");
    for (const e of EXERCISES) expect(PROGRAM_SYSTEM).toContain(`\n${e.id} | `);
  });

  it("o prompt do usuário descreve a estrutura do sistema, a prioridade e o que não usar", () => {
    const text = programUserPrompt({ ...request, system: "abc_inferiores", emphasis: ["gluteos"], limitations: "dor no joelho", equipment: "home" });
    expect(text).toContain("Dia A (Inferiores — quadríceps e glúteos)");
    expect(text).toContain("Quadríceps multiarticular principal");
    expect(text).toContain("Prioridade (precisa aparecer na ficha, com exercícios diretos): Glúteos");
    expect(text).toContain("Não use (limitações): ");
    expect(text).toContain("agachamento_livre");
    expect(text).toContain("halteres, elástico, caneleira");
    expect(programUserPrompt({ ...request, system: "forca_5x5" })).toContain("terra 1×5");
    expect(programUserPrompt({ ...request, system: "upper_lower" })).toContain("dia de volume");
    expect(programUserPrompt(request)).not.toContain("Não use");
  });

  it("aceita uma ficha bem montada e copia a unidade do exercício", () => {
    const engine = gen({ goal: "emagrecimento", sessionMinutes: 90, seed: 3 });
    const input = { ...request, goal: "emagrecimento" as Goal, sessionMinutes: 90 };
    const p = programFromAI(asAI(engine), input, owner)!;
    expect(p).not.toBeNull();
    expect(p.source).toBe("ia");
    expect(p.days.map((d) => idsOf(d))).toEqual(engine.days.map((d) => idsOf(d)));
    const cardio = all(p).find((e) => ex(e).group === "cardio")!;
    expect(cardio).toMatchObject({ unit: "min", sets: 1, restSec: 0 });
    const plank = all(p).find((e) => ex(e).unit === "seg");
    if (plank) expect(plank.unit).toBe("seg");
    for (const e of all(p)) if (ex(e).unilateral) expect(e.notes).toContain("por lado");
    for (const d of p.days) expect(estimateDayMinutes(d)).toBeLessThanOrEqual(90);
  });

  it("descarta o que o equipamento, o nível ou a limitação do aluno não permitem", () => {
    const gym = asAI(gen({ sessionMinutes: 90, seed: 3 }));
    // Aluno em casa recebendo ficha de academia: sobra pouco → o motor assume.
    expect(programFromAI(gym, { ...request, equipment: "home" }, owner)).toBeNull();

    const withBad = asAI(gen({ sessionMinutes: 90, seed: 3 }));
    const extra = (exerciseId: string) => ({ exerciseId, sets: 3, repsMin: 8, repsMax: 12, restSec: 60, technique: "normal" as const, notes: "" });
    withBad.days[0]!.exercises.push(extra("remada_elastico"), extra("flexao"), extra("id_que_nao_existe"));
    withBad.days[2]!.exercises.push(extra("good_morning"));
    const p = programFromAI(withBad, { ...request, sessionMinutes: 120 }, owner)!;
    expect(idsOf(p.days[0]!)).not.toContain("remada_elastico");
    expect(idsOf(p.days[0]!)).not.toContain("flexao");
    expect(idsOf(p.days[0]!)).not.toContain("id_que_nao_existe");
    expect(idsOf(p.days[2]!)).not.toContain("good_morning"); // nível mínimo avançado

    const knee = programFromAI(asAI(gen({ sessionMinutes: 90, seed: 3 })), { ...request, sessionMinutes: 90, limitations: "dor no joelho" }, owner)!;
    const avoid = avoidedByLimitations("dor no joelho");
    expect(all(knee).some((e) => avoid.has(e.exerciseId))).toBe(false);
    for (const e of strength(knee.days[2]!)) expect(e.repsMin).toBeGreaterThanOrEqual(8);
  });

  it("saneia números absurdos, técnica inválida e exercício repetido", () => {
    const ai = asAI(gen({ sessionMinutes: 90, seed: 3 }));
    const first = ai.days[0]!.exercises[0]!;
    Object.assign(first, { sets: 40, repsMin: 0, repsMax: -3, restSec: 9999, technique: "inventada", notes: "x".repeat(400) });
    ai.days[0]!.exercises.push({ ...ai.days[0]!.exercises[1]! });
    const p = programFromAI(ai, { ...request, sessionMinutes: 180 }, owner)!;
    const e = p.days[0]!.exercises[0]!;
    expect(e.sets).toBeLessThanOrEqual(8);
    expect(e.repsMin).toBeGreaterThanOrEqual(1);
    expect(e.repsMax).toBeGreaterThanOrEqual(e.repsMin);
    expect(e.restSec).toBeLessThanOrEqual(300);
    expect(e.technique).toBe("normal");
    expect(e.notes!.length).toBeLessThanOrEqual(121);
    expect(new Set(idsOf(p.days[0]!)).size).toBe(p.days[0]!.exercises.length);
  });

  it("devolve null (o motor assume) com dia curto, prioridade sem exercício direto ou resposta malformada", () => {
    const short = asAI(gen({ sessionMinutes: 90, seed: 3 }));
    short.days[1]!.exercises = short.days[1]!.exercises.slice(0, 3);
    expect(programFromAI(short, { ...request, sessionMinutes: 90 }, owner)).toBeNull();

    const full = asAI(gen({ sessionMinutes: 90, seed: 3 }));
    expect(programFromAI(full, { ...request, sessionMinutes: 90, emphasis: ["adutores"] }, owner)).toBeNull();
    expect(programFromAI(full, { ...request, sessionMinutes: 90, emphasis: ["gluteos"] }, owner)).not.toBeNull();

    expect(programFromAI({} as never, request, owner)).toBeNull();
    expect(programFromAI(null as never, request, owner)).toBeNull();
    // O 5×5 tem 4 encaixes fixos no dia A: 4 exercícios bastam.
    const five = gen({ system: "forca_5x5", goal: "forca", sessionMinutes: 90 });
    expect(programFromAI(asAI(five), { ...request, system: "forca_5x5", goal: "forca", level: "iniciante", sessionMinutes: 90 }, owner)).not.toBeNull();
  });
});
