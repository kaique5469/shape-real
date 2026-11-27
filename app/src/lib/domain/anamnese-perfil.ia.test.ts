import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase } from "./anamnese-fixtures";
import { pesoParaIA } from "./anamnese-perfil";

// Revisão da rodada 2: o peso respondido no questionário não vai para /api/ai/diet ("As respostas não passam pelo
// servidor do Shape Real").

describe("pesoParaIA", () => {
  it("peso igual ao respondido (rodada atual ou anterior): não vai", () => {
    expect(pesoParaIA(alunoBase({ weightKg: 62, anamnese: anamneseBase({ peso: 62 }) }))).toBeUndefined();
    expect(pesoParaIA(alunoBase({ weightKg: 66, anamnese: anamneseBase({ peso: 62 }), anamnesePrev: anamneseBase({ peso: 66 }, { id: "an-0" }) }))).toBeUndefined();
  });
  it("peso medido pelo personal (outro valor) ou sem questionário: vai como antes", () => {
    expect(pesoParaIA(alunoBase({ weightKg: 64.5, anamnese: anamneseBase({ peso: 62 }) }))).toBe(64.5);
    expect(pesoParaIA(alunoBase({ weightKg: 70 }))).toBe(70);
    expect(pesoParaIA(alunoBase())).toBeUndefined();
  });
});
