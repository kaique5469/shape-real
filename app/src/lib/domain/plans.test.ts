import { describe, expect, it } from "vitest";
import { PLANS, studentQuota } from "./plans";

const real = (n: number) => Array.from({ length: n }, () => ({ profile: {} }));
const samples = (n: number) => Array.from({ length: n }, () => ({ profile: { sample: true } }));

describe("studentQuota", () => {
  it("modo local: sem limite, o 21º aluno entra e o contador não tem teto", () => {
    const q = studentQuota(real(21), { local: true, plan: "coach" });
    expect(q).toEqual({ count: 21, max: null, full: false });
  });

  it("alunos de exemplo não contam", () => {
    expect(studentQuota([...real(2), ...samples(3)], { local: true, plan: "coach" }).count).toBe(2);
    expect(studentQuota(samples(5), { local: false, plan: "free" })).toEqual({ count: 0, max: 3, full: false });
  });

  it("na nuvem o plano limita: grátis com 3, Personal com o teto do plano", () => {
    expect(studentQuota(real(3), { local: false, plan: "free" })).toEqual({ count: 3, max: 3, full: true });
    expect(studentQuota(real(19), { local: false, plan: "coach" })).toEqual({ count: 19, max: PLANS.coach.maxStudents, full: false });
    expect(studentQuota(real(PLANS.coach.maxStudents), { local: false, plan: "coach" }).full).toBe(true);
  });
});

describe("PLANS", () => {
  it("cópia de segurança em JSON é grátis em todos os planos, separada da planilha", () => {
    for (const p of Object.values(PLANS)) expect(p.backup).toBe(true);
    expect(PLANS.free.export).toBe(false);
    expect(PLANS.free.features.some((f) => /cópia de segurança/i.test(f))).toBe(true);
  });

  it("os recursos não prometem IA, convite por código nem teto de 20 alunos", () => {
    const text = Object.values(PLANS)
      .flatMap((p) => [p.tagline, ...p.features])
      .join(" | ");
    expect(text).not.toMatch(/\bIA\b/);
    expect(text).not.toMatch(/convite por código/i);
    expect(text).not.toMatch(/até 20/i);
  });
});
