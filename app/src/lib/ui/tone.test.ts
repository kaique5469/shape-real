import { describe, expect, it } from "vitest";
import { programValidity } from "@/lib/domain/format";
import { recordText, validityIcon, validityTone } from "./tone";

describe("validityTone", () => {
  it("null e ok → neutral; soon e expired → warn", () => {
    expect(validityTone(null)).toBe("neutral");
    expect(validityTone({ state: "ok" })).toBe("neutral");
    expect(validityTone({ state: "soon" })).toBe("warn");
    expect(validityTone({ state: "expired" })).toBe("warn");
  });
});

describe("validityIcon", () => {
  it("expired → CalendarX; soon → CalendarClock; ok e null → null", () => {
    expect(validityIcon({ state: "expired" })).toBe("CalendarX");
    expect(validityIcon({ state: "soon" })).toBe("CalendarClock");
    expect(validityIcon({ state: "ok" })).toBeNull();
    expect(validityIcon(null)).toBeNull();
  });

  it("com programValidity: criada há 30 dias com 4 semanas → CalendarX; vence em 3 dias → CalendarClock", () => {
    const now = new Date("2026-11-23T10:00:00Z");
    const day = 86_400_000;
    const vencida = programValidity(new Date(now.getTime() - 30 * day).toISOString(), 4, now);
    expect(validityIcon(vencida)).toBe("CalendarX");
    expect(validityTone(vencida)).toBe("warn");
    // 4 semanas = 28 dias; criada há 25 dias → vence em 3 dias.
    const vencendo = programValidity(new Date(now.getTime() - 25 * day).toISOString(), 4, now);
    expect(vencendo?.days).toBe(3);
    expect(validityIcon(vencendo)).toBe("CalendarClock");
    const longe = programValidity(now.toISOString(), 8, now);
    expect(validityIcon(longe)).toBeNull();
    expect(validityTone(longe)).toBe("neutral");
    expect(validityIcon(programValidity(now.toISOString(), undefined, now))).toBeNull();
  });
});

describe("recordText", () => {
  it("só inteiros positivos viram texto", () => {
    expect(recordText(0)).toBe("");
    expect(recordText(-1)).toBe("");
    expect(recordText(Number.NaN)).toBe("");
    expect(recordText(1.5)).toBe("");
    expect(recordText(Number.POSITIVE_INFINITY)).toBe("");
    expect(recordText(1)).toBe("1 recorde");
    expect(recordText(2)).toBe("2 recordes");
    expect(recordText(10)).toBe("10 recordes");
  });
});
