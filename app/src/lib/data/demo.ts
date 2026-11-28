"use client";

import { ANAMNESE_V, CONSENT_TEXT_ID, PARQ_TEXT_ID, type Anamnese, type AnamnesePedido, type WorkStyle } from "@/lib/domain/anamnese-types";
import { getExercise } from "@/lib/domain/exercises";
import { generateProgram } from "@/lib/domain/generator";
import { uid, todayISO } from "@/lib/domain/ids";
import { buildDietTemplate, targetsForProfile } from "@/lib/domain/nutrition-base";
import { detectPRs, loadIncrement, sessionVolume } from "@/lib/domain/progression";
import type { BodyMetric, Goal, Implement, Level, MuscleGroup, Profile, Program, Session, SystemId } from "@/lib/domain/types";
import type { LocalRepository } from "./local";

/**
 * Dados de demonstração (sintéticos, rotulados na interface): permitem experimentar
 * o app completo sem cadastro. Cargas seguem progressão dupla com variação realista.
 */

/** Carga inicial típica (kg) de um homem intermediário; `startLoad` ajusta por sexo e nível. */
const START_LOADS: Record<string, number> = {
  // Peito
  supino_reto_barra: 50, supino_reto_halter: 20, supino_reto_smith: 45, supino_inclinado_barra: 40, supino_inclinado_halter: 18, supino_inclinado_maquina: 35,
  supino_inclinado_smith: 35, supino_maquina: 45, crucifixo_halter: 12, crucifixo_maquina: 35, crossover: 15, crossover_polia_baixa: 10,
  // Costas
  puxada_frente: 50, puxada_triangulo: 50, puxada_supinada: 45, barra_fixa_assistida: 30, remada_curvada_barra: 45, remada_unilateral_halter: 22,
  remada_baixa: 45, remada_cavalinho: 30, remada_maquina: 40, remada_sentada_maquina: 40, remada_articulada_unilateral: 25, pulldown_braco_reto: 20,
  encolhimento: 24, encolhimento_barra: 50, levantamento_terra: 90,
  // Ombros
  desenvolvimento_barra: 30, desenvolvimento_halter: 16, desenvolvimento_maquina: 35, desenvolvimento_smith: 30, elevacao_lateral: 8, elevacao_lateral_cabo: 5,
  elevacao_lateral_maquina: 20, crucifixo_inverso: 6, crucifixo_inverso_maquina: 25, crucifixo_inverso_cabo: 5, face_pull: 20,
  // Braços
  rosca_direta_barra: 25, rosca_direta_barra_w: 22.5, rosca_direta_halter: 10, rosca_alternada: 12, rosca_martelo: 12, rosca_martelo_corda: 20, rosca_scott: 20,
  rosca_scott_maquina: 20, rosca_cabo: 20, rosca_concentrada: 10, rosca_inclinada: 10, triceps_corda: 20, triceps_barra_polia: 25, triceps_inverso: 15,
  triceps_testa: 20, triceps_testa_halter: 8, triceps_frances: 14, triceps_frances_cabo: 20, triceps_maquina: 30, triceps_coice: 6, supino_fechado: 40,
  rosca_punho: 15, rosca_inversa: 15,
  // Pernas e glúteos
  agachamento_livre: 70, agachamento_smith: 50, agachamento_goblet: 16, leg_press: 140, leg_press_horizontal: 80, hack: 60, cadeira_extensora: 40, afundo: 12,
  afundo_smith: 30, recuo_halter: 10, passada: 10, agachamento_bulgaro: 12, stiff: 50, stiff_smith: 40, terra_romeno_halter: 20, mesa_flexora: 35,
  cadeira_flexora: 35, flexora_em_pe: 15, elevacao_pelvica: 60, elevacao_pelvica_maquina: 60, elevacao_pelvica_smith: 50, cadeira_abdutora: 45, gluteo_cabo: 15,
  gluteo_maquina: 30, abducao_polia: 10, gluteo_4_apoios_caneleira: 5, cadeira_adutora: 40, aducao_polia: 10, panturrilha_em_pe: 60, panturrilha_sentado: 40,
  panturrilha_leg_press: 100, panturrilha_smith: 50,
  // Core
  abdominal_polia: 30, abdominal_maquina: 30,
};

const DEFAULT_START: Partial<Record<Implement, number>> = { barra: 25, smith: 30, maquina: 30, cabo: 15, halter: 8, kettlebell: 12, caneleira: 3 };

/** Carga de partida da simulação, já arredondada para algo que existe na academia (0 = exercício sem carga). */
function startLoad(exerciseId: string, factor: number): number {
  const ex = getExercise(exerciseId);
  if (!ex || ex.unit === "min") return 0; // aeróbio é registrado em minutos, sem carga
  const base = START_LOADS[exerciseId] ?? DEFAULT_START[ex.implement] ?? 0;
  const step = loadIncrement(exerciseId, base * factor);
  if (!base || !step) return 0;
  return Math.max(step, Math.round((base * factor) / step) * step);
}

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

export function simulateSessions(userId: string, program: Program, weeks: number, perWeek: number, seed: number, skipRate = 0.1, loadFactor = 1): Session[] {
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
      // Nunca no dia de hoje (correção da revisão): com o R3-8, um treino de hoje fecha o dia e esconde o "Começar
      // treino"; o "Ver como aluno" dos exemplos sempre abre o Hoje com a ação central do app.
      if (date > now || date.toDateString() === now.toDateString()) continue;
      if (r() < skipRate) continue;
      const day = program.days[dayIdx % program.days.length]!;
      dayIdx++;
      const exercises = day.exercises.map((p) => {
        const cur = loads.get(p.exerciseId) ?? startLoad(p.exerciseId, loadFactor);
        const inc = cur ? loadIncrement(p.exerciseId, cur) : 0;
        const target = repTarget.get(p.exerciseId) ?? p.repsMin;
        const sets = Array.from({ length: p.sets }, (_, i) => {
          const fatigue = i > 0 && r() < 0.12 ? 1 : 0;
          const reps = Math.max(p.repsMin - 1, Math.min(p.repsMax, target - fatigue));
          return { loadKg: inc ? cur : null, reps, done: true };
        });
        // Progressão dupla: reps sobem treino a treino; no topo da faixa, a carga sobe e as reps voltam ao mínimo.
        // (Em séries fixas, como o 5×5, nem todo treino fecha a carga: a subida acontece em ~60% das vezes.)
        if (inc && sets.every((s) => (s.reps ?? 0) >= p.repsMax) && (p.repsMin < p.repsMax || r() < 0.6)) {
          loads.set(p.exerciseId, cur + inc);
          repTarget.set(p.exerciseId, p.repsMin);
        } else {
          loads.set(p.exerciseId, cur);
          repTarget.set(p.exerciseId, Math.min(p.repsMax, target + (r() < 0.85 ? 1 : 0) + (p.repsMax - p.repsMin >= 6 && r() < 0.3 ? 1 : 0)));
        }
        return {
          uid: uid(),
          exerciseId: p.exerciseId,
          name: p.name,
          planned: { sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax, loadKg: inc ? cur : null, restSec: p.restSec, technique: p.technique, notes: p.notes },
          sets,
          ...(p.unit ? { unit: p.unit } : {}),
        };
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
  for (const d of program.days) for (const p of d.exercises) p.loadKg = loads.get(p.exerciseId) || null;
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
    ...p,
  };
}

/**
 * Alunos de exemplo têm peso, medidas e limitações sintéticos: a autorização vem marcada como se o personal
 * (ou a própria pessoa, na demonstração solo) tivesse registrado, para os exemplos funcionarem como um cadastro real.
 */
const exampleConsent = (coachId?: string): Pick<Profile, "consentHealthAt" | "consentSource"> => ({ consentHealthAt: new Date().toISOString(), consentSource: coachId ? "personal" : "aluno" });

async function seedAthlete(
  repo: LocalRepository,
  opts: { id: string; name: string; sex: "M" | "F"; birthYear: number; heightCm: number; weightKg: number; goal: Goal; level: Level; system: SystemId; days: number; weeks: number; seed: number; skip?: number; delta: number; bf: number; coachId?: string; extra?: Partial<Profile>; stopDaysAgo?: number; emphasis?: MuscleGroup[] },
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
    ...exampleConsent(opts.coachId),
    ...opts.extra,
  });
  await repo.saveProfile(p);
  const program = generateProgram(
    { goal: opts.goal, level: opts.level, daysPerWeek: opts.days, sessionMinutes: 60, equipment: "academia", system: opts.system, seed: opts.seed, emphasis: opts.emphasis },
    { ownerId: p.id, createdBy: opts.coachId ?? p.id },
  );
  program.source = opts.coachId ? "personal" : "ia";
  // Cargas de exemplo coerentes com o perfil (sexo e nível).
  const loadFactor = (opts.sex === "F" ? 0.55 : 1) * (opts.level === "iniciante" ? 0.7 : opts.level === "avancado" ? 1.25 : 1);
  let sessions = simulateSessions(p.id, program, opts.weeks, opts.days, opts.seed, opts.skip, loadFactor);
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

// ───────────────────────── Questionário dos exemplos (respostas fictícias) ─────────────────────────

const DIA_MS = 86_400_000;
const diasAntes = (agora: Date, dias: number) => new Date(agora.getTime() - dias * DIA_MS).toISOString();

/**
 * Respostas fictícias dos alunos de exemplo (demonstração e /testar), rotuladas "respostas fictícias" na interface
 * (`ehExemplo`). Mostram o resumo sem e com alerta:
 *  - Juliana: pelo link, treina há mais de 3 meses, PAR-Q só com "sim" na 5 e termo marcado, dor no joelho direito
 *    4/10 em alguns movimentos há mais de 3 meses, falta de tempo, não quer correr, foco em glúteos. Sem vermelho nem
 *    laranja. Já vista pelo personal.
 *  - Marcos: PAR-Q só com "sim" na 6 e sem termo, pressão alta com controle desconhecido e remédio de pressão, treina
 *    há mais de 3 meses (A-PRESSAO e A-PARQ-SIM; [E2] O-PRESS e O-HAS). Chegou há 2 dias e ainda não foi vista.
 * Ids fixos ("exemplo-…"): nunca viram pedido real nem evento.
 */
export function respostasExemplo(quem: "juliana" | "marcos", agora: Date): Anamnese {
  if (quem === "juliana") {
    const at = diasAntes(agora, 42);
    return {
      v: ANAMNESE_V,
      id: "exemplo-juliana",
      answeredAt: at,
      receivedAt: at,
      vistoEm: at,
      by: "aluno",
      via: "link",
      modulos: [],
      parqText: PARQ_TEXT_ID,
      a: {
        nome: "Juliana Prado",
        ano: 1991,
        sexo: "F",
        altura: 165,
        peso: 63,
        parq: [0, 0, 0, 0, 1, 0, 0],
        regular: "sim3m",
        condicoes: [],
        sintomas: [],
        remedios: 0,
        cirurgia: 0,
        orientacao: "nao",
        gestacao: "nao",
        dor: 1,
        dorOnde: [{ r: "joelho", l: "d" }],
        dorNota: 4,
        dorQuando: ["movimento"],
        dorDesde: "mais3m",
        lesao: 0,
        tratamento: "nao",
        objetivo: "gordura",
        experiencia: "a3",
        dias: 4,
        minutos: 60,
        onde: "academia",
        nutri: "nao",
        foco: ["gluteos"],
        naoQuer: ["correr"],
        barreira: ["tempo"],
      },
      consent: { at, source: "aluno_questionario", textId: CONSENT_TEXT_ID },
      declaredAt: at,
      termo: { at, nome: "Juliana Prado" },
    };
  }
  const at = diasAntes(agora, 2);
  return {
    v: ANAMNESE_V,
    id: "exemplo-marcos",
    answeredAt: at,
    receivedAt: at,
    by: "aluno",
    via: "link",
    modulos: [],
    parqText: PARQ_TEXT_ID,
    a: {
      nome: "Marcos Antunes",
      ano: 1987,
      sexo: "M",
      altura: 182,
      peso: 88,
      parq: [0, 0, 0, 0, 0, 1, 0],
      regular: "sim3m",
      condicoes: ["pressao"],
      sintomas: [],
      remedios: 1,
      remediosPara: ["pressao"],
      cirurgia: 0,
      orientacao: "nao",
      pressaoControle: "naoSei",
      dor: 0,
      lesao: 0,
      objetivo: "forca",
      experiencia: "mais3",
      dias: 3,
      minutos: 60,
      onde: "academia",
      nutri: "nao",
    },
    consent: { at, source: "aluno_questionario", textId: CONSENT_TEXT_ID },
    declaredAt: at,
  };
}

/**
 * Beatriz: questionário pedido há 3 dias, ainda sem resposta (selo "Questionário pendente" e o lembrete). Exemplo:
 * nada é enviado, por isso o pedido não tem pacote (`packed` vazio).
 */
export function pedidoExemplo(agora: Date): AnamnesePedido {
  return { id: "exemplo-pedido-beatriz", at: diasAntes(agora, 3), modulos: [], packed: "" };
}

/**
 * Jeito de trabalhar pronto só no personal da demonstração (academia · emagrecimento · 3×60 · 6 semanas · encaminha
 * ao nutricionista). Nunca no /testar: quem testa precisa ver "Como você trabalha?" e o cartão da lista.
 */
export function jeitoDemonstracao(agora: Date): WorkStyle {
  return { atendimento: "academia", publico: ["emagrecimento"], dias: 3, minutos: 60, semanas: 6, alimentacao: "encaminho", definidoEm: agora.toISOString() };
}

/** O que cada exemplo ganha do questionário, pela ordem dos alunos (Juliana, Marcos, Beatriz). */
function questionarioDoExemplo(i: number, agora: Date): Partial<Profile> {
  if (i === 0) return { anamnese: respostasExemplo("juliana", agora) };
  if (i === 1) return { anamnese: respostasExemplo("marcos", agora) };
  return { anamnesePedido: pedidoExemplo(agora) };
}

/** Marca de que os exemplos já existentes ganharam o questionário (roda uma vez por aparelho; "Apagar dados" leva junto). */
const EXEMPLOS_QUESTIONARIO_KEY = (conjunto: "teste" | "demo") => `sr:v1:exemplos-questionario:${conjunto}`;
function lerMarca(conjunto: "teste" | "demo"): boolean {
  try {
    return localStorage.getItem(EXEMPLOS_QUESTIONARIO_KEY(conjunto)) === "1";
  } catch {
    return false;
  }
}
function gravarMarca(conjunto: "teste" | "demo") {
  try {
    localStorage.setItem(EXEMPLOS_QUESTIONARIO_KEY(conjunto), "1");
  } catch {}
}

/**
 * Migração leve: acrescenta as respostas fictícias (e o pedido da Beatriz) aos exemplos que já existiam sem
 * questionário. Nunca recria um exemplo removido, nunca troca respostas que já existem e roda uma vez por aparelho
 * (o personal pode ter apagado as respostas de um exemplo depois).
 */
async function completarExemplos(repo: LocalRepository, ids: readonly string[], conjunto: "teste" | "demo", agora = new Date()): Promise<number> {
  if (lerMarca(conjunto)) return 0;
  let n = 0;
  for (const [i, id] of ids.entries()) {
    const p = await repo.getProfile(id);
    if (!p || p.anamnese || p.anamnesePrev || p.anamnesePedido) continue;
    await repo.saveProfile({ ...p, ...questionarioDoExemplo(i, agora) });
    n++;
  }
  gravarMarca(conjunto);
  return n;
}

const TESTE_EXEMPLOS = ["teste-ex-1", "teste-ex-2", "teste-ex-3"] as const;
const DEMO_EXEMPLOS = ["demo-aluna-1", "demo-aluno-2", "demo-aluna-3"] as const;

/** Exemplos do /testar criados antes do questionário: ganham as respostas fictícias (devolve quantos mudaram). */
export function completarExemplosTeste(repo: LocalRepository, agora = new Date()): Promise<number> {
  return completarExemplos(repo, TESTE_EXEMPLOS, "teste", agora);
}

export async function seedDemo(repo: LocalRepository, role: "athlete" | "coach"): Promise<string> {
  if (role === "athlete") {
    if (!(await repo.getProfile(DEMO_ATHLETE_ID))) {
      await seedAthlete(repo, { id: DEMO_ATHLETE_ID, name: "Rafael (demonstração)", sex: "M", birthYear: 1994, heightCm: 178, weightKg: 81.4, goal: "hipertrofia", level: "intermediario", system: "abc", days: 3, weeks: 8, seed: 42, delta: 0.25, bf: 18 });
    }
    return DEMO_ATHLETE_ID;
  }
  const coach = await repo.getProfile(DEMO_COACH_ID);
  if (coach) {
    // Demonstração aberta antes do questionário: jeito de trabalhar e respostas fictícias, uma vez.
    if (!coach.workStyle) await repo.saveProfile({ ...coach, workStyle: jeitoDemonstracao(new Date()) });
    await completarExemplos(repo, DEMO_EXEMPLOS, "demo");
  } else {
    const agora = new Date();
    await repo.saveProfile(profile({ id: DEMO_COACH_ID, name: "Camila Duarte (demonstração)", role: "coach", plan: "coach", workStyle: jeitoDemonstracao(agora) }));
    const students = [
      { id: "demo-aluna-1", name: "Juliana Prado", sex: "F" as const, birthYear: 1991, heightCm: 165, weightKg: 63.2, goal: "emagrecimento" as Goal, level: "intermediario" as Level, system: "abcd_inferiores" as SystemId, days: 4, weeks: 6, seed: 11, delta: -0.35, bf: 27, skip: 0.08, emphasis: ["gluteos"] as MuscleGroup[] },
      { id: "demo-aluno-2", name: "Marcos Antunes", sex: "M" as const, birthYear: 1987, heightCm: 182, weightKg: 88.0, goal: "forca" as Goal, level: "avancado" as Level, system: "forca_5x5" as SystemId, days: 3, weeks: 6, seed: 23, delta: 0.1, bf: 20, skip: 0.05 },
      { id: "demo-aluna-3", name: "Beatriz Lima", sex: "F" as const, birthYear: 1999, heightCm: 160, weightKg: 55.5, goal: "hipertrofia" as Goal, level: "iniciante" as Level, system: "fullbody" as SystemId, days: 3, weeks: 5, seed: 37, delta: 0.15, bf: 24, skip: 0.45 },
    ];
    for (const [i, s] of students.entries()) {
      await seedAthlete(repo, { ...s, coachId: DEMO_COACH_ID, stopDaysAgo: s.id === "demo-aluna-3" ? 9 : undefined, extra: questionarioDoExemplo(i, agora) });
      repo.linkDirect(DEMO_COACH_ID, s.id, new Date(Date.now() - s.weeks * 7 * 86_400_000).toISOString());
    }
    gravarMarca("demo");
  }
  return DEMO_COACH_ID;
}

/**
 * Ambiente de teste para personais: entra direto como personal, sem cadastro, com
 * três alunos de exemplo (marcados como exemplo e removíveis) para ver o painel vivo.
 */
export const TESTER_COACH_ID = "teste-personal";

/** Convite para o personal de exemplo (/testar e demonstração) assinar o que envia. */
export const COACH_IDENTITY_HINT = "Coloque seu nome e CREF em Conta";

/**
 * Mostra o convite de nome e CREF: personal ainda com o nome provisório "Personal" (o perfil do /testar nasce
 * assim) ou perfil de exemplo sem CREF. Um personal de verdade que só não informou o CREF não é cobrado.
 */
export function needsCoachIdentity(p: Pick<Profile, "id" | "role" | "name" | "cref"> | null | undefined): boolean {
  if (!p || p.role !== "coach") return false;
  const name = p.name.trim();
  if (!name || name === "Personal") return true;
  return (p.id === TESTER_COACH_ID || p.id === DEMO_COACH_ID) && !p.cref?.trim();
}

export async function seedTester(repo: LocalRepository): Promise<string> {
  if (await repo.getProfile(TESTER_COACH_ID)) {
    // Quem já testou não recebe os exemplos de novo; os que existem ganham o questionário fictício.
    await completarExemplosTeste(repo);
    return TESTER_COACH_ID;
  }
  const agora = new Date();
  await repo.saveProfile(profile({ id: TESTER_COACH_ID, name: "Personal", role: "coach", plan: "coach", createdAt: new Date().toISOString() }));
  const samples = [
    { id: "teste-ex-1", name: "Juliana Prado", sex: "F" as const, birthYear: 1991, heightCm: 165, weightKg: 63.2, goal: "emagrecimento" as Goal, level: "intermediario" as Level, system: "abcd_inferiores" as SystemId, days: 4, weeks: 6, seed: 11, delta: -0.35, bf: 27, skip: 0.08, emphasis: ["gluteos"] as MuscleGroup[] },
    { id: "teste-ex-2", name: "Marcos Antunes", sex: "M" as const, birthYear: 1987, heightCm: 182, weightKg: 88.0, goal: "forca" as Goal, level: "avancado" as Level, system: "forca_5x5" as SystemId, days: 3, weeks: 6, seed: 23, delta: 0.1, bf: 20, skip: 0.05 },
    { id: "teste-ex-3", name: "Beatriz Lima", sex: "F" as const, birthYear: 1999, heightCm: 160, weightKg: 55.5, goal: "hipertrofia" as Goal, level: "iniciante" as Level, system: "fullbody" as SystemId, days: 3, weeks: 5, seed: 37, delta: 0.15, bf: 24, skip: 0.45, stopDaysAgo: 9 },
  ];
  for (const [i, s] of samples.entries()) {
    await seedAthlete(repo, { ...s, coachId: TESTER_COACH_ID, extra: { sample: true, managedBy: TESTER_COACH_ID, ...questionarioDoExemplo(i, agora) } });
    repo.linkDirect(TESTER_COACH_ID, s.id, new Date(Date.now() - s.weeks * 7 * 86_400_000).toISOString());
  }
  gravarMarca("teste");
  return TESTER_COACH_ID;
}
