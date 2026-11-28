import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, reportBase, reportGoal, reportGoalNote, reportLabels, reportSessionsValue, reportToText, strengthNotes } from "./report";
import { weeklyGoal } from "./attention";
import type { ExerciseLog, Session, SetLog } from "./types";

/**
 * Rodada 3, trilha S, no relatório: "recebidos" no modo local do personal (R3-15), parciais e minutos ativos (R3-4),
 * volume pela convenção única (R3-6 B), meta com uma regra só (R3-16) e as caronas E2-relatorio-sem-base e
 * E2-meta-snapshot. Dados fictícios.
 */
const NOW = new Date(2026, 10, 27, 15, 0);
const at = (daysAgo: number) => new Date(2026, 10, 27 - daysAgo, 18, 0).toISOString();
let n = 0;
const feita = (loadKg: number | null, reps: number): SetLog => ({ loadKg, reps, done: true });
const ex = (exerciseId: string, sets: SetLog[], extra: Partial<ExerciseLog> = {}): ExerciseLog => ({ uid: `l${n++}`, exerciseId, name: exerciseId, sets, ...extra });
const treino = (daysAgo: number, exercises: ExerciseLog[], extra: Partial<Session> = {}): Session => ({
  id: `s${n++}`,
  userId: "u",
  startedAt: at(daysAgo),
  finishedAt: new Date(Date.parse(at(daysAgo)) + 50 * 60_000).toISOString(),
  exercises,
  volumeKg: 0,
  prs: [],
  ...extra,
});
const supino = (sets = 3) => ex("supino_reto_barra", Array.from({ length: sets }, () => feita(40, 10)));
const profile = { name: "Juliana Prado", daysPerWeek: 3 };
/** Treino antigo, fora do período e do anterior: o período fica com os 30 dias (quem começou agora é medido desde o 1º treino). */
const ancora = () => treino(70, [supino()]);

describe("R3-15: o relatório do personal no modo local fala em treinos recebidos", () => {
  const sessions = [ancora(), treino(20, [supino()]), treino(10, [supino()]), treino(3, [supino()])];
  const recebidos = buildReport({ profile, sessions, metrics: [], days: 30, base: "recebidos", now: NOW });
  const feitos = buildReport({ profile, sessions, metrics: [], days: 30, now: NOW });

  it("reportBase: só o personal no modo local recebe; aluno e nuvem registram", () => {
    expect(reportBase({ byCoach: true, mode: "local" })).toBe("recebidos");
    expect(reportBase({ byCoach: true, mode: "supabase" })).toBe("registrados");
    expect(reportBase({ byCoach: false, mode: "local" })).toBe("registrados");
    expect(reportBase({ byCoach: false, mode: "supabase" })).toBe("registrados");
  });

  it("aceite: rótulos da folha sem 'Treinos feitos'; a frequência diz 'recebidos'", () => {
    expect(reportLabels(recebidos)).toEqual({ treinos: "Treinos recebidos", frequencia: "Frequência pelos treinos recebidos" });
    expect(Object.values(reportLabels(recebidos)).join(" ")).not.toContain("Treinos feitos");
  });

  it("aceite: o texto do WhatsApp diz 'recebidos' e a frase de destaque também", () => {
    const t = reportToText(recebidos, { coachName: "Rafael Nunes" });
    expect(t).toContain("*Frequência pelos treinos recebidos*");
    expect(t).toContain("3 de 13 treinos combinados recebidos (23%)");
    expect(t).not.toContain("Treinos feitos");
    expect(recebidos.highlights[0]).toBe("3 treinos recebidos em 30 dias, de 13 combinados (23% de frequência).");
  });

  it("nada recebido no período: 'Nenhum treino recebido', nunca 'registrado' (não é falta)", () => {
    const vazio = buildReport({ profile, sessions: [], metrics: [], days: 30, base: "recebidos", now: NOW });
    expect(reportToText(vazio)).toContain("Nenhum treino recebido no período.");
  });

  it("negativo: o relatório do aluno e o da nuvem não mudam (contas iguais, só o texto)", () => {
    expect(reportLabels(feitos)).toEqual({ treinos: "Treinos feitos", frequencia: "Frequência" });
    expect(reportToText(feitos, { self: true })).toContain("*Frequência*\n3 de 13 treinos combinados (23%)");
    expect(feitos.highlights[0]).toBe("3 treinos em 30 dias, de 13 combinados (23% de frequência).");
    expect({ ...recebidos, base: "registrados", highlights: [] }).toEqual({ ...feitos, highlights: [] });
  });

  it("comparação com o período anterior também fala em recebidos", () => {
    const r = buildReport({ profile, sessions: [treino(45, [supino()]), ...sessions], metrics: [], days: 30, base: "recebidos", now: NOW });
    expect(r.highlights).toContain("2 treinos recebidos a mais que nos 30 dias anteriores.");
  });
});

describe("R3-4 no relatório: parciais e minutos ativos", () => {
  const parcial = (daysAgo: number) => treino(daysAgo, [ex("supino_reto_barra", [feita(40, 10)])], { plannedSets: 24 });
  const completo = (daysAgo: number) => treino(daysAgo, [supino(24)], { plannedSets: 24 });

  it("aceite: 'N treinos (M parciais)' na frase, no texto e no resumo da folha", () => {
    const r = buildReport({ profile, sessions: [ancora(), completo(3), parcial(2), parcial(1)], metrics: [], days: 30, now: NOW });
    expect(r.partial).toBe(2);
    expect(r.highlights[0]).toBe("3 treinos (2 parciais) em 30 dias, de 13 combinados (23% de frequência).");
    expect(reportToText(r)).toContain("3 de 13 treinos combinados (23%) · 2 parciais");
    expect(reportSessionsValue(r)).toBe("3 (2 parciais) de 13 combinados");
  });

  it("23 de 24 não é parcial; sessão sem plannedSets nunca é", () => {
    const quase = treino(2, [supino(23)], { plannedSets: 24 });
    const antiga = treino(1, [ex("supino_reto_barra", [feita(40, 10)])]);
    const r = buildReport({ profile, sessions: [ancora(), quase, antiga], metrics: [], days: 30, now: NOW });
    expect(r.partial).toBe(0);
    expect(r.highlights[0]).not.toMatch(/parcia/);
    expect(reportSessionsValue(r)).toBe("2 de 13 combinados");
  });

  it("um treino parcial só: '1 treino (parcial)'", () => {
    const r = buildReport({ profile: { name: "X" }, sessions: [ancora(), parcial(1)], metrics: [], days: 30, now: NOW });
    expect(r.highlights[0]).toBe("1 treino (parcial) em 30 dias.");
    expect(reportSessionsValue(r)).toBe("1 (1 parcial)");
  });

  it("minutos pela regra única: ativos; antiga até 180 min; acima, sem minutos, mas o treino conta", () => {
    const ativo = treino(3, [supino()], { activeMin: 35, finishedAt: new Date(Date.parse(at(3)) + 9 * 3_600_000).toISOString() });
    const antiga = treino(2, [supino()]);
    const dias = treino(1, [supino()], { finishedAt: new Date(Date.parse(at(1)) + 200 * 60_000).toISOString() });
    const r = buildReport({ profile, sessions: [ativo, antiga, dias], metrics: [], days: 30, now: NOW });
    expect(r.minutes).toBe(35 + 50);
    expect(r.sessions).toBe(3);
    expect(r.sets).toBe(9);
  });
});

describe("R3-6 B no relatório: volume pela convenção única", () => {
  it("aceite: sessão gravada com volumeKg antigo (assistida contada) entra pelo valor da função", () => {
    const antiga = treino(2, [supino(), ex("barra_fixa_assistida", [feita(40, 8)]), ex("prancha", [feita(10, 60)])], { volumeKg: 2120 });
    expect(buildReport({ profile, sessions: [antiga], metrics: [], days: 30, now: NOW }).volumeKg).toBe(1200);
  });
});

describe("R3-16: meta da semana com uma regra só", () => {
  const ficha = (daysPerWeek: number, active = true) => ({ active, daysPerWeek });

  it("aceite: ficha 4 + perfil 3 → 4 (a mesma conta de /alunos, Hoje e página do aluno)", () => {
    expect(reportGoal([ficha(4)], { daysPerWeek: 3 })).toBe(4);
    expect(reportGoal([ficha(4)], { daysPerWeek: 3 })).toBe(weeklyGoal(4, 3));
  });

  it("aceite: perfil vazio + ficha 4 → 4", () => {
    expect(reportGoal([ficha(4)], {})).toBe(4);
  });

  it("negativo: sem ficha ativa e perfil 3 → 3; sem nenhum dos dois → nenhuma meta", () => {
    expect(reportGoal([ficha(5, false)], { daysPerWeek: 3 })).toBe(3);
    expect(reportGoal([], { daysPerWeek: 3 })).toBe(3);
    expect(reportGoal([], {})).toBeUndefined();
    expect(reportGoal([ficha(5, false)], {})).toBeUndefined();
  });

  it("o relatório usa a meta que recebe: ficha 4 → 17 combinados em 30 dias (não 13 do perfil)", () => {
    const r = buildReport({ profile, sessions: [ancora(), treino(2, [supino()])], metrics: [], days: 30, daysPerWeek: reportGoal([ficha(4)], profile), now: NOW });
    expect(r.perWeek).toBe(4);
    expect(r.planned).toBe(17);
  });
});

describe("R3-16: as telas do personal chamam a regra única", () => {
  const src = (f: string) => readFileSync(path.resolve(__dirname, "../..", f), "utf8");
  it("página do aluno: a meta vem de weeklyGoal(ficha ativa, cadastro), não só do cadastro", () => {
    const pagina = src("app/(painel)/alunos/[id]/page.tsx");
    expect(pagina).toMatch(/const target = weeklyGoal\(active\?\.daysPerWeek, student\.daysPerWeek\) \?\? 0;/);
    expect(pagina).not.toMatch(/const target = student\.daysPerWeek/);
  });
  it("relatório: perWeek por reportGoal (mesma regra), não o cadastro antes da ficha", () => {
    const view = src("components/views/report-view.tsx");
    expect(view).toContain("perWeek: reportGoal(programs, subject)");
    expect(view).not.toMatch(/subject\.daysPerWeek \?\? programs/);
  });
});

describe("caronas do 'Depois' no relatório", () => {
  it("E2-relatorio-sem-base: sem exercício comparável, a nota não diz que nada melhorou", () => {
    const r = buildReport({ profile, sessions: [treino(1, [supino()])], metrics: [], days: 30, now: NOW });
    expect(r.steady).toBe(0);
    expect(strengthNotes(r)).toEqual(["Nenhum exercício com carga tem dois registros no período para comparar."]);
  });

  it("E2-relatorio-sem-base, negativo: com exercício que não melhorou, a frase de sempre", () => {
    expect(strengthNotes({ strength: [], steady: 2, moreImproved: 0 })).toEqual(["Nenhum exercício com carga melhorou no período."]);
  });

  it("E2-meta-snapshot: o 'combinados' diz que é pela frequência atual; sem meta, nada", () => {
    const r = buildReport({ profile, sessions: [treino(1, [supino()])], metrics: [], days: 30, now: NOW });
    expect(reportGoalNote(r)).toBe("Combinados pela frequência atual: 3 treinos por semana.");
    expect(reportToText(r)).toContain("Combinados pela frequência atual: 3 treinos por semana.");
    const sem = buildReport({ profile: { name: "X" }, sessions: [treino(1, [supino()])], metrics: [], days: 30, now: NOW });
    expect(reportGoalNote(sem)).toBeNull();
    expect(reportGoalNote({ perWeek: 1, planned: 4 })).toBe("Combinados pela frequência atual: 1 treino por semana.");
  });
});
