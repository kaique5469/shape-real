import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fmtTime, programValidity, validityEnd } from "./format";

describe("validityEnd", () => {
  it("é a mesma data que programValidity usa, para 4, 8 e 12 semanas", () => {
    const createdAt = "2026-10-03T14:25:00.000Z";
    for (const weeks of [4, 8, 12]) {
      const end = validityEnd(createdAt, weeks);
      expect(end.toISOString()).toBe(new Date(Date.parse(createdAt) + weeks * 7 * 86_400_000).toISOString());
      // No exato fim, programValidity diz "vence hoje"; um dia depois, "vencida ontem".
      expect(programValidity(createdAt, weeks, end)).toMatchObject({ state: "soon", label: "vence hoje" });
      expect(programValidity(createdAt, weeks, new Date(end.getTime() + 86_400_000))).toMatchObject({ state: "expired", days: -1, label: "vencida ontem" });
      // Um dia antes do fim: vence amanhã.
      expect(programValidity(createdAt, weeks, new Date(end.getTime() - 86_400_000))).toMatchObject({ state: "soon", days: 1 });
    }
  });

  it("programValidity continua com o mesmo resultado", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    expect(programValidity("2026-11-01T10:00:00Z", 4, now)).toEqual({ state: "soon", days: 6, label: "vence em 6 dias" });
    expect(programValidity("2026-10-01T10:00:00Z", 4, now)).toEqual({ state: "expired", days: -25, label: "vencida há 25 dias" });
    expect(programValidity("2026-11-20T10:00:00Z", 12, now)).toEqual({ state: "ok", days: 81, label: "vence em 12 semanas" });
    expect(programValidity("2026-11-20T10:00:00Z", 0, now)).toBeNull();
  });
});

describe("fmtTime", () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Sao_Paulo";
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  it("hora e minuto com dois dígitos, no fuso do aparelho", () => {
    expect(fmtTime("2026-11-23T21:40:00.000Z")).toBe("18:40");
    expect(fmtTime("2026-11-23T10:05:00.000Z")).toBe("07:05");
    expect(fmtTime("2026-11-24T02:59:59.000Z")).toBe("23:59");
  });

  it("data inválida → vazio (nunca 'NaN:NaN')", () => {
    expect(fmtTime("ontem")).toBe("");
  });
});
