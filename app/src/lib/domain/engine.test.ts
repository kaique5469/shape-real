import { afterEach, describe, expect, it } from "vitest";
import { EXERCISES, getExercise, registerCustomExercises, searchExercises } from "./exercises";
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
import { detectPRs, e1rmSeries, loadIncrement, suggestNext } from "./progression";
import { PROGRAM_JSON_SCHEMA, PROGRAM_SYSTEM, programFromAI, programInputSchema, programUserPrompt } from "@/lib/ai/program";
import type { Equipment, Exercise, ExerciseLog, Goal, Level, MuscleGroup, PlannedExercise, Program, Session, SystemId, WorkoutDay } from "./types";

/**
 * Contrato do motor de fichas: cada regra que um personal cobraria numa ficha gerada sem IA,
 * conferida em muitas seeds, sistemas, níveis e equipamentos.
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
    expect(labels("artrose de quadril")).toEqual(["quadril", "idade ou artrose"]);
    expect(labels("idoso com artrose")).toEqual(["idade ou artrose"]);
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
