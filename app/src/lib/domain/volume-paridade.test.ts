import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseLog, Session, SetLog } from "./types";

/**
 * Rodada 3, trilha S (R3-6 B, aceite do adendo do estudo 2): o MESMO volume em todas as leituras — sessionVolume, a
 * soma da coluna do CSV, o relatório, o volume semanal da Evolução e o treino que chega ao painel do personal pelo link.
 * Dados fictícios.
 */

/** localStorage em memória (o /receber grava no repositório local de verdade). */
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const storage = new MemStorage();
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", globalThis);
vi.mock("@/lib/app-context", async () => {
  const { LocalRepository } = await import("@/lib/data/local");
  return { localRepo: new LocalRepository() };
});
vi.mock("@/lib/analytics", () => ({ track: () => {}, reportError: () => {} }));

const { sessionVolume, volumeDaSessao, weeklyVolume } = await import("./progression");
const { sessionsToCsv } = await import("./export-csv");
const { buildReport } = await import("./report");
const { buildTreinosPacket, parsePacket } = await import("./transfer");
const { packData, unpackData } = await import("../share-link");
const { importTreinos } = await import("../transfer-client");
const { localRepo } = await import("@/lib/app-context");

const NOW = new Date(2026, 10, 27, 15, 0);
const feita = (loadKg: number | null, reps: number): SetLog => ({ loadKg, reps, done: true });
const ex = (exerciseId: string, sets: SetLog[], unit?: ExerciseLog["unit"]): ExerciseLog => ({ uid: `${exerciseId}-u`, exerciseId, name: exerciseId, sets, ...(unit ? { unit } : {}) });

/** Supino 3×10×40 kg + prancha 3×60 s com 10 kg (unit "seg") + barra assistida 40 kg de ajuda × 8. */
function treinoDoAceite(volumeKg = 1200): Session {
  return {
    id: "t-aceite",
    userId: "a1",
    startedAt: new Date(2026, 10, 26, 18, 0).toISOString(),
    finishedAt: new Date(2026, 10, 26, 19, 0).toISOString(),
    exercises: [
      ex("supino_reto_barra", [feita(40, 10), feita(40, 10), feita(40, 10)]),
      ex("prancha", [feita(10, 60), feita(10, 60), feita(10, 60)], "seg"),
      ex("barra_fixa_assistida", [feita(40, 8), feita(40, 8), feita(40, 8)]),
    ],
    volumeKg,
    prs: [],
  };
}

/** Soma da coluna "Volume (kg)" do CSV (vírgula decimal, célula vazia = 0). */
function somaCsv(csv: string): number {
  const [head, ...rows] = csv.replace(/^﻿/, "").split("\r\n");
  const col = head!.split(";").indexOf("Volume (kg)");
  return rows.reduce((a, r) => a + (Number((r.split(";")[col] ?? "").replace(",", ".")) || 0), 0);
}

describe("paridade do volume (R3-6 B)", () => {
  beforeEach(() => storage.clear());

  it("aceite: 1.200 kg em sessionVolume, volumeDaSessao, CSV, relatório e volume semanal", () => {
    const s = treinoDoAceite();
    expect(sessionVolume(s)).toBe(1200);
    expect(volumeDaSessao(s)).toBe(1200);
    expect(somaCsv(sessionsToCsv([s]))).toBe(1200);
    expect(buildReport({ profile: { name: "Aluno Teste" }, sessions: [s], metrics: [], days: 30, now: NOW }).volumeKg).toBe(1200);
    expect(weeklyVolume([s], 1, NOW)[0]!.volume).toBe(1200);
  });

  it("aceite: depois de buildTreinosPacket → link → importTreinos, o painel do personal guarda 1.200 kg", async () => {
    // O aparelho do aluno ainda tinha o cache da convenção antiga (assistida contada: 1.200 + 960).
    const enviado = treinoDoAceite(2160);
    const packet = buildTreinosPacket({ student: { id: "a1", name: "Aluno Teste", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-11-01T00:00:00Z" }, coachId: "c1", studentRef: "s1", sessions: [enviado] });
    const chegou = parsePacket(await unpackData(await packData(packet)));
    expect(chegou?.kind).toBe("treinos");
    if (chegou?.kind !== "treinos") return;
    await importTreinos(chegou, "s1", { coachId: "c1" });
    const [salvo] = await localRepo.listSessions("s1");
    expect(salvo!.volumeKg).toBe(1200);
    expect(volumeDaSessao(salvo!)).toBe(1200);
    // Importar o mesmo link de novo não muda nada (o volume recalculado é estável).
    const again = await importTreinos(chegou, "s1", { coachId: "c1" });
    expect(again).toMatchObject({ added: 0, updated: 0, same: 1 });
  });

  it("aceite: sessão gravada com volumeKg antigo mostra o valor da função no relatório e na Evolução", () => {
    const antiga = treinoDoAceite(2160);
    expect(buildReport({ profile: { name: "Aluno Teste" }, sessions: [antiga], metrics: [], days: 30, now: NOW }).volumeKg).toBe(1200);
    expect(weeklyVolume([antiga], 1, NOW)[0]!.volume).toBe(1200);
  });

  it("aceite: QA-03 continua 1.230; unilateral 20 × 10 = 200 (sem dobrar)", () => {
    const qa03 = { exercises: [ex("supino_reto", [feita(55, 9), feita(57.5, 10)], "reps"), ex("rosca_direta", [feita(20, 8)], "reps")] };
    expect(volumeDaSessao(qa03)).toBe(1230);
    expect(sessionVolume(qa03)).toBe(1230);
    const serrote = { exercises: [ex("remada_unilateral_halter", [feita(20, 10)])] };
    expect(volumeDaSessao(serrote)).toBe(200);
    expect(somaCsv(sessionsToCsv([{ ...treinoDoAceite(), exercises: serrote.exercises }]))).toBe(200);
  });

  it("negativo: exercício próprio sem unit conta como reps; série não concluída não gera linha nem volume", () => {
    const proprio = { ...treinoDoAceite(), exercises: [ex("custom_meu", [feita(15, 10), { loadKg: 15, reps: 10, done: false }])] };
    expect(volumeDaSessao(proprio)).toBe(150);
    const csv = sessionsToCsv([proprio]);
    expect(csv.replace(/^﻿/, "").split("\r\n")).toHaveLength(2);
    expect(somaCsv(csv)).toBe(150);
  });

  it("prancha sem unit gravada: a unidade do exercício vale (tela, CSV e volume iguais)", () => {
    const s = { ...treinoDoAceite(), exercises: [ex("prancha", [feita(10, 60)])] };
    expect(sessionVolume(s)).toBe(0);
    expect(somaCsv(sessionsToCsv([s]))).toBe(0);
  });
});

describe("leitores da tela não leem o volumeKg gravado (R3-6 B item 2)", () => {
  const root = path.resolve(__dirname, "../..");
  /** Código sem comentários: o que importa é a leitura, não a explicação. */
  const code = (file: string) =>
    readFileSync(path.join(root, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it.each(["components/views/history-view.tsx", "app/(painel)/sessao/page.tsx", "app/(painel)/alunos/[id]/page.tsx"])("%s: nenhum `.volumeKg`", (file) => {
    expect(code(file)).not.toMatch(/\.volumeKg\b/);
  });

  it("report.ts e weeklyVolume somam por volumeDaSessao", () => {
    expect(code("lib/domain/report.ts")).not.toMatch(/\bs\.volumeKg\b/);
    const progression = code("lib/domain/progression.ts");
    const weekly = progression.slice(progression.indexOf("export function weeklyVolume"), progression.indexOf("export function setsPerGroup"));
    expect(weekly).toContain("volumeDaSessao(s)");
    expect(weekly).not.toMatch(/\.volumeKg\b/);
  });
});
