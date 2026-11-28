import { describe, expect, it } from "vitest";
import { cell, programToCsv, programsToCsv, SESSIONS_HEAD, sessionsToCsv } from "./export-csv";
import type { ExerciseLog, Program, Session, SetLog } from "./types";

/** Rodada 3, trilha S: CSV que não executa fórmula (R3-14) e volume com unidade (R3-6 B.3). Dados fictícios. */
const linhas = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");
const feita = (loadKg: number | null, reps: number): SetLog => ({ loadKg, reps, done: true });
const ex = (exerciseId: string, name: string, sets: SetLog[], unit?: ExerciseLog["unit"]): ExerciseLog => ({ uid: `${exerciseId}-${name}`, exerciseId, name, sets, ...(unit ? { unit } : {}) });
const sessao = (exercises: ExerciseLog[], extra: Partial<Session> = {}): Session => ({ id: "s", userId: "u", dayKey: "A", startedAt: "2026-11-20T13:00:00Z", finishedAt: "2026-11-20T14:00:00Z", exercises, volumeKg: 0, prs: [], ...extra });

describe("cell: texto que a planilha leria como fórmula (R3-14)", () => {
  it("aceite: =, +, @, TAB e - ganham apóstrofo; com ';' também vão entre aspas", () => {
    expect(cell("=1+1")).toBe("'=1+1");
    expect(cell("+1")).toBe("'+1");
    expect(cell("@SOMA(1;2)")).toBe(`"'@SOMA(1;2)"`);
    expect(cell("\t=1+1")).toBe("'\t=1+1");
    expect(cell("-2+3")).toBe("'-2+3");
    expect(cell("  =HIPERLINK(\"x\")")).toBe(`"'  =HIPERLINK(""x"")"`);
    expect(cell("\rabc")).toBe(`"'\rabc"`);
    expect(cell("\tabc")).toBe("'\tabc");
  });

  it("aceite: números nunca (carga 102,5 e -5 continuam números)", () => {
    expect(cell(102.5)).toBe("102,5");
    expect(cell(-5)).toBe("-5");
    expect(cell(0)).toBe("0");
  });

  it("negativo: hífen no meio e texto comum não mudam; vazio continua vazio", () => {
    expect(cell("Supino - pegada")).toBe("Supino - pegada");
    expect(cell("Supino reto")).toBe("Supino reto");
    expect(cell("A — Peito")).toBe("A — Peito");
    expect(cell(null)).toBe("");
    expect(cell(undefined)).toBe("");
    expect(cell("")).toBe("");
  });

  it("vale nas três planilhas (mesma função): treinos com nome e dia maliciosos", () => {
    const csv = sessionsToCsv([sessao([ex("custom_x", "=1+1", [feita(10, 5)]), ex("custom_y", "@SOMA(1;2)", [feita(10, 5)])], { dayKey: undefined, dayTitle: "+1" })]);
    const [, a, b] = linhas(csv);
    expect(a).toContain(";'+1;'=1+1;1;");
    expect(b).toContain(`;"'@SOMA(1;2)";1;`);
  });

  it("ficha: nome de exercício próprio e observação vindos do personal", () => {
    const program: Program = {
      id: "p1",
      ownerId: "s1",
      createdBy: "c1",
      name: "=Ficha",
      system: "livre",
      goal: "hipertrofia",
      level: "iniciante",
      daysPerWeek: 2,
      active: true,
      source: "personal",
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
      days: [{ key: "A", title: "Peito", focus: [], exercises: [{ uid: "e1", exerciseId: "custom_x", name: "@SOMA(1;2)", sets: 3, repsMin: 8, repsMax: 12, restSec: 60, technique: "normal", notes: "-2+3" }] }],
    };
    for (const csv of [programToCsv(program), programsToCsv([program])]) {
      const row = linhas(csv)[1]!;
      expect(row.startsWith("'=Ficha;")).toBe(true);
      expect(row).toContain(`;"'@SOMA(1;2)";`);
      expect(row.endsWith(";'-2+3")).toBe(true);
    }
  });
});

describe("sessionsToCsv: unidade e volume (R3-6 B)", () => {
  it("cabeçalho: 'Reps ou tempo' e a coluna 'Unidade' logo depois", () => {
    expect(linhas(sessionsToCsv([]))[0]).toBe(SESSIONS_HEAD.join(";"));
    expect(SESSIONS_HEAD).toEqual(["Data", "Treino", "Exercício", "Série", "Carga (kg)", "Reps ou tempo", "Unidade", "RPE", "Volume (kg)"]);
  });

  it("aceite (fato do adendo): prancha 10 kg × 60 s com unit 'seg' não vira 600 kg; a unidade diz 's'", () => {
    const [, row] = linhas(sessionsToCsv([sessao([ex("prancha", "Prancha", [feita(10, 60)], "seg")])]));
    expect(row).toBe("20/11/2026;A;Prancha;1;10;60;s;;");
    expect(row).not.toContain("600");
  });

  it("prancha sem unit gravada: vale a unidade do exercício, como na tela", () => {
    const [, row] = linhas(sessionsToCsv([sessao([ex("prancha", "Prancha", [feita(10, 60)])])]));
    expect(row).toMatch(/;60;s;;$/);
  });

  it("assistida: volume vazio (a carga é ajuda); cardio em min; reps com carga × reps", () => {
    const csv = sessionsToCsv([sessao([ex("barra_fixa_assistida", "Graviton", [feita(40, 8)]), ex("esteira_custom", "Esteira", [feita(null, 20)], "min"), ex("supino_reto_barra", "Supino", [feita(42.5, 10)])])]);
    const [, g, e, s] = linhas(csv);
    expect(g).toBe("20/11/2026;A;Graviton;1;40;8;reps;;");
    expect(e).toBe("20/11/2026;A;Esteira;1;;20;min;;");
    expect(s).toBe("20/11/2026;A;Supino;1;42,5;10;reps;;425");
  });

  it("peso corporal sem carga: 0 de volume (é reps); RPE quando houver", () => {
    const [, row] = linhas(sessionsToCsv([sessao([ex("flexao", "Flexão", [{ loadKg: null, reps: 12, rpe: 8, done: true }])])]));
    expect(row).toBe("20/11/2026;A;Flexão;1;;12;reps;8;0");
  });

  it("negativo: série não concluída (ou sem reps) não gera linha", () => {
    const csv = sessionsToCsv([sessao([ex("supino_reto_barra", "Supino", [feita(40, 10), { loadKg: 40, reps: 10, done: false }, { loadKg: 40, reps: null, done: true }])])]);
    expect(linhas(csv)).toHaveLength(2);
  });
});
