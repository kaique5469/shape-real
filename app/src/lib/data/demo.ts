"use client";

import { generateProgram } from "@/lib/domain/generator";
import { uid, todayISO } from "@/lib/domain/ids";
import { buildDietTemplate, targetsForProfile } from "@/lib/domain/nutrition";
import { detectPRs, loadIncrement, sessionVolume } from "@/lib/domain/progression";
import type { BodyMetric, Goal, Level, Profile, Program, Session, SystemId } from "@/lib/domain/types";
import type { LocalRepository } from "./local";

/**
 * Dados de demonstração (sintéticos, rotulados na interface): permitem experimentar
 * o app completo sem cadastro. Cargas seguem progressão dupla com variação realista.
 */

const START_LOADS: Record<string, number> = {
  supino_reto_barra: 50, supino_reto_halter: 20, supino_inclinado_barra: 40, supino_inclinado_halter: 18, supino_maquina: 45,
  crucifixo_halter: 12, crucifixo_maquina: 35, crossover: 15, puxada_frente: 50, puxada_triangulo: 50, remada_curvada_barra: 45,
  remada_unilateral_halter: 22, remada_baixa: 45, remada_cavalinho: 30, remada_maquina: 40, pulldown_braco_reto: 20,
  desenvolvimento_barra: 30, desenvolvimento_halter: 16, desenvolvimento_maquina: 35, elevacao_lateral: 8, elevacao_lateral_cabo: 5,
  crucifixo_inverso: 6, face_pull: 20, rosca_direta_barra: 25, rosca_alternada: 12, rosca_martelo: 12, rosca_scott: 20, rosca_cabo: 20,
  triceps_corda: 20, triceps_barra_polia: 25, triceps_testa: 20, triceps_frances: 14, supino_fechado: 40, agachamento_livre: 70,
  agachamento_smith: 50, leg_press: 140, hack: 60, cadeira_extensora: 40, afundo: 12, agachamento_bulgaro: 12, stiff: 50,
  terra_romeno_halter: 20, mesa_flexora: 35, cadeira_flexora: 35, elevacao_pelvica: 60, panturrilha_em_pe: 60, panturrilha_sentado: 40,
  levantamento_terra: 90, abdominal_polia: 30, encolhimento: 24,
};

/** PRNG mulberry32 — distribuição uniforme desde o primeiro valor (dados de demo reproduzíveis). */
function rand(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateSessions(userId: string, program: Program, weeks: number, perWeek: number, seed: number, skipRate = 0.1): Session[] {
  const r = rand(seed);
  const loads = new Map<string, number>();
  const repTarget = new Map<string, number>();
  const sessions: Session[] = [];
  const now = new Date();
  const dayOffsets = perWeek >= 5 ? [0, 1, 2, 3, 4] : perWeek === 4 ? [0, 1, 3, 4] : perWeek === 3 ? [0, 2, 4] : [0, 3];
  let dayIdx = 0;
  for (let w = weeks - 1; w >= 0; w--) {
    for (const off of dayOffsets) {
      const date = new Date(now);
      const monday = (date.getDay() + 6) % 7;
      date.setDate(date.getDate() - monday - w * 7 + off);
      date.setHours(7 + Math.floor(r() * 12), Math.floor(r() * 60), 0, 0);
      if (date > now) continue;
      if (r() < skipRate) continue;
      const day = program.days[dayIdx % program.days.length]!;
      dayIdx++;
      const exercises = day.exercises.map((p) => {
        const inc = loadIncrement(p.exerciseId);
        const cur = loads.get(p.exerciseId) ?? START_LOADS[p.exerciseId] ?? (inc ? 20 : 0);
        const target = repTarget.get(p.exerciseId) ?? p.repsMin;
        const sets = Array.from({ length: p.sets }, (_, i) => {
          const fatigue = i > 0 && r() < 0.12 ? 1 : 0;
          const reps = Math.max(p.repsMin - 1, Math.min(p.repsMax, target - fatigue));
          return { loadKg: inc ? cur : null, reps, done: true };
        });
        // Progressão dupla: reps sobem treino a treino; no topo da faixa, a carga sobe e as reps voltam ao mínimo.
        if (inc && sets.every((s) => (s.reps ?? 0) >= p.repsMax)) {
          loads.set(p.exerciseId, cur + inc);
          repTarget.set(p.exerciseId, p.repsMin);
        } else {
          loads.set(p.exerciseId, cur);
          repTarget.set(p.exerciseId, Math.min(p.repsMax, target + (r() < 0.85 ? 1 : 0) + (p.repsMax - p.repsMin >= 6 && r() < 0.3 ? 1 : 0)));
        }
        return { uid: uid(), exerciseId: p.exerciseId, name: p.name, planned: { sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax, loadKg: cur }, sets };
      });
      const s: Session = {
        id: uid(),
        userId,
        programId: program.id,
        programName: program.name,
        dayKey: day.key,
        dayTitle: day.title,
        startedAt: date.toISOString(),
        finishedAt: new Date(date.getTime() + (50 + r() * 25) * 60_000).toISOString(),
        exercises,
        volumeKg: 0,
        prs: [],
        feeling: (3 + Math.round(r() * 2)) as Session["feeling"],
      };
      s.volumeKg = sessionVolume(s);
      sessions.push(s);
    }
  }
  for (const s of sessions) s.prs = detectPRs(s, sessions);
  // Para a sessão de demonstração atualizar a ficha com a carga atual:
  for (const d of program.days) for (const p of d.exercises) p.loadKg = loads.get(p.exerciseId) ?? null;
  return sessions;
}

function metricsSeries(userId: string, weeks: number, startKg: number, deltaPerWeek: number, startBf: number, seed: number): BodyMetric[] {
  const r = rand(seed);
  const out: BodyMetric[] = [];
  for (let w = weeks; w >= 0; w--) {
    const d = new Date();
    d.setDate(d.getDate() - w * 7);
    const i = weeks - w;
    out.push({
      id: uid(),
      userId,
      date: todayISO(d),
      weightKg: Math.round((startKg + deltaPerWeek * i + (r() - 0.5) * 0.6) * 10) / 10,
      bodyFatPct: Math.round((startBf - 0.25 * i + (r() - 0.5) * 0.4) * 10) / 10,
      waistCm: i % 2 === 0 ? Math.round((88 - 0.3 * i) * 10) / 10 : null,
      armCm: i % 2 === 0 ? Math.round((35 + 0.08 * i) * 10) / 10 : null,
    });
  }
  return out;
}

function profile(p: Partial<Profile> & { id: string; name: string; role: Profile["role"] }): Profile {
  return {
    plan: "free",
    onboarded: true,
    createdAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    consentHealthAt: new Date().toISOString(),
    ...p,
  };
}

async function seedAthlete(
  repo: LocalRepository,
  opts: { id: string; name: string; sex: "M" | "F"; birthYear: number; heightCm: number; weightKg: number; goal: Goal; level: Level; system: SystemId; days: number; weeks: number; seed: number; skip?: number; delta: number; bf: number; coachId?: string; extra?: Partial<Profile>; stopDaysAgo?: number },
) {
  const p = profile({
    id: opts.id,
    name: opts.name,
    role: "athlete",
    sex: opts.sex,
    birthYear: opts.birthYear,
    heightCm: opts.heightCm,
    weightKg: opts.weightKg,
    activity: "moderado",
    goal: opts.goal,
    level: opts.level,
    daysPerWeek: opts.days,
    sessionMinutes: 60,
    equipment: "academia",
    preferredSystem: opts.system,
    ...opts.extra,
  });
  await repo.saveProfile(p);
  const program = generateProgram(
    { goal: opts.goal, level: opts.level, daysPerWeek: opts.days, sessionMinutes: 60, equipment: "academia", system: opts.system, seed: opts.seed },
    { ownerId: p.id, createdBy: opts.coachId ?? p.id },
  );
  program.source = opts.coachId ? "personal" : "ia";
  let sessions = simulateSessions(p.id, program, opts.weeks, opts.days, opts.seed, opts.skip);
  if (opts.stopDaysAgo) {
    // Aluno parado: sem treinos recentes, para o painel mostrar o alerta de aderência.
    const cutoff = Date.now() - opts.stopDaysAgo * 86_400_000;
    sessions = sessions.filter((s) => new Date(s.startedAt).getTime() <= cutoff);
  }
  await repo.saveProgram(program);
  repo.saveSessionsBulk(sessions);
  repo.saveMetricsBulk(metricsSeries(p.id, opts.weeks, opts.weightKg - opts.delta * opts.weeks, opts.delta, opts.bf, opts.seed + 7));
  const targets = targetsForProfile(p);
  if (targets) await repo.saveDiet(buildDietTemplate(targets, { ownerId: p.id, createdBy: opts.coachId ?? p.id }));
  return p;
}

export const DEMO_ATHLETE_ID = "demo-atleta";
export const DEMO_COACH_ID = "demo-personal";

export async function seedDemo(repo: LocalRepository, role: "athlete" | "coach"): Promise<string> {
  if (role === "athlete") {
    if (!(await repo.getProfile(DEMO_ATHLETE_ID))) {
      await seedAthlete(repo, { id: DEMO_ATHLETE_ID, name: "Rafael (demonstração)", sex: "M", birthYear: 1994, heightCm: 178, weightKg: 81.4, goal: "hipertrofia", level: "intermediario", system: "abc", days: 3, weeks: 8, seed: 42, delta: 0.25, bf: 18 });
    }
    return DEMO_ATHLETE_ID;
  }
  if (!(await repo.getProfile(DEMO_COACH_ID))) {
    await repo.saveProfile(profile({ id: DEMO_COACH_ID, name: "Camila Duarte (demonstração)", role: "coach", plan: "coach" }));
    const students = [
      { id: "demo-aluna-1", name: "Juliana Prado", sex: "F" as const, birthYear: 1991, heightCm: 165, weightKg: 63.2, goal: "emagrecimento" as Goal, level: "intermediario" as Level, system: "upper_lower" as SystemId, days: 4, weeks: 6, seed: 11, delta: -0.35, bf: 27, skip: 0.08 },
      { id: "demo-aluno-2", name: "Marcos Antunes", sex: "M" as const, birthYear: 1987, heightCm: 182, weightKg: 88.0, goal: "forca" as Goal, level: "avancado" as Level, system: "forca_5x5" as SystemId, days: 3, weeks: 6, seed: 23, delta: 0.1, bf: 20, skip: 0.05 },
      { id: "demo-aluna-3", name: "Beatriz Lima", sex: "F" as const, birthYear: 1999, heightCm: 160, weightKg: 55.5, goal: "hipertrofia" as Goal, level: "iniciante" as Level, system: "fullbody" as SystemId, days: 3, weeks: 5, seed: 37, delta: 0.15, bf: 24, skip: 0.45 },
    ];
    for (const s of students) {
      await seedAthlete(repo, { ...s, coachId: DEMO_COACH_ID, stopDaysAgo: s.id === "demo-aluna-3" ? 9 : undefined });
      repo.linkDirect(DEMO_COACH_ID, s.id, new Date(Date.now() - s.weeks * 7 * 86_400_000).toISOString());
    }
  }
  return DEMO_COACH_ID;
}

/**
 * Ambiente de teste para personais: entra direto como personal, sem cadastro, com
 * três alunos de exemplo (marcados como exemplo e removíveis) para ver o painel vivo.
 */
export const TESTER_COACH_ID = "teste-personal";

export async function seedTester(repo: LocalRepository): Promise<string> {
  if (await repo.getProfile(TESTER_COACH_ID)) return TESTER_COACH_ID;
  await repo.saveProfile(profile({ id: TESTER_COACH_ID, name: "Personal", role: "coach", plan: "coach", createdAt: new Date().toISOString() }));
  const samples = [
    { id: "teste-ex-1", name: "Juliana Prado", sex: "F" as const, birthYear: 1991, heightCm: 165, weightKg: 63.2, goal: "emagrecimento" as Goal, level: "intermediario" as Level, system: "upper_lower" as SystemId, days: 4, weeks: 6, seed: 11, delta: -0.35, bf: 27, skip: 0.08 },
    { id: "teste-ex-2", name: "Marcos Antunes", sex: "M" as const, birthYear: 1987, heightCm: 182, weightKg: 88.0, goal: "forca" as Goal, level: "avancado" as Level, system: "forca_5x5" as SystemId, days: 3, weeks: 6, seed: 23, delta: 0.1, bf: 20, skip: 0.05 },
    { id: "teste-ex-3", name: "Beatriz Lima", sex: "F" as const, birthYear: 1999, heightCm: 160, weightKg: 55.5, goal: "hipertrofia" as Goal, level: "iniciante" as Level, system: "fullbody" as SystemId, days: 3, weeks: 5, seed: 37, delta: 0.15, bf: 24, skip: 0.45, stopDaysAgo: 9 },
  ];
  for (const s of samples) {
    await seedAthlete(repo, { ...s, coachId: TESTER_COACH_ID, extra: { sample: true, managedBy: TESTER_COACH_ID } });
    repo.linkDirect(TESTER_COACH_ID, s.id, new Date(Date.now() - s.weeks * 7 * 86_400_000).toISOString());
  }
  return TESTER_COACH_ID;
}
