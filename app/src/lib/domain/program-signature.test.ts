import { describe, expect, it } from "vitest";
import { registerCustomExercises } from "./exercises";
import { focusOfDay } from "./program-share";
import { draftStillValid, draftToRestore, normalizeForSave, parseFichaDraft, programForSave, programSignature } from "./program-signature";
import type { PlannedExercise, Program } from "./types";

const ex = (uid: string, over: Partial<PlannedExercise> = {}): PlannedExercise => ({
  uid,
  exerciseId: "supino_reto_barra",
  name: "Supino reto com barra",
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  restSec: 90,
  loadKg: 25,
  technique: "normal",
  ...over,
});

const base: Program = {
  id: "p1",
  ownerId: "s1",
  createdBy: "c1",
  name: "ABC Hipertrofia",
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  durationWeeks: 8,
  notes: "Aquecer 10 min",
  days: [
    { key: "A", title: "Peito", focus: ["peito"], exercises: [ex("u1"), ex("u2", { exerciseId: "prancha", name: "Prancha", repsMin: 30, repsMax: 45, loadKg: null, unit: "seg" }), ex("u3", { notes: "pegada neutra" })] },
    { key: "B", title: "Costas", focus: [], exercises: [ex("u4"), ex("u5")] },
    { key: "C", title: "", focus: [], exercises: [] },
  ],
  active: true,
  source: "personal",
  createdAt: "2026-10-12T12:00:00Z",
  updatedAt: "2026-11-20T12:00:00Z",
};

const withEx = (p: Program, dayIndex: number, uid: string, patch: Partial<PlannedExercise>): Program => ({
  ...p,
  days: p.days.map((d, i) => (i === dayIndex ? { ...d, exercises: d.exercises.map((e) => (e.uid === uid ? { ...e, ...patch } : e)) } : d)),
});

/** Como o "Salvar ficha" limpava a ficha antes da U5a (program-editor.tsx:243-252), sem a data de edição. */
function oldSaveClean(program: Program): Program {
  return {
    ...program,
    name: program.name.trim(),
    days: program.days.map((x) => ({
      ...x,
      key: x.key.trim(),
      title: x.title.trim(),
      focus: x.exercises.length ? focusOfDay(x) : x.focus,
      exercises: x.exercises.map((e) => ({ ...e, repsMin: Math.min(e.repsMin, e.repsMax), repsMax: Math.max(e.repsMin, e.repsMax), notes: e.notes?.trim() || undefined })),
    })),
  };
}

describe("normalizeForSave", () => {
  it("grava exatamente o que o save() de hoje gravava, numa ficha suja", () => {
    const dirty: Program = {
      ...base,
      name: "  ABC Hipertrofia  ",
      notes: "  orientações com espaço  ",
      days: [
        { key: " a ", title: "  Peito ", focus: [], exercises: [ex("u1", { repsMin: 12, repsMax: 8, notes: "   " }), ex("u2", { notes: " cadência 3s " })] },
        { key: "B", title: "Vazio", focus: ["costas"], exercises: [] },
      ],
    };
    const out = normalizeForSave(dirty);
    expect(out).toEqual(oldSaveClean(dirty));
    // Não mexe na data de edição nem nas orientações gerais (o save() de hoje também não mexia).
    expect(out.updatedAt).toBe(dirty.updatedAt);
    expect(out.notes).toBe("  orientações com espaço  ");
    expect(out.days[0]!.exercises[0]).toMatchObject({ repsMin: 8, repsMax: 12, notes: undefined });
    expect(out.days[1]!.focus).toEqual(["costas"]);
  });
});

describe("programSignature", () => {
  const sig = programSignature(base);

  it("igual para fichas equivalentes", () => {
    const equivalent: Program = {
      ...base,
      name: ` ${base.name} `,
      notes: `${base.notes}   `,
      updatedAt: "2026-11-23T00:00:00Z",
      createdAt: "2020-01-01T00:00:00Z",
      active: false,
      adjustedAt: "2026-11-22T00:00:00Z",
      days: base.days.map((d, i) => ({
        ...d,
        key: i === 0 ? " A" : d.key,
        title: i === 0 ? "Peito  " : d.title,
        focus: ["cardio"],
        exercises: d.exercises.map((e) =>
          e.uid === "u1"
            ? { ...e, repsMin: 12, repsMax: 8, unit: "reps" as const } // faixa invertida e unidade padrão escrita
            : e.uid === "u2"
              ? { ...e, loadKg: 0, unit: undefined } // carga 0 e unidade padrão do exercício (segundos)
              : e.uid === "u4"
                ? { ...e, notes: "  " }
                : e,
        ),
      })),
    };
    expect(programSignature(equivalent)).toBe(sig);
    // Campos que a anamnese acrescentar sem passar pelo editor não contam.
    expect(programSignature({ ...base, sharedAt: "2026-11-23T00:00:00Z", sugerido: true } as Program)).toBe(sig);
    // Sem validade: 0, null e ausente são o mesmo.
    const noValidity = { ...base, durationWeeks: undefined };
    expect(programSignature({ ...base, durationWeeks: 0 })).toBe(programSignature(noValidity));
    // Orientações vazias = sem orientações; carga null = sem carga.
    expect(programSignature({ ...base, notes: "   " })).toBe(programSignature({ ...base, notes: undefined }));
    expect(programSignature(withEx(base, 0, "u1", { loadKg: null }))).toBe(programSignature(withEx(base, 0, "u1", { loadKg: undefined })));
  });

  it("diferente com outra carga, outra ordem ou qualquer outro campo de conteúdo", () => {
    expect(programSignature(withEx(base, 0, "u1", { loadKg: 30 }))).not.toBe(sig);
    expect(programSignature(withEx(base, 0, "u1", { restSec: 120 }))).not.toBe(sig);
    expect(programSignature(withEx(base, 0, "u2", { unit: "min" }))).not.toBe(sig);
    expect(programSignature(withEx(base, 0, "u3", { notes: "pegada aberta" }))).not.toBe(sig);
    const reordered = { ...base, days: [{ ...base.days[0]!, exercises: [...base.days[0]!.exercises].reverse() }, ...base.days.slice(1)] };
    expect(programSignature(reordered)).not.toBe(sig);
    expect(programSignature({ ...base, days: [...base.days].reverse() })).not.toBe(sig);
    expect(programSignature({ ...base, days: base.days.map((d, i) => (i === 1 ? { ...d, key: "Push" } : d)) })).not.toBe(sig);
    expect(programSignature({ ...base, durationWeeks: 12 })).not.toBe(sig);
    expect(programSignature({ ...base, goal: "forca" })).not.toBe(sig);
    // Rede de segurança: campo que o editor não mostra também conta.
    expect(programSignature({ ...base, daysPerWeek: 4 })).not.toBe(sig);
  });

  it("exercício próprio: a assinatura não muda quando a biblioteca dele termina de carregar", () => {
    const custom = withEx(base, 1, "u4", { exerciseId: "custom_ponte", name: "Ponte com elástico", unit: undefined });
    registerCustomExercises([]);
    const before = programSignature(custom);
    registerCustomExercises([{ id: "custom_ponte", name: "Ponte com elástico", group: "gluteos", implement: "elastico", pattern: "quadril", compound: false, unit: "seg" }]);
    expect(programSignature(custom)).toBe(before);
    registerCustomExercises([]);
  });
});

describe("rascunho do editor", () => {
  const draftOf = (program: Program, from: Program = base) => ({ program, baseSig: programSignature(from) });
  const edited = withEx(base, 0, "u1", { loadKg: 10 });

  it("draftStillValid: ficha gravada igual à de partida → vale", () => {
    expect(draftStillValid(draftOf(edited), base)).toBe(true);
    // Só a data de edição (ou a ficha ativa) mudou: o conteúdo é o mesmo, o rascunho continua valendo.
    expect(draftStillValid(draftOf(edited), { ...base, updatedAt: "2026-11-23T09:00:00Z", active: false })).toBe(true);
  });

  it("draftStillValid: carga espelhada de um treino depois do rascunho → não vale (a carga do treino não se perde)", () => {
    const afterWorkout = withEx(base, 0, "u1", { loadKg: 40 });
    // Com keepUpdatedAt ao finalizar o treino, o updatedAt fica igual: só o conteúdo denuncia a versão nova.
    expect(afterWorkout.updatedAt).toBe(base.updatedAt);
    expect(draftStillValid(draftOf(edited), afterWorkout)).toBe(false);
    expect(draftToRestore(draftOf(edited), afterWorkout)).toBeNull();
  });

  it("draftStillValid: rascunho antigo, sem baseSig → regra do updatedAt", () => {
    expect(draftStillValid({ program: edited }, base)).toBe(true);
    expect(draftStillValid({ program: edited }, { ...base, updatedAt: "2026-11-21T00:00:00Z" })).toBe(false);
  });

  it("draftStillValid: rascunho de outra ficha nunca vale", () => {
    expect(draftStillValid(draftOf({ ...edited, id: "p2" }), base)).toBe(false);
  });

  it("draftToRestore: devolve a ficha em edição; sem diferença da versão gravada, descarta em silêncio", () => {
    expect(draftToRestore(draftOf(edited), base)).toEqual(edited);
    expect(draftToRestore(draftOf({ ...base, name: ` ${base.name} ` }), base)).toBeNull();
    expect(draftToRestore(null, base)).toBeNull();
  });

  it("parseFichaDraft: formato novo, formato antigo e lixo", () => {
    const sigBase = programSignature(base);
    expect(parseFichaDraft(JSON.stringify({ program: edited, baseSig: sigBase }), "p1")).toEqual({ program: edited, baseSig: sigBase });
    expect(parseFichaDraft(JSON.stringify(edited), "p1")).toEqual({ program: edited });
    expect(parseFichaDraft(JSON.stringify({ program: edited, baseSig: 3 }), "p1")).toEqual({ program: edited });
    expect(parseFichaDraft(JSON.stringify({ program: edited }), "p2")).toBeNull();
    expect(parseFichaDraft(JSON.stringify({ program: { ...edited, days: [] } }), "p1")).toBeNull();
    expect(parseFichaDraft("{quebrado", "p1")).toBeNull();
    expect(parseFichaDraft("null", "p1")).toBeNull();
    expect(parseFichaDraft(null, "p1")).toBeNull();
  });
});

describe("programForSave", () => {
  const now = "2026-11-24T15:00:00.000Z";

  it("ficha recebida ajustada no modo local: grava adjustedAt e mantém createdBy", () => {
    const { program, changed } = programForSave(withEx(base, 0, "u1", { sets: 5 }), base, { now, markAdjusted: true });
    expect(changed).toBe(true);
    expect(program).toMatchObject({ adjustedAt: now, updatedAt: now, createdBy: "c1" });
  });

  it("sem diferença não marca ajuste, mesmo que peça", () => {
    const { program, changed } = programForSave({ ...base, name: ` ${base.name}` }, base, { now, markAdjusted: true });
    expect(changed).toBe(false);
    expect(program.adjustedAt).toBeUndefined();
  });

  it("sem pedido (modelo, aluno, própria, como aluno, nuvem) nunca marca; um ajuste antigo continua", () => {
    expect(programForSave(withEx(base, 0, "u1", { sets: 5 }), base, { now, markAdjusted: false }).program.adjustedAt).toBeUndefined();
    const old = { ...base, adjustedAt: "2026-11-22T10:00:00.000Z" };
    expect(programForSave(withEx(old, 0, "u1", { sets: 5 }), old, { now, markAdjusted: false }).program.adjustedAt).toBe("2026-11-22T10:00:00.000Z");
  });

  it("grava a ficha limpa, como antes", () => {
    const dirty = withEx({ ...base, name: "  Nome  " }, 0, "u1", { repsMin: 12, repsMax: 8 });
    const { program } = programForSave(dirty, base, { now, markAdjusted: false });
    expect(program).toEqual({ ...oldSaveClean(dirty), updatedAt: now });
  });
});
