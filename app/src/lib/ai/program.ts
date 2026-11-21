import { z } from "zod";
import { EXERCISES, GROUP_LABEL, getExercise } from "@/lib/domain/exercises";
import { getSystem, SYSTEMS, type Slot } from "@/lib/domain/systems";
import {
  GOAL_LABEL,
  LEVEL_LABEL,
  TECHNIQUE_LABEL,
  allowedByEquipment,
  allowedForLevel,
  analyzeLimitations,
  fitDayToTime,
  generateProgram,
  isGymRegression,
  type GenerateInput,
} from "@/lib/domain/generator";
import { uid } from "@/lib/domain/ids";
import type { MuscleGroup, PlannedExercise, Program, Technique, WorkoutDay } from "@/lib/domain/types";

const GROUPS = Object.keys(GROUP_LABEL) as MuscleGroup[];
const TECHNIQUES = Object.keys(TECHNIQUE_LABEL) as Technique[];

export const programInputSchema = z.object({
  goal: z.enum(["hipertrofia", "forca", "emagrecimento", "condicionamento", "saude"]),
  level: z.enum(["iniciante", "intermediario", "avancado"]),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(20).max(180),
  equipment: z.enum(["academia", "home", "peso_corporal"]),
  // Todo sistema que o motor sabe gerar (a divisão livre é montada à mão, nunca gerada).
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

/** Prompt de sistema estável (cacheável): papel, regras de montagem e a biblioteca de exercícios. */
export const PROGRAM_SYSTEM = `Você é o treinador do Shape Real, um app brasileiro de fichas de treino. Monte fichas seguras, eficientes e realistas para academias brasileiras, em português do Brasil, do jeito que um personal experiente escreveria.

Regras gerais:
- Use somente exercícios da biblioteca abaixo, pelo id exato.
- Respeite o sistema de divisão pedido: gere exatamente os dias do modelo informado, com as mesmas chaves (key) e na mesma ordem. Você pode ajustar o título de cada dia. A "estrutura sugerida" de cada dia é o ponto de partida; adapte ao tempo, ao nível e às limitações.
- O tempo da sessão é um teto: conte execução, descanso, ~1 min de preparação por exercício e 5 min de aquecimento. Intermediários e avançados usam pelo menos 85% do tempo, sem ultrapassar. Para caber, corte primeiro panturrilha, antebraço e o segundo isolado de um grupo; nunca o levantamento principal nem o grupo prioritário.
- Nunca diagnostique. Com dor ou lesão citada, evite os exercícios que carregam a região, prefira variações guiadas e nunca prescreva menos de 8 repetições para a região.

Ordem e escolha dos exercícios:
- O multiarticular mais pesado do grupo principal abre o dia (em dia de costas, pode vir logo depois da puxada). Multiarticulares sempre antes dos isolados do mesmo grupo. Panturrilha, abdômen e aeróbio por último.
- No máximo 1 exercício por dia na faixa pesada (força: 3–5 repetições; hipertrofia: 6–8), sempre um multiarticular com barra, Smith ou máquina — nunca polia, exercício unilateral ou peso corporal. Dias com dois principais por desenho (Superiores A do Upper/Lower e o 5×5) são a exceção.
- Não repita o mesmo movimento no dia: no máximo um supino reto livre (barra, halteres ou Smith); todo dia com 2 ou mais exercícios de peito tem um supino inclinado; no máximo um crucifixo/voador; não combine tríceps com corda e tríceps pulley com barra; não use dois leg press nem dois coices de glúteo.
- Ombros: todo dia de empurrar ou de ombros tem elevação lateral; todo dia de puxar tem crucifixo inverso ou face pull; elevação frontal e remada alta só se o usuário pedir.
- Pernas: depois do agachamento, o segundo multiarticular de quadríceps é leg press ou hack; para posteriores use stiff (barra, halteres ou Smith); levantamento terra só como primeiro exercício do dia, no máximo uma vez na semana, e nunca com mais de 8 repetições. Todo dia de pernas tem um exercício direto de glúteo (elevação pélvica).
- Exercícios de padrão "mobilidade" (alongamentos) só entram se o usuário pedir.

Nível:
- Não use exercícios cujo nível mínimo (coluna "nível") esteja acima do nível do aluno.
- Iniciante: máquinas, polias, Smith e halteres; 3 séries de 10–15 repetições, descanso de 45–90 s, no máximo 7 exercícios de força por dia, sem técnicas avançadas.
- Avançado: não use barra fixa assistida nem agachamento goblet.

Equipamento:
- Academia: não use versões com elástico ou sem carga (flexão de braço, agachamento sem carga, ponte de glúteo, tríceps banco, panturrilha no degrau) quando houver máquina, polia ou halter equivalente. Abdômen é a exceção.
- Em casa: só exercícios com casa = sim (halteres, elástico, caneleira e peso do corpo).
- Somente peso corporal: só exercícios com implemento peso_corporal e casa = sim; nada de barra fixa, paralelas ou roda. Todo treino tem ao menos um exercício de lombar (não há puxada sem equipamento).

Séries, repetições e descanso:
- Força: 3–5 repetições e 3 min só no exercício principal com barra de cada dia; demais multiarticulares 6–10 com 90–120 s; isolados 8–12 com 60–75 s.
- Hipertrofia: principal 4×6–8 com 120–150 s; multiarticulares 3–4×8–12 com 90–120 s; isolados 3–4×10–15 com 45–75 s.
- Emagrecimento e condicionamento: 10–20 repetições e descansos de 45–75 s. Saúde: 3×10–15.
- Volume semanal direto por grupo (séries): iniciante 8–10 em peito, costas e quadríceps e 4–6 em bíceps e tríceps; intermediário 10–16 e 6–10; avançado 14–20 e 8–14; posteriores com pelo menos 60% do volume de quadríceps.
- Exercícios contados em segundos (unidade seg) ou minutos (unidade min): escreva o tempo em repsMin/repsMax. Aeróbio: 1 série, descanso 0.
- Emagrecimento, condicionamento e saúde: se sobrar tempo, feche o dia com 10–20 min de um exercício do grupo cardio.
- Exercício unilateral: as repetições são por lado.

Prioridade do aluno:
- O grupo prioritário precisa aparecer com exercícios diretos: 1 multiarticular (quando o grupo tem) até o 2º exercício do dia e 1–2 isolados, em todo dia que treina a região. Glúteos, posteriores ou quadríceps: some 10–16 séries diretas na semana; se o modelo tiver só um dia de pernas, acrescente 1–2 exercícios do grupo ao fim de outro dia.

Técnicas:
- Drop-set, rest-pause e bi-set só para intermediários e avançados, no máximo uma por dia, e só em isolados de máquina, polia ou halter — nunca em abdominal, prancha ou peso corporal.

Texto:
- "notes" do exercício: uma dica curta de execução ou cadência (máx. 90 caracteres), ou string vazia.
- "notes" da ficha: 2–3 frases práticas sobre aquecimento (5 min leves e séries de aproximação no primeiro exercício) e progressão de carga. Sem promessas de resultado.
- "name": curto, ex.: "ABC · Hipertrofia".

Biblioteca (id | nome | grupo | implemento | tipo | unidade | nível | casa):
${EXERCISES.map((e) => `${e.id} | ${e.name} | ${e.group} | ${e.implement} | ${e.pattern === "mobilidade" ? "mobilidade" : e.compound ? "multi" : "isolado"}${e.unilateral ? " unilateral" : ""} | ${e.unit ?? "reps"} | ${e.minLevel ?? "iniciante"} | ${e.home ? "sim" : "não"}`).join("\n")}`;

const EQUIPMENT_TEXT: Record<ProgramRequest["equipment"], string> = {
  academia: "academia completa",
  home: "em casa (halteres, elástico, caneleira e peso do corpo)",
  peso_corporal: "somente peso corporal, sem nenhum equipamento",
};

/** Um encaixe do modelo em palavras, para a IA partir da mesma estrutura que o motor usa. */
function describeSlot(slot: Slot): string {
  const kind = slot.pattern === "core" ? "core" : slot.compound ? "multiarticular" : "isolado";
  const options = slot.prefer?.length ? ` (${slot.prefer.slice(0, 3).join(" ou ")})` : "";
  return `${GROUP_LABEL[slot.group]} ${kind}${slot.main ? " principal" : ""}${options}${slot.optional ? " [só se sobrar tempo]" : ""}`;
}

export function programUserPrompt(input: ProgramRequest): string {
  const sys = getSystem(input.system);
  const avoid = [...analyzeLimitations(input.limitations).avoid];
  return [
    `Objetivo: ${GOAL_LABEL[input.goal]}`,
    `Nível: ${LEVEL_LABEL[input.level]}`,
    `Dias por semana: ${input.daysPerWeek}`,
    `Tempo por sessão: ${input.sessionMinutes} min`,
    `Equipamento: ${EQUIPMENT_TEXT[input.equipment]}`,
    `Sistema: ${sys.name}`,
    ...sys.templates.map((t) => `- Dia ${t.key} (${t.title})${t.style ? ` — dia de ${t.style === "forca" ? "força" : "volume"}` : ""}. Estrutura sugerida: ${t.slots.map(describeSlot).join("; ")}.`),
    input.system === "forca_5x5"
      ? "5×5: agachamento livre nos dois dias; A = supino reto + remada curvada; B = desenvolvimento militar + levantamento terra (terra 1×5). Principais 5×5 (iniciante 3×5), descanso de 150–180 s, no máximo 1–2 acessórios."
      : "",
    input.emphasis?.length ? `Prioridade (precisa aparecer na ficha, com exercícios diretos): ${input.emphasis.map((g) => GROUP_LABEL[g]).join(", ")}` : "",
    input.limitations ? `Limitações/lesões: ${input.limitations}` : "Sem limitações informadas.",
    avoid.length ? `Não use (limitações): ${avoid.join(", ")}` : "",
    input.notes ? `Pedido do usuário: ${input.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const clamp = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(typeof v === "number" && Number.isFinite(v) ? v : min)));

/**
 * Converte e saneia a resposta da IA; volta null (o motor assume) se não for utilizável.
 * Aplica as mesmas garantias do motor: equipamento, nível, limitações, unidade do exercício e teto de tempo.
 */
export function programFromAI(ai: AIProgram, input: ProgramRequest, owner: { ownerId: string; createdBy: string }): Program | null {
  if (!ai || !Array.isArray(ai.days)) return null;
  const sys = getSystem(input.system);
  const lim = analyzeLimitations(input.limitations);
  const strict = input.equipment === "academia" && (input.goal === "hipertrofia" || input.goal === "forca");
  const fiveByFive = input.system === "forca_5x5";

  const days: WorkoutDay[] = sys.templates.map((tpl, i) => {
    const d = ai.days.find((x) => x.key === tpl.key) ?? ai.days[i];
    const seen = new Set<string>();
    const exercises: PlannedExercise[] = [];
    for (const e of d?.exercises ?? []) {
      const ex = getExercise(e.exerciseId);
      if (!ex || seen.has(ex.id)) continue;
      seen.add(ex.id);
      if (!allowedByEquipment(ex, input.equipment) || lim.avoid.has(ex.id)) continue;
      if (strict && isGymRegression(ex)) continue;
      // No 5×5 os básicos com barra valem para qualquer nível; fora dele, vale o nível mínimo do exercício.
      if (!allowedForLevel(ex, input.level) && !(fiveByFive && ex.main)) continue;
      if (exercises.length >= 10) break;

      const unit = ex.unit ?? "reps";
      const floor = unit === "reps" && ex.pattern !== "core" && ex.pattern !== "cardio" ? lim.minRepsFor(ex.group) : 0;
      const repsMin = Math.max(clamp(e.repsMin, 1, unit === "seg" ? 300 : unit === "min" ? 90 : 60), floor);
      const repsMax = clamp(Math.max(clamp(e.repsMax, 1, 300), repsMin, floor ? floor + 2 : 0), repsMin, unit === "seg" ? 300 : unit === "min" ? 90 : 60);
      const side = ex.unilateral ? (unit === "seg" ? "Tempo por lado." : "Repetições por lado.") : "";
      const notes = [e.notes?.trim().slice(0, 120), side && !/por lado|cada lado|cada perna|cada braço/i.test(e.notes ?? "") ? side : "", lim.noteFor(ex.id)].filter(Boolean).join(" ");
      exercises.push({
        uid: uid(),
        exerciseId: ex.id,
        name: ex.name,
        sets: unit === "min" ? 1 : clamp(e.sets, 1, floor ? 3 : 8),
        repsMin,
        repsMax,
        restSec: unit === "min" ? 0 : clamp(e.restSec, 15, floor ? 90 : 300),
        loadKg: null,
        technique: TECHNIQUES.includes(e.technique) && !(e.technique !== "normal" && input.level === "iniciante") ? e.technique : "normal",
        ...(notes ? { notes } : {}),
        ...(unit !== "reps" ? { unit } : {}),
      });
    }
    const focus = (d?.focus ?? []).filter((g) => GROUPS.includes(g));
    const day: WorkoutDay = { key: tpl.key, title: d?.title?.trim().slice(0, 80) || tpl.title, focus: focus.length ? focus : tpl.focus, exercises };
    return fitDayToTime(day, input.sessionMinutes, input.emphasis ?? []);
  });

  // Dia curto demais ou prioridade sem exercício direto: melhor a ficha do motor.
  const tooShort = sys.templates.some((tpl, i) => days[i]!.exercises.length < Math.min(4, tpl.slots.filter((s) => !s.optional).length));
  const all = days.flatMap((d) => d.exercises);
  const missedEmphasis = (input.emphasis ?? []).some((g) => g !== "cardio" && !all.some((e) => getExercise(e.exerciseId)?.group === g));
  if (tooShort || missedEmphasis) return null;

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
