import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_COACH_ID, TESTER_COACH_ID, completarExemplosTeste, jeitoDemonstracao, pedidoExemplo, respostasExemplo, seedDemo, seedTester, simulateSessions } from "./demo";
import { ehExemplo, type Anamnese } from "@/lib/domain/anamnese-types";
import { seloDoAluno } from "@/lib/domain/anamnese-perfil";
import { getExercise } from "@/lib/domain/exercises";
import { generateProgram, type GenerateInput } from "@/lib/domain/generator";
import { e1rmSeries, loadIncrement } from "@/lib/domain/progression";
import { alertas } from "@/lib/domain/triagem";
import type { Profile } from "@/lib/domain/types";

/** localStorage em memória (o modo local lê e grava nele). */
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
const { LocalRepository } = await import("./local");

const owner = { ownerId: "u", createdBy: "u" };
const abc: GenerateInput = { goal: "hipertrofia", level: "intermediario", daysPerWeek: 3, sessionMinutes: 60, equipment: "academia", system: "abc", seed: 42 };

describe("simulação da demonstração", () => {
  it("cargas e reps progridem ao longo das semanas", () => {
    const program = generateProgram(abc, owner);
    const sessions = simulateSessions("u", program, 8, 3, 42, 0.1);
    // O levantamento principal do dia de costas (a remada pesada, 4×6–8).
    const main = program.days[1]!.exercises.find((e) => e.repsMax <= 8)!;
    expect(getExercise(main.exerciseId)?.compound).toBe(true);
    const series = e1rmSeries(sessions, main.exerciseId);
    expect(series.length).toBeGreaterThan(3);
    expect(series[series.length - 1]!.value).toBeGreaterThan(series[0]!.value);
  });

  it("registra cargas que existem na academia e nunca carga em exercício sem peso", () => {
    // As fichas dos alunos de exemplo: emagrecimento com prioridade em glúteos, 5×5 e full body de iniciante.
    const samples: [GenerateInput, number][] = [
      [{ ...abc, goal: "emagrecimento", system: "abcd_inferiores", daysPerWeek: 4, emphasis: ["gluteos"], seed: 11 }, 0.55],
      [{ ...abc, goal: "forca", level: "avancado", system: "forca_5x5", seed: 23 }, 1.25],
      [{ ...abc, level: "iniciante", system: "fullbody", seed: 37 }, 0.55 * 0.7],
    ];
    for (const [input, factor] of samples) {
      const program = generateProgram(input, owner);
      const sessions = simulateSessions("u", program, 6, input.daysPerWeek, input.seed ?? 1, 0.1, factor);
      expect(sessions.length).toBeGreaterThan(8);
      for (const s of sessions) {
        expect(s.volumeKg).toBeGreaterThan(0);
        for (const log of s.exercises) {
          const ex = getExercise(log.exerciseId)!;
          for (const set of log.sets) {
            expect(set.reps).toBeGreaterThan(0);
            if (loadIncrement(ex.id, 20) === 0 || ex.unit === "min") expect(set.loadKg).toBeNull();
            else {
              expect(set.loadKg).toBeGreaterThan(0);
              // Caneleira de exemplo não passa de 10 kg; halter feminino de isolado não começa em 20 kg.
              if (ex.implement === "caneleira") expect(set.loadKg!).toBeLessThanOrEqual(10);
            }
          }
          if (ex.unit && ex.unit !== "reps") expect(log.unit).toBe(ex.unit);
        }
      }
      // A ficha fica com a carga atual de cada exercício com peso.
      const loaded = program.days.flatMap((d) => d.exercises).filter((p) => loadIncrement(p.exerciseId, 20) > 0 && getExercise(p.exerciseId)?.unit !== "min");
      expect(loaded.every((p) => (p.loadKg ?? 0) > 0)).toBe(true);
    }
  });
});

describe("questionário dos exemplos (respostas fictícias)", () => {
  const HOJE = new Date(2026, 10, 26, 15);
  const ctx = { hoje: HOJE, liberacoes: [] };
  const repo = new LocalRepository();
  beforeEach(() => storage.clear());

  it("Juliana: nenhum alerta vermelho nem laranja (PAR-Q 5 com termo é azul)", () => {
    const lista = alertas(respostasExemplo("juliana", HOJE), ctx);
    expect(lista.filter((a) => a.nivel === "vermelho" || a.nivel === "laranja")).toEqual([]);
    expect(lista.map((a) => a.id)).toContain("A-PARQ-SIM");
    expect(respostasExemplo("juliana", HOJE).termo?.nome).toBe("Juliana Prado");
  });
  it("Marcos: A-PRESSAO e A-PARQ-SIM, sem vermelho nem laranja e sem termo", () => {
    const an = respostasExemplo("marcos", HOJE);
    const ids = alertas(an, ctx).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["A-PRESSAO", "A-PARQ-SIM"]));
    expect(alertas(an, ctx).some((a) => a.nivel === "vermelho" || a.nivel === "laranja")).toBe(false);
    expect(an.termo).toBeUndefined();
  });
  it("Beatriz: pedido de 3 dias sem resposta (selo 'Questionário pendente'); Marcos com respostas novas; Juliana sem selo", () => {
    const base = { role: "athlete" as const, plan: "free" as const, onboarded: true, createdAt: HOJE.toISOString() };
    expect(seloDoAluno({ ...base, id: "demo-aluna-3", name: "Beatriz Lima", anamnesePedido: pedidoExemplo(HOJE) }, HOJE)).toEqual({ selo: "questionario_pendente", texto: "Questionário pendente · 3 dias" });
    expect(seloDoAluno({ ...base, id: "demo-aluno-2", name: "Marcos Antunes", anamnese: respostasExemplo("marcos", HOJE) }, HOJE)?.selo).toBe("respostas_novas");
    expect(seloDoAluno({ ...base, id: "demo-aluna-1", name: "Juliana Prado", anamnese: respostasExemplo("juliana", HOJE) }, HOJE)).toBeNull();
  });
  it("o pedido de exemplo não leva pacote (nada é enviado)", () => {
    expect(pedidoExemplo(HOJE).packed).toBe("");
  });

  it("/testar: exemplos com as respostas e o pedido; personal sem jeito de trabalhar", async () => {
    await seedTester(repo);
    const coach = await repo.getProfile(TESTER_COACH_ID);
    expect(coach?.workStyle).toBeUndefined();
    const [ju, ma, be] = await Promise.all(["teste-ex-1", "teste-ex-2", "teste-ex-3"].map((id) => repo.getProfile(id)));
    expect(ju?.anamnese?.id).toBe("exemplo-juliana");
    expect(ma?.anamnese?.id).toBe("exemplo-marcos");
    expect(be?.anamnese).toBeUndefined();
    expect(be?.anamnesePedido?.id).toBe("exemplo-pedido-beatriz");
    for (const p of [ju, ma, be]) expect(p && ehExemplo(p)).toBe(true);
  });
  it("demonstração: personal com o jeito pronto e exemplos com as respostas; ehExemplo nos demo-*", async () => {
    await seedDemo(repo, "coach");
    const coach = await repo.getProfile(DEMO_COACH_ID);
    expect(coach?.workStyle).toMatchObject({ atendimento: "academia", publico: ["emagrecimento"], dias: 3, minutos: 60, semanas: 6, alimentacao: "encaminho" });
    expect(coach?.workStyle?.definidoEm).toBeTruthy();
    const [ju, ma, be] = await Promise.all(["demo-aluna-1", "demo-aluno-2", "demo-aluna-3"].map((id) => repo.getProfile(id)));
    expect(ju?.anamnese?.id).toBe("exemplo-juliana");
    expect(ma?.anamnese?.id).toBe("exemplo-marcos");
    expect(be?.anamnesePedido?.id).toBe("exemplo-pedido-beatriz");
    for (const p of [ju, ma, be]) {
      expect(p?.sample).toBeUndefined();
      expect(p && ehExemplo(p)).toBe(true);
    }
    expect(jeitoDemonstracao(HOJE).definidoEm).toBe(HOJE.toISOString());
  });

  it("migração leve: exemplos antigos do /testar ganham o questionário, sem duplicar e sem recriar removidos", async () => {
    await seedTester(repo);
    // Como era antes do questionário: exemplos sem respostas nem pedido, e sem a marca da migração.
    for (const id of ["teste-ex-1", "teste-ex-2", "teste-ex-3"]) {
      const p = (await repo.getProfile(id))!;
      const { anamnese: _a, anamnesePedido: _p, ...antigo } = p;
      await repo.saveProfile(antigo as Profile);
    }
    storage.removeItem("sr:v1:exemplos-questionario:teste");
    await repo.deleteAccount("teste-ex-2");

    await seedTester(repo); // quem já testou: não recria, só completa
    const ju = await repo.getProfile("teste-ex-1");
    const be = await repo.getProfile("teste-ex-3");
    expect(ju?.anamnese?.id).toBe("exemplo-juliana");
    expect(be?.anamnesePedido?.id).toBe("exemplo-pedido-beatriz");
    expect(await repo.getProfile("teste-ex-2")).toBeNull();
    expect((await repo.listStudents(TESTER_COACH_ID)).map((s) => s.profile.id).sort()).toEqual(["teste-ex-1", "teste-ex-3"]);

    const antes = JSON.stringify(await repo.listStudents(TESTER_COACH_ID));
    expect(await completarExemplosTeste(repo)).toBe(0);
    await seedTester(repo);
    expect(JSON.stringify(await repo.listStudents(TESTER_COACH_ID))).toBe(antes);
  });
  it("migração leve não troca respostas que já existem nem roda de novo depois de apagadas", async () => {
    await seedTester(repo);
    const ju = (await repo.getProfile("teste-ex-1"))!;
    await repo.saveProfile({ ...ju, anamnese: { ...ju.anamnese!, id: "do-personal" } });
    storage.removeItem("sr:v1:exemplos-questionario:teste");
    expect(await completarExemplosTeste(repo)).toBe(0);
    expect((await repo.getProfile("teste-ex-1"))?.anamnese?.id).toBe("do-personal");
    // O personal apagou as respostas de um exemplo: a migração (já marcada) não as traz de volta.
    const { anamnese: _a, ...semRespostas } = (await repo.getProfile("teste-ex-1"))!;
    await repo.saveProfile(semRespostas as Profile);
    expect(await completarExemplosTeste(repo)).toBe(0);
    expect((await repo.getProfile("teste-ex-1"))?.anamnese).toBeUndefined();
  });
});
