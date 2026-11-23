import { describe, expect, it, vi } from "vitest";
import { buildSoloProgram, firstDayKey, sessionHref, welcomeRequested } from "./entry-points";
import type { GenerateInput } from "./domain/generator";
import type { Program } from "./domain/types";

const params = (q: string) => new URLSearchParams(q);
const input: GenerateInput = { goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc", emphasis: [], seed: 42 };
const owner = { ownerId: "u1", createdBy: "u1" };

describe("welcomeRequested", () => {
  it("aceita o parâmetro novo e o antigo", () => {
    expect(welcomeRequested(params("bemvindo=1"))).toBe(true);
    expect(welcomeRequested(params("boasvindas=1"))).toBe(true);
  });
  it("sem parâmetro, sem cartão", () => {
    expect(welcomeRequested(params(""))).toBe(false);
    expect(welcomeRequested(params("bemvindo="))).toBe(false);
    expect(welcomeRequested(params("novo=1"))).toBe(false);
  });
});

describe("firstDayKey e sessionHref", () => {
  it("usa o primeiro treino do sistema", () => {
    expect(firstDayKey("abc")).toBe("A");
    expect(firstDayKey("upper_lower")).toBe("U1");
    expect(firstDayKey("ppl")).toBe("Push");
  });
  it("monta o link da sessão com os valores codificados", () => {
    expect(sessionHref("p1", "A")).toBe("/sessao?p=p1&d=A");
    expect(sessionHref("p 2", "Push A")).toBe("/sessao?p=p%202&d=Push%20A");
  });
});

describe("buildSoloProgram", () => {
  it("IA desligada: gera no aparelho e nunca chama a IA", async () => {
    const viaAI = vi.fn();
    const r = await buildSoloProgram(input, owner, { aiOn: false, viaAI });
    expect(viaAI).not.toHaveBeenCalled();
    expect(r.generation).toBe("local");
    expect(r.program.ownerId).toBe("u1");
    expect(r.program.system).toBe("abc");
    expect(r.program.days[0]?.key).toBe("A");
    expect(r.program.days.every((d) => d.exercises.length > 0)).toBe(true);
  });

  it("IA ligada mas sem sinal: cai no motor do aparelho", async () => {
    const viaAI = vi.fn().mockRejectedValue(new Error("Sem conexão com a internet."));
    const r = await buildSoloProgram(input, owner, { aiOn: true, viaAI });
    expect(viaAI).toHaveBeenCalledOnce();
    expect(r.generation).toBe("local");
    expect(r.program.days.length).toBe(3);
  });

  it("IA ligada e respondendo: usa a ficha da IA", async () => {
    const fromAI = { id: "ia1", ownerId: "u1", createdBy: "u1", name: "Ficha IA", system: "abc", goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, days: [{ key: "A", title: "A", focus: [], exercises: [] }], active: true, source: "ia", createdAt: "", updatedAt: "" } as Program;
    const r = await buildSoloProgram(input, owner, { aiOn: true, viaAI: async () => ({ data: fromAI, source: "ia" }) });
    expect(r).toEqual({ program: fromAI, generation: "ia" });
  });

  it("servidor respondeu com o motor: conta como geração por regras", async () => {
    const motor = await buildSoloProgram(input, owner, { aiOn: false });
    const r = await buildSoloProgram(input, owner, { aiOn: true, viaAI: async () => ({ data: motor.program, source: "motor" }) });
    expect(r.generation).toBe("local");
  });

  it("sem sinal com 5×5 fora da academia também entrega ficha (o motor troca o sistema)", async () => {
    const r = await buildSoloProgram({ ...input, system: "forca_5x5", equipment: "home" }, owner, { aiOn: false });
    expect(r.program.system).toBe("fullbody");
    expect(r.program.days[0]?.key).toBe("A");
  });
});
