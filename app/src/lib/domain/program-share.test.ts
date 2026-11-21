import { describe, expect, it } from "vitest";
import { cloneProgram, focusOfDay, nextDayKey, programSetsPerGroup, programToText, techniqueText } from "./program-share";
import type { Program } from "./types";

const program: Program = {
  id: "p1",
  ownerId: "u1",
  createdBy: "c1",
  name: "ABC Hipertrofia",
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  durationWeeks: 6,
  notes: "Aqueça 5 min antes.",
  active: true,
  source: "personal",
  createdAt: "2026-01-01T10:00:00Z",
  updatedAt: "2026-01-01T10:00:00Z",
  days: [
    {
      key: "A",
      title: "Peito e tríceps",
      focus: ["peito", "triceps"],
      exercises: [
        { uid: "1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: 4, repsMin: 6, repsMax: 8, restSec: 120, loadKg: 80, technique: "normal" },
        { uid: "2", exerciseId: "triceps_corda", name: "Tríceps na corda", sets: 3, repsMin: 10, repsMax: 12, restSec: 60, loadKg: 22.5, technique: "drop_set", notes: "Cotovelos colados" },
        { uid: "3", exerciseId: "prancha", name: "Prancha", sets: 3, repsMin: 30, repsMax: 45, restSec: 45, technique: "normal" },
      ],
    },
    { key: "B", title: "", focus: [], exercises: [] },
  ],
};

describe("ficha em texto para WhatsApp", () => {
  const text = programToText(program, { studentName: "Ana Souza", coachName: "Carlos" });
  it("traz cabeçalho, validade e quem enviou", () => {
    expect(text.split("\n")[0]).toBe("*ABC Hipertrofia*");
    expect(text).toContain("Aluno: Ana Souza · Personal: Carlos");
    expect(text).toContain("Validade: 6 semanas");
  });
  it("formata cada exercício com esquema, carga e descanso", () => {
    expect(text).toContain("1. Supino reto com barra — 4 × 6–8 · 80 kg · desc. 2:00");
    expect(text).toContain("2. Tríceps na corda — 3 × 10–12 · 22,5 kg · desc. 1:00");
  });
  it("mostra técnica e observação na linha seguinte", () => {
    expect(text).toMatch(/Tríceps na corda[^\n]*\n {3}Drop-?set[^\n]*Cotovelos colados/i);
  });
  it("respeita a unidade (segundos) e não envia treino vazio", () => {
    expect(text).toContain("3. Prancha — 3 × 30–45 s · desc. 45s");
    expect(text).not.toContain("*B*");
  });
  it("bi-set: o primeiro diz 'com o próximo' e o segundo 'com o anterior'", () => {
    const list = [{ technique: "normal" }, { technique: "bi_set" }, { technique: "bi_set" }, { technique: "tri_set" }, { technique: "tri_set" }, { technique: "tri_set" }, { technique: "drop_set" }] as const;
    expect(techniqueText([...list], 0)).toBeNull();
    expect(techniqueText([...list], 1)).toBe("Bi-set com o próximo");
    expect(techniqueText([...list], 2)).toBe("Bi-set com o anterior");
    expect(techniqueText([...list], 3)).toBe("Tri-set com os próximos");
    expect(techniqueText([...list], 4)).toBe("Tri-set em sequência");
    expect(techniqueText([...list], 5)).toBe("Tri-set com os anteriores");
    expect(techniqueText([...list], 6)).toMatch(/Drop-set/);
    // Só o primeiro marcado: continua "com o próximo".
    expect(techniqueText([{ technique: "bi_set" }, { technique: "normal" }], 0)).toBe("Bi-set com o próximo");
  });
  it("termina com as orientações e não usa emoji", () => {
    expect(text.trim().endsWith("Aqueça 5 min antes.")).toBe(true);
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  });
});

describe("cópia e resumo da ficha", () => {
  it("clona com ids novos e aplica o patch", () => {
    const c = cloneProgram(program, { ownerId: "u2", active: false, name: "Cópia" });
    expect(c.id).not.toBe(program.id);
    expect(c.ownerId).toBe("u2");
    expect(c.days[0]!.exercises[0]!.uid).not.toBe("1");
    expect(c.days[0]!.exercises).toHaveLength(3);
    c.days[0]!.exercises[0]!.sets = 9;
    expect(program.days[0]!.exercises[0]!.sets).toBe(4);
  });
  it("soma séries diretas por grupo", () => {
    const rows = programSetsPerGroup(program);
    expect(rows.find((r) => r.group === "peito")?.sets).toBe(4);
    expect(rows.find((r) => r.group === "triceps")?.sets).toBe(3);
  });
  it("deriva o foco do dia e a próxima letra", () => {
    expect(focusOfDay(program.days[0]!).slice(0, 2)).toEqual(["peito", "triceps"]);
    expect(nextDayKey(program.days)).toBe("C");
  });
});
