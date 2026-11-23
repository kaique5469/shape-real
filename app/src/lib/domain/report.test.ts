import { describe, expect, it } from "vitest";
import { buildReport, fmtDuration, nameList, reportToText, strengthChange, strengthNotes } from "./report";
import type { BodyMetric, ExerciseLog, Session } from "./types";

const NOW = new Date(2026, 10, 20, 15, 0); // 20/11/2026, horário local
const at = (daysAgo: number, hour = 18) => new Date(2026, 10, 20 - daysAgo, hour, 0);

let n = 0;
function log(exerciseId: string, name: string, loadKg: number, reps: number, sets = 3): ExerciseLog {
  return { uid: `l${n++}`, exerciseId, name, sets: Array.from({ length: sets }, () => ({ loadKg, reps, done: true })) };
}
function session(daysAgo: number, exercises: ExerciseLog[], extra: Partial<Session> = {}): Session {
  const start = at(daysAgo);
  return { id: `s${n++}`, userId: "u1", startedAt: start.toISOString(), finishedAt: new Date(start.getTime() + 50 * 60000).toISOString(), exercises, volumeKg: 0, prs: [], ...extra };
}
const metric = (date: string, m: Partial<BodyMetric>): BodyMetric => ({ id: `m${n++}`, userId: "u1", date, ...m });

describe("relatório de evolução", () => {
  const sessions = [
    session(45, [log("agachamento_livre", "Agachamento livre", 50, 10)]),
    session(40, [log("agachamento_livre", "Agachamento livre", 55, 10), log("supino_reto_barra", "Supino reto com barra", 40, 10)]),
    session(25, [log("agachamento_livre", "Agachamento livre", 60, 10), log("supino_reto_barra", "Supino reto com barra", 40, 10)]),
    session(18, [log("agachamento_livre", "Agachamento livre", 65, 8), log("prancha", "Prancha", 0, 40)]),
    session(10, [log("agachamento_livre", "Agachamento livre", 70, 8), log("supino_reto_barra", "Supino reto com barra", 40, 9)], { prs: ["agachamento_livre"] }),
    session(2, [log("rosca_direta_barra", "Rosca direta com barra", 20, 10)]),
  ];
  const metrics = [metric("2026-10-15", { weightKg: 64, waistCm: 76 }), metric("2026-11-18", { weightKg: 62.5, waistCm: 74, armCm: 30 })];
  const r = buildReport({ profile: { name: "Juliana Prado", daysPerWeek: 3 }, sessions, metrics, days: 30, now: NOW });

  it("conta só os treinos do período e compara com o combinado", () => {
    expect(r.from).toBe("2026-10-22");
    expect(r.to).toBe("2026-11-20");
    expect(r.sessions).toBe(4);
    expect(r.planned).toBe(13);
    expect(r.adherencePct).toBe(31);
    expect(r.weeks.reduce((a, w) => a + w.sessions, 0)).toBe(4);
    expect(r.minutes).toBe(200);
    expect(r.previousSessions).toBe(2);
  });

  it("cartão de presença: semanas inteiras, dias fora do período marcados à parte", () => {
    expect(r.calendar.every((w) => w.days.length === 7)).toBe(true);
    const flat = r.calendar.flatMap((w) => w.days);
    expect(flat.filter((d) => d.state === "treinou").map((d) => d.date)).toEqual(["2026-10-26", "2026-11-02", "2026-11-10", "2026-11-18"]);
    expect(flat.filter((d) => d.state !== "fora")).toHaveLength(30);
    expect(flat[0]!.date).toBe("2026-10-19"); // segunda-feira da semana em que o período começa
  });

  it("carga: parte do último treino antes do período e mostra a melhor série depois", () => {
    const squat = r.strength.find((s) => s.exerciseId === "agachamento_livre")!;
    expect(squat.from).toEqual({ loadKg: 55, reps: 10 });
    expect(squat.to).toEqual({ loadKg: 70, reps: 8 });
    expect(squat.deltaPct).toBeGreaterThan(15);
    expect(squat.compact).toBeNull();
    expect(r.strength[0]!.exerciseId).toBe("agachamento_livre");
  });

  it("datas da base e da melhor marca (dias locais)", () => {
    const squat = r.strength.find((s) => s.exerciseId === "agachamento_livre")!;
    expect(squat.fromDate).toBe("2026-10-11");
    expect(squat.toDate).toBe("2026-11-10");
    expect(squat.sessions).toBe(3);
  });

  it("exercício que não melhorou fica fora da lista e entra na conta dos que não melhoraram", () => {
    expect(r.strength.some((s) => s.exerciseId === "supino_reto_barra")).toBe(false);
    expect(r.steady).toBe(1);
  });

  it("exercício feito uma única vez, sem histórico, não vira evolução; isometria não entra", () => {
    expect(r.strength.some((s) => s.exerciseId === "rosca_direta_barra")).toBe(false);
    expect(r.strength.some((s) => s.exerciseId === "prancha")).toBe(false);
  });

  it("medidas: precisa de dois registros; o ponto de partida pode ser de antes do período", () => {
    expect(r.body.map((b) => b.key)).toEqual(["weightKg", "waistCm"]);
    expect(r.body[0]).toMatchObject({ from: 64, to: 62.5, delta: -1.5 });
  });

  it("texto do WhatsApp tem frequência, cargas, recordes, medidas, recado e assinatura", () => {
    const t = reportToText(r, { coachName: "Rafael Nunes", message: "Ótimo mês. Vamos manter os 3 treinos." });
    expect(t).toContain("*Relatório de evolução — Juliana Prado*");
    expect(t).toContain("22/10 a 20/11/2026 (30 dias)");
    expect(t).toContain("4 de 13 treinos combinados (31%)");
    expect(t).toContain("*Exercícios que melhoraram*");
    expect(t).not.toContain("Cargas que subiram");
    expect(t).toContain("• Agachamento livre: 55 kg × 10 → 70 kg × 8 (+");
    expect(t).toContain("*1 recorde pessoal:* Agachamento livre");
    expect(t).toContain("• Peso: 64 → 62,5 kg (−1,5 kg)");
    expect(t).toContain("Ótimo mês. Vamos manter os 3 treinos.");
    expect(t.trim().endsWith("— Rafael Nunes")).toBe(true);
    expect(t).not.toMatch(/undefined|NaN|null/);
  });

  it("frases de destaque saem prontas e sem número quebrado", () => {
    expect(r.highlights[0]).toBe("4 treinos em 30 dias, de 13 combinados (31% de frequência).");
    expect(r.highlights.some((h) => h.startsWith("Maior evolução: Agachamento livre"))).toBe(true);
    expect(r.highlights.some((h) => h.includes("2 treinos a mais que nos 30 dias anteriores"))).toBe(true);
    for (const h of r.highlights) expect(h).not.toMatch(/undefined|NaN/);
  });

  it("sem treino nem medida no período: relatório vazio, sem erro", () => {
    const empty = buildReport({ profile: { name: "Novo Aluno" }, sessions: [], metrics: [], days: 30, now: NOW });
    expect(empty.hasData).toBe(false);
    expect(empty.planned).toBeNull();
    expect(empty.highlights).toEqual([]);
    expect(reportToText(empty)).toContain("Nenhum treino registrado no período.");
  });

  it("quem começou agora: compara o primeiro treino com o melhor seguinte", () => {
    const fresh = buildReport({
      profile: { name: "Bia", daysPerWeek: 2 },
      sessions: [session(12, [log("leg_press_45", "Leg press 45°", 80, 12)]), session(5, [log("leg_press_45", "Leg press 45°", 100, 12)])],
      metrics: [],
      days: 30,
      now: NOW,
    });
    expect(fresh.strength[0]).toMatchObject({ from: { loadKg: 80, reps: 12 }, to: { loadKg: 100, reps: 12 }, deltaPct: 25 });
  });

  it("aluno novo: o período começa no primeiro treino, sem contar semanas anteriores como falta", () => {
    const fresh = buildReport({
      profile: { name: "Bia", daysPerWeek: 3 },
      sessions: [session(13, [log("leg_press_45", "Leg press 45°", 80, 12)]), session(11, []), session(6, []), session(4, []), session(1, [])],
      metrics: [],
      days: 90,
      now: NOW,
    });
    expect(fresh.from).toBe("2026-11-07");
    expect(fresh.days).toBe(14);
    expect(fresh.planned).toBe(6);
    expect(fresh.adherencePct).toBe(83);
    expect(fresh.calendar.flatMap((w) => w.days).filter((d) => d.state !== "fora")).toHaveLength(14);
    expect(fresh.highlights[0]).toBe("5 treinos em 14 dias, de 6 combinados (83% de frequência).");
  });

  it("lista longa de recordes é resumida", () => {
    expect(nameList(["A", "B"])).toBe("A, B");
    expect(nameList(["A", "B", "C", "D", "E", "F", "G"])).toBe("A, B, C, D, E e mais 2");
  });

  it("duração legível", () => {
    expect(fmtDuration(45)).toBe("45 min");
    expect(fmtDuration(60)).toBe("1 h");
    expect(fmtDuration(580)).toBe("9 h 40 min");
  });
});

describe("relatório: exercícios que melhoraram (U6 R-16)", () => {
  const build = (sessions: Session[]) => buildReport({ profile: { name: "Beatriz Lima", daysPerWeek: 3 }, sessions, metrics: [], days: 30, now: NOW });
  const ids = (rep: ReturnType<typeof build>) => rep.strength.map((s) => s.exerciseId);

  it("graviton fica fora (mais ajuda não é carga que subiu)", () => {
    const rep = build([
      session(20, [log("barra_fixa_assistida", "Barra fixa assistida (graviton/gravitron)", 40, 8)]),
      session(10, [log("barra_fixa_assistida", "Barra fixa assistida (graviton/gravitron)", 50, 10)]),
      session(5, [log("barra_fixa_assistida", "Barra fixa assistida (graviton/gravitron)", 35, 8)]),
    ]);
    expect(rep.strength).toEqual([]);
    expect(rep.steady).toBe(0);
    expect(rep.highlights.some((h) => h.includes("graviton"))).toBe(false);
  });

  it("barra fixa com carga extra, elástico com carga e tempo com carga ficam fora", () => {
    const rep = build([
      session(20, [log("barra_fixa", "Barra fixa", 5, 6), log("farmer_walk", "Farmer walk", 20, 40)]),
      session(5, [log("barra_fixa", "Barra fixa", 10, 5), log("farmer_walk", "Farmer walk", 24, 40)]),
    ]);
    expect(rep.strength).toEqual([]);
    expect(rep.steady).toBe(0);
  });

  it("200 kg digitado num exercício de 20 kg fica fora: sem +899% e fora dos destaques", () => {
    const smith = (daysAgo: number, kg: number, reps = 10) => session(daysAgo, [log("agachamento_smith", "Agachamento no Smith", kg, reps, 2)]);
    const rep = build([smith(21, 20), smith(14, 20, 11), smith(8, 200)]);
    const row = rep.strength.find((s) => s.exerciseId === "agachamento_smith")!;
    expect(row.to).toEqual({ loadKg: 20, reps: 11 });
    expect(row.deltaPct).toBeLessThan(10);
    const text = reportToText(rep);
    expect(text).not.toContain("899");
    expect(text).not.toContain("200 kg");
    expect(rep.highlights.join(" ")).not.toContain("200 kg");
    expect(rep.highlights.join(" ")).not.toContain("899");
  });

  it("marca suspeita antes do período não vira base", () => {
    const smith = (daysAgo: number, kg: number) => session(daysAgo, [log("agachamento_smith", "Agachamento no Smith", kg, 10, 2)]);
    const rep = build([smith(50, 20), smith(40, 200), smith(10, 22.5)]);
    expect(rep.strength[0]).toMatchObject({ from: { loadKg: 20, reps: 10 }, to: { loadKg: 22.5, reps: 10 }, fromDate: "2026-10-01" });
  });

  it("exercício que caiu conta em steady, e a tela diz \"não melhorou\", nunca \"mantiveram\"", () => {
    const rep = build([
      session(29, [log("supino_inclinado_barra", "Supino inclinado com barra", 40, 8), log("agachamento_livre", "Agachamento livre", 60, 8)]),
      session(10, [log("supino_inclinado_barra", "Supino inclinado com barra", 35, 8), log("agachamento_livre", "Agachamento livre", 65, 8)]),
      session(1, [log("supino_inclinado_barra", "Supino inclinado com barra", 32.5, 8)]),
    ]);
    expect(ids(rep)).toEqual(["agachamento_livre"]);
    expect(rep.steady).toBe(1);
    const notes = strengthNotes(rep);
    expect(notes).toContain("Outro exercício não melhorou no período.");
    expect(notes.join(" ")).not.toMatch(/mantiv/);
  });

  it("3 × 12 → 3 × 17 com a mesma carga: melhorou, sem % e com \"+5 reps\"", () => {
    const glute = (daysAgo: number, reps: number) => session(daysAgo, [log("gluteo_4_apoios_caneleira", "Glúteo 4 apoios com caneleira (coice)", 3, reps)]);
    const rep = build([glute(40, 12), glute(10, 15), glute(3, 17)]);
    expect(rep.strength).toEqual([
      {
        exerciseId: "gluteo_4_apoios_caneleira",
        name: "Glúteo 4 apoios com caneleira (coice)",
        from: { loadKg: 3, reps: 12 },
        to: { loadKg: 3, reps: 17 },
        fromDate: "2026-10-11",
        toDate: "2026-11-17",
        deltaPct: null,
        compact: "+5 reps",
        sessions: 2,
      },
    ]);
    expect(strengthChange(rep.strength[0]!)).toBe("+5 reps");
    const text = reportToText(rep);
    expect(text).toContain("• Glúteo 4 apoios com caneleira (coice): 3 kg × 12 → 3 kg × 17 (+5 reps)");
    expect(rep.highlights).toContain("Maior evolução: Glúteo 4 apoios com caneleira (coice), de 3 kg × 12 para 3 kg × 17 (+5 reps).");
  });

  it("sem % e com mais carga: \"+5 kg\"", () => {
    const row = (daysAgo: number, kg: number, reps: number) => session(daysAgo, [log("remada_curvada_barra", "Remada curvada com barra", kg, reps)]);
    const rep = build([row(20, 20, 15), row(5, 25, 20)]);
    expect(rep.strength[0]).toMatchObject({ deltaPct: null, compact: "+5 kg" });
  });

  it("Melhor é a melhor marca do período, com a data dela, não a mais recente", () => {
    const squat = (daysAgo: number, kg: number) => session(daysAgo, [log("agachamento_livre", "Agachamento livre", kg, 8)]);
    const rep = build([squat(40, 60), squat(12, 70), squat(2, 65)]);
    expect(rep.strength[0]).toMatchObject({ from: { loadKg: 60, reps: 8 }, to: { loadKg: 70, reps: 8 }, toDate: "2026-11-08" });
    expect(strengthChange(rep.strength[0]!)).toBe(`+${rep.strength[0]!.deltaPct}%`);
  });

  it("10 exercícios melhorando → 8 linhas, da maior variação para a menor, e mais 2", () => {
    const names = ["supino_reto_barra", "agachamento_livre", "stiff", "rosca_direta_barra", "remada_maquina", "agachamento_smith", "supino_inclinado_barra", "leg_press_45", "puxada_frente", "desenvolvimento_halter"];
    const before = session(40, names.map((id) => log(id, id, 50, 8)));
    const after = session(5, names.map((id, i) => log(id, id, 52 + i * 2, 8)));
    const rep = build([before, after]);
    expect(rep.strength).toHaveLength(8);
    expect(rep.moreImproved).toBe(2);
    expect(rep.strength[0]!.exerciseId).toBe("desenvolvimento_halter");
    expect(rep.strength.map((s) => s.deltaPct)).toEqual([...rep.strength.map((s) => s.deltaPct)].sort((a, b) => b! - a!));
    expect(strengthNotes(rep)).toContain("Mais 2 exercícios melhoraram.");
  });

  it("notas: plural, singular e sem nenhuma linha", () => {
    const row = { exerciseId: "x", name: "X", from: { loadKg: 10, reps: 8 }, to: { loadKg: 12, reps: 8 }, fromDate: "2026-11-01", toDate: "2026-11-10", deltaPct: 20, compact: null, sessions: 2 };
    expect(strengthNotes({ strength: [], steady: 3, moreImproved: 0 })).toEqual(["Nenhum exercício com carga melhorou no período."]);
    const notes = strengthNotes({ strength: [row], steady: 3, moreImproved: 1 });
    expect(notes[0]).toMatch(/^Melhor: a melhor série de cada exercício no período\./);
    expect(notes).toContain("Mais 1 exercício melhorou.");
    expect(notes).toContain("Outros 3 exercícios não melhoraram no período.");
    expect(strengthNotes({ strength: [row], steady: 0, moreImproved: 0 })).toHaveLength(1);
  });

  it("% que arredonda para 0 não vira \"+0%\": mostra a carga", () => {
    const sq = (daysAgo: number, kg: number) => session(daysAgo, [log("agachamento_livre", "Agachamento livre", kg, 10)]);
    const rep = build([sq(40, 100), sq(5, 100.2)]);
    expect(rep.strength[0]).toMatchObject({ deltaPct: 0, compact: "+0,2 kg" });
    expect(strengthChange(rep.strength[0]!)).toBe("+0,2 kg");
  });
});
