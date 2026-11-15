import { z } from "zod";
import { EXERCISES, GROUP_LABEL, getExercise } from "@/lib/domain/exercises";
import { getSystem, SYSTEMS } from "@/lib/domain/systems";
import { GOAL_LABEL, LEVEL_LABEL, generateProgram, type GenerateInput } from "@/lib/domain/generator";
import { uid } from "@/lib/domain/ids";
import type { MuscleGroup, Program, Technique } from "@/lib/domain/types";

const GROUPS = Object.keys(GROUP_LABEL) as MuscleGroup[];
const TECHNIQUES: Technique[] = ["normal", "drop_set", "bi_set", "rest_pause", "piramide", "isometria"];

export const programInputSchema = z.object({
  goal: z.enum(["hipertrofia", "forca", "emagrecimento", "condicionamento", "saude"]),
  level: z.enum(["iniciante", "intermediario", "avancado"]),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(20).max(180),
  equipment: z.enum(["academia", "home", "peso_corporal"]),
  system: z.enum(SYSTEMS.map((s) => s.id) as [Program["system"], ...Program["system"][]]),
  limitations: z.string().max(400).optional(),
  emphasis: z.array(z.enum(GROUPS as [MuscleGroup, ...MuscleGroup[]])).max(4).optional(),
  notes: z.string().max(500).optional(),
  seed: z.number().int().optional(),
});

export type ProgramRequest = z.infer<typeof programInputSchema>;

export const PROGRAM_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "notes", "days"],
  properties: {
    name: { type: "string" },
    notes: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "title", "focus", "exercises"],
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          focus: { type: "array", items: { type: "string", enum: GROUPS } },
          exercises: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["exerciseId", "sets", "repsMin", "repsMax", "restSec", "technique", "notes"],
              properties: {
                exerciseId: { type: "string", enum: EXERCISES.map((e) => e.id) },
                sets: { type: "integer" },
                repsMin: { type: "integer" },
                repsMax: { type: "integer" },
                restSec: { type: "integer" },
                technique: { type: "string", enum: TECHNIQUES },
                notes: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

interface AIProgram {
  name: string;
  notes: string;
  days: {
    key: string;
    title: string;
    focus: MuscleGroup[];
    exercises: { exerciseId: string; sets: number; repsMin: number; repsMax: number; restSec: number; technique: Technique; notes: string }[];
  }[];
}

/** Prompt de sistema estável (cacheável): papel, regras e a biblioteca de exercícios. */
export const PROGRAM_SYSTEM = `Você é o treinador do Shape Real, um app brasileiro de fichas de treino. Monte fichas seguras, eficientes e realistas para academias brasileiras, em português do Brasil.

Regras:
- Use somente exercícios da biblioteca abaixo, pelo id exato.
- Respeite o sistema de divisão pedido: gere exatamente os dias do modelo informado, com as mesmas chaves (key) e na mesma ordem. Você pode ajustar o título de cada dia.
- Respeite equipamento e limitações físicas: em caso de dor ou lesão citada, evite exercícios que carregam a região e prefira variações guiadas. Nunca diagnostique.
- O tempo da sessão é um teto: considere execução, descanso e preparação (~1 min por exercício).
- Faixas de repetição e descanso coerentes com o objetivo (força: 3–6 reps e 2–3 min; hipertrofia: 6–15 reps; emagrecimento/condicionamento: 10–20 reps, descansos curtos).
- Técnicas avançadas (drop-set, rest-pause, bi-set) só para intermediários e avançados, no máximo uma por dia.
- "notes" do exercício: uma dica curta de execução ou cadência (máx. 90 caracteres), ou string vazia.
- "notes" da ficha: 2–3 frases práticas sobre progressão de carga e aquecimento. Sem promessas de resultado.
- "name": curto, ex.: "ABC · Hipertrofia".

Biblioteca (id | nome | grupo | implemento | casa):
${EXERCISES.map((e) => `${e.id} | ${e.name} | ${e.group} | ${e.implement} | ${e.home ? "sim" : "não"}`).join("\n")}`;

export function programUserPrompt(input: ProgramRequest): string {
  const sys = getSystem(input.system);
  return [
    `Objetivo: ${GOAL_LABEL[input.goal]}`,
    `Nível: ${LEVEL_LABEL[input.level]}`,
    `Dias por semana: ${input.daysPerWeek}`,
    `Tempo por sessão: ${input.sessionMinutes} min`,
    `Equipamento: ${input.equipment === "academia" ? "academia completa" : input.equipment === "home" ? "em casa (halteres, elástico, kettlebell, peso corporal)" : "somente peso corporal"}`,
    `Sistema: ${sys.name} — dias: ${sys.templates.map((t) => `${t.key} (${t.title})`).join("; ")}`,
    input.emphasis?.length ? `Prioridade estética: ${input.emphasis.map((g) => GROUP_LABEL[g]).join(", ")}` : "",
    input.limitations ? `Limitações/lesões: ${input.limitations}` : "Sem limitações informadas.",
    input.notes ? `Pedido do usuário: ${input.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Converte e saneia a resposta da IA; volta null se não for utilizável. */
export function programFromAI(ai: AIProgram, input: ProgramRequest, owner: { ownerId: string; createdBy: string }): Program | null {
  const sys = getSystem(input.system);
  const days = sys.templates.map((tpl, i) => {
    const d = ai.days.find((x) => x.key === tpl.key) ?? ai.days[i];
    const seen = new Set<string>();
    const exercises = (d?.exercises ?? [])
      .filter((e) => {
        const ok = getExercise(e.exerciseId) && !seen.has(e.exerciseId);
        seen.add(e.exerciseId);
        return ok;
      })
      .slice(0, 10)
      .map((e) => {
        const repsMin = clamp(e.repsMin, 1, 60);
        return {
          uid: uid(),
          exerciseId: e.exerciseId,
          name: getExercise(e.exerciseId)!.name,
          sets: clamp(e.sets, 1, 8),
          repsMin,
          repsMax: clamp(Math.max(e.repsMax, repsMin), repsMin, 60),
          restSec: clamp(e.restSec, 15, 300),
          loadKg: null,
          technique: TECHNIQUES.includes(e.technique) ? e.technique : "normal",
          notes: e.notes?.slice(0, 120) || undefined,
        };
      });
    return { key: tpl.key, title: d?.title?.slice(0, 80) || tpl.title, focus: d?.focus?.length ? d.focus : tpl.focus, exercises };
  });
  if (days.some((d) => d.exercises.length < 2)) return null;
  const now = new Date().toISOString();
  return {
    id: uid(),
    ownerId: owner.ownerId,
    createdBy: owner.createdBy,
    name: ai.name?.slice(0, 60) || `${sys.short} · ${GOAL_LABEL[input.goal]}`,
    system: input.system,
    goal: input.goal,
    level: input.level,
    daysPerWeek: input.daysPerWeek,
    notes: ai.notes?.slice(0, 600),
    days,
    active: true,
    source: "ia",
    createdAt: now,
    updatedAt: now,
  };
}

export function fallbackProgram(input: GenerateInput, owner: { ownerId: string; createdBy: string }): Program {
  return generateProgram(input, owner);
}
