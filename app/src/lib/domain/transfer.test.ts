import { describe, expect, it } from "vitest";
import { packData, packedFromHash, unpackData } from "../share-link";
import { buildFichaPacket, buildTreinosPacket, MAX_SESSIONS_PER_LINK, parsePacket, sessionToText, treinosMessage } from "./transfer";
import type { DietPlan, Exercise, Profile, Program, Session } from "./types";

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z", phone: "11988887777" };
const student: Profile = { id: "s1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", sex: "F", birthYear: 1996, weightKg: 62.5, goal: "hipertrofia", coachNotes: "não mandar", managedBy: "c1", limitations: "" };
const program: Program = {
  id: "p1",
  ownerId: "s1",
  createdBy: "c1",
  name: "ABC Hipertrofia",
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  days: [
    {
      key: "A",
      title: "Peito e tríceps",
      focus: ["peito"],
      exercises: [
        { uid: "u1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: 4, repsMin: 8, repsMax: 10, restSec: 120, loadKg: 40, technique: "normal" },
        { uid: "u2", exerciseId: "custom_remada", name: "Remada articulada", sets: 3, repsMin: 10, repsMax: 12, restSec: 90, technique: "normal", notes: "pegada neutra" },
      ],
    },
  ],
  active: true,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
};
const diet: DietPlan = {
  id: "d1",
  ownerId: "s1",
  createdBy: "c1",
  name: "Plano alimentar de Marina",
  targets: { kcal: 2000, proteinG: 130, carbsG: 220, fatG: 60 },
  meals: [{ uid: "m1", name: "Café da manhã", time: "07:00", items: [{ uid: "i1", foodId: "custom_iogurte", name: "Iogurte proteico", grams: 250, kcal: 150, proteinG: 23, carbsG: 11, fatG: 1 }] }],
  updatedAt: "2026-11-01T10:00:00Z",
};
const customEx: Exercise[] = [
  { id: "custom_remada", name: "Remada articulada", group: "costas", implement: "maquina", pattern: "puxar_h", compound: true, custom: true },
  { id: "custom_outro", name: "Outro", group: "peito", implement: "maquina", pattern: "empurrar_h", compound: true, custom: true },
];

function session(id: string, day: number, extra: Partial<Session> = {}): Session {
  const start = new Date(2026, 10, day, 18, 0).toISOString();
  return {
    id,
    userId: "aluno-local",
    programId: "p1",
    dayKey: "A",
    dayTitle: "Peito e tríceps",
    startedAt: start,
    finishedAt: new Date(Date.parse(start) + 52 * 60000).toISOString(),
    exercises: [
      { uid: "e1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: [{ loadKg: 40, reps: 10, done: true }, { loadKg: 42.5, reps: 8, done: true }, { loadKg: 42.5, reps: null, done: false }] },
      { uid: "e2", exerciseId: "prancha", name: "Prancha", unit: "seg", sets: [{ loadKg: null, reps: 45, done: true }] },
    ],
    volumeKg: 740,
    prs: ["supino_reto_barra"],
    feeling: 4,
    note: "ombro tranquilo",
    ...extra,
  };
}

describe("envio por link", () => {
  it("pacote da ficha leva só o necessário: sem anotações do personal, só os exercícios próprios usados", () => {
    const p = buildFichaPacket({ coach, student, program, diet, customExercises: customEx, customFoods: [{ id: "custom_iogurte", name: "Iogurte proteico", aliases: [], kcal: 60, p: 9.4, c: 4.5, f: 0.5, category: "laticinio" }], now: new Date("2026-11-20T12:00:00Z") });
    expect(p.student).toMatchObject({ ref: "s1", name: "Marina Costa", sex: "F", weightKg: 62.5 });
    expect(p.student).not.toHaveProperty("coachNotes");
    expect(p.student).not.toHaveProperty("managedBy");
    expect(p.student).not.toHaveProperty("limitations");
    expect(p.exercises.map((e) => e.id)).toEqual(["custom_remada"]);
    expect(p.foods.map((f) => f.id)).toEqual(["custom_iogurte"]);
    expect(p.coach).toEqual({ id: "c1", name: "Rafael Nunes", phone: "11988887777" });
  });

  it("vai e volta pelo link sem perder nada e cabe numa mensagem", async () => {
    const p = buildFichaPacket({ coach, student, program, diet, customExercises: customEx, customFoods: [] });
    const packed = await packData(p);
    expect(packed.startsWith("1.")).toBe(true);
    expect(packed).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(packed.length).toBeLessThan(3000);
    const back = parsePacket(await unpackData(packed));
    expect(back).toEqual(p);
    expect(packedFromHash(`#d=${packed}`)).toBe(packed);
  });

  it("ficha grande (6 treinos × 10 exercícios) com dieta completa ainda gera link curto", async () => {
    const big: Program = {
      ...program,
      days: Array.from({ length: 6 }, (_, d) => ({
        key: "ABCDEF"[d]!,
        title: `Treino ${d}`,
        focus: [],
        exercises: Array.from({ length: 10 }, (_, i) => ({ uid: `u${d}${i}`, exerciseId: `exercicio_${i}`, name: `Exercício número ${i} com nome comprido`, sets: 4, repsMin: 8, repsMax: 12, restSec: 90, loadKg: 20 + i, technique: "normal", notes: "Descer controlando em 3 segundos" })),
      })),
    };
    const packed = await packData(buildFichaPacket({ coach, student, program: big, diet, customExercises: [], customFoods: [] }));
    expect(packed.length).toBeLessThan(8000);
  });

  it("pacote de treinos: os mais recentes, até o limite", () => {
    const many = Array.from({ length: MAX_SESSIONS_PER_LINK + 5 }, (_, i) => session(`s${i}`, 1 + (i % 28)));
    const p = buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: many });
    expect(p.sessions).toHaveLength(MAX_SESSIONS_PER_LINK);
    expect(parsePacket(JSON.parse(JSON.stringify(p)))).not.toBeNull();
  });

  it("recusa o que não é um link válido", async () => {
    expect(parsePacket({ kind: "ficha", v: 1 })).toBeNull();
    expect(parsePacket({ kind: "outra" })).toBeNull();
    expect(parsePacket(null)).toBeNull();
    const p = buildFichaPacket({ coach, student, program, diet: null, customExercises: [], customFoods: [] });
    expect(parsePacket({ ...p, program: { ...program, days: [] } })).toBeNull();
    expect(parsePacket({ ...p, exercises: [{ ...customEx[0], id: "supino_reto_barra" }] })).toBeNull();
    await expect(unpackData("x.abc")).rejects.toThrow();
    await expect(unpackData("1.!!!")).rejects.toThrow();
  });

  it("texto do treino para o WhatsApp", () => {
    const t = sessionToText(session("a", 20));
    expect(t.split("\n")[0]).toBe("*Treino A — Peito e tríceps · 20/11 · 52 min*");
    expect(t).toContain("• Supino reto com barra: 40×10 · 42,5×8");
    expect(t).toContain("• Prancha: 45 s");
    expect(t).toContain("Recorde: Supino reto com barra");
    expect(t).toContain("Como foi: Bom");
    expect(t).toContain("Anotação: ombro tranquilo");
    expect(t).not.toMatch(/undefined|null|NaN/);
  });

  it("mensagem com vários treinos resume e leva o link", () => {
    const msg = treinosMessage([session("a", 18), session("b", 20)], "https://x/receber#d=1.abc", "Rafael");
    expect(msg.startsWith("Rafael, 2 treinos feitos:")).toBe(true);
    expect(msg.indexOf("18/11")).toBeLessThan(msg.indexOf("20/11"));
    expect(msg.trim().endsWith("https://x/receber#d=1.abc")).toBe(true);
    const many = treinosMessage([1, 2, 3, 4].map((d) => session(`x${d}`, d)), "L");
    expect(many).toContain("• Treino A · 01/11");
    expect(many).not.toContain("Supino");
  });
});
