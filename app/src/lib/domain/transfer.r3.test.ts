import { describe, expect, it } from "vitest";
import { packData, unpackData } from "../share-link";
import { buildFichaPacket, buildTreinosPacket, completudeLinha, faixaEmOrdem, painLines, parsePacket, sessionToText, treinosMessage, type FichaPacket, type TreinosPacket } from "./transfer";
import type { ExerciseLog, Profile, Program, Session, SetLog } from "./types";

/**
 * Rodada 3, trilha S, no link de treinos e no da ficha: campos novos opcionais (dor, minutos ativos, séries
 * planejadas), link antigo sempre abrindo, faixa invertida normalizada, volume recalculado na chegada e o texto do
 * envio mostrando tudo o que vai no link. TRANSFER_VERSION continua 1. Dados fictícios.
 */
const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };
const aluno: Profile = { id: "a1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z" };
const feita = (loadKg: number | null, reps: number): SetLog => ({ loadKg, reps, done: true });
const vazia = (): SetLog => ({ loadKg: null, reps: null, done: false });
const ex = (uid: string, exerciseId: string, name: string, sets: SetLog[], extra: Partial<ExerciseLog> = {}): ExerciseLog => ({ uid, exerciseId, name, sets, ...extra });

function treino(id: string, day: number, extra: Partial<Session> = {}): Session {
  const start = new Date(2026, 10, day, 18, 0).toISOString();
  return {
    id,
    userId: "aluno-local",
    programId: "p1",
    dayKey: "B",
    startedAt: start,
    finishedAt: new Date(Date.parse(start) + 95 * 60_000).toISOString(),
    exercises: [ex("e1", "supino_reto_barra", "Supino reto com barra", [feita(40, 10), feita(40, 10)])],
    volumeKg: 800,
    prs: [],
    ...extra,
  };
}

/** O que o /receber faz com o link: empacota, desempacota e confere. */
async function viaLink(p: unknown) {
  return parsePacket(await unpackData(await packData(p)));
}

describe("link de treinos: campos novos opcionais (R3-4, R3-7)", () => {
  it("dor, minutos ativos e séries planejadas atravessam o link", async () => {
    const s = treino("a", 20, { activeMin: 42, activeEdited: true, plannedSets: 24, exercises: [ex("e1", "supino_reto_barra", "Supino reto com barra", [feita(40, 10)], { pain: true })] });
    const got = (await viaLink(buildTreinosPacket({ student: aluno, coachId: "c1", studentRef: "s1", sessions: [s] }))) as TreinosPacket;
    expect(got.sessions[0]).toMatchObject({ activeMin: 42, activeEdited: true, plannedSets: 24 });
    expect(got.sessions[0]!.exercises[0]!.pain).toBe(true);
  });

  it("link antigo (sem nenhum campo novo) continua abrindo igual", async () => {
    const antigo = treino("a", 20);
    const got = (await viaLink(buildTreinosPacket({ student: aluno, coachId: "c1", studentRef: "s1", sessions: [antigo] }))) as TreinosPacket;
    expect(got).not.toBeNull();
    expect(got.sessions[0]).not.toHaveProperty("activeMin");
    expect(got.sessions[0]).not.toHaveProperty("plannedSets");
    expect(got.sessions[0]!.exercises[0]).not.toHaveProperty("pain");
  });

  it("campo novo malformado (versão alterada, bug) some; o link NUNCA é recusado por ele", () => {
    const base = buildTreinosPacket({ student: aluno, coachId: "c1", studentRef: "s1", sessions: [treino("a", 20)] });
    const torto = JSON.parse(JSON.stringify(base)) as { sessions: Record<string, unknown>[] };
    Object.assign(torto.sessions[0]!, { activeMin: "muito", activeEdited: "sim", plannedSets: -3 });
    (torto.sessions[0]!.exercises as Record<string, unknown>[])[0]!.pain = "talvez";
    const got = parsePacket(torto) as TreinosPacket;
    expect(got).not.toBeNull();
    expect(got.sessions[0]).not.toHaveProperty("activeMin");
    expect(got.sessions[0]).not.toHaveProperty("activeEdited");
    expect(got.sessions[0]).not.toHaveProperty("plannedSets");
    expect(got.sessions[0]!.exercises[0]).not.toHaveProperty("pain");
    // plannedSets fracionário ou absurdo também some.
    Object.assign(torto.sessions[0]!, { plannedSets: 2.5 });
    expect((parsePacket(torto) as TreinosPacket).sessions[0]).not.toHaveProperty("plannedSets");
    Object.assign(torto.sessions[0]!, { plannedSets: 99_999 });
    expect((parsePacket(torto) as TreinosPacket).sessions[0]).not.toHaveProperty("plannedSets");
  });

  it("versão do protocolo continua 1 (o pacote novo abre num app antigo, que ignora as chaves)", () => {
    expect(buildTreinosPacket({ student: aluno, coachId: "c1", studentRef: "s1", sessions: [treino("a", 20, { plannedSets: 6 })] }).v).toBe(1);
  });
});

describe("volume recalculado na chegada (R3-6 B)", () => {
  it("o volumeKg do remetente (cache, talvez de outra convenção) é trocado pelo da convenção única", async () => {
    const assistida = treino("a", 20, {
      volumeKg: 1520,
      exercises: [
        ex("e1", "supino_reto_barra", "Supino", [feita(40, 10), feita(40, 10), feita(40, 10)]),
        ex("e2", "prancha", "Prancha", [feita(10, 60), feita(10, 60), feita(10, 60)], { unit: "seg" }),
        ex("e3", "barra_fixa_assistida", "Graviton", [feita(40, 8)]),
      ],
    });
    const got = (await viaLink(buildTreinosPacket({ student: aluno, coachId: "c1", studentRef: "s1", sessions: [assistida] }))) as TreinosPacket;
    expect(got.sessions[0]!.volumeKg).toBe(1200);
  });
});

describe("faixa de repetições invertida no link da ficha (R3-6)", () => {
  const program: Program = {
    id: "p1",
    ownerId: "s1",
    createdBy: "c1",
    name: "Ficha",
    system: "livre",
    goal: "hipertrofia",
    level: "iniciante",
    daysPerWeek: 3,
    active: true,
    source: "personal",
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    days: [
      {
        key: "A",
        title: "Peito",
        focus: [],
        exercises: [
          { uid: "u1", exerciseId: "supino_reto_barra", name: "Supino", sets: 3, repsMin: 12, repsMax: 8, restSec: 90, technique: "normal" },
          { uid: "u2", exerciseId: "crucifixo_halter", name: "Crucifixo", sets: 3, repsMin: 10, repsMax: 12, restSec: 60, technique: "normal" },
        ],
      },
    ],
  };

  it("12–8 vira 8–12 ao abrir (troca, nunca recusa); a faixa certa não muda", async () => {
    const got = (await viaLink(buildFichaPacket({ coach, student: { ...aluno, id: "s1" }, program, diet: null, customExercises: [], customFoods: [] }))) as FichaPacket;
    expect(got).not.toBeNull();
    expect(got.program!.days[0]!.exercises[0]).toMatchObject({ repsMin: 8, repsMax: 12 });
    expect(got.program!.days[0]!.exercises[1]).toMatchObject({ repsMin: 10, repsMax: 12 });
  });

  it("faixaEmOrdem: só troca quando está invertida; o resto do exercício fica", () => {
    expect(faixaEmOrdem({ repsMin: 12, repsMax: 8, sets: 3 })).toEqual({ repsMin: 8, repsMax: 12, sets: 3 });
    const ok = { repsMin: 8, repsMax: 8 };
    expect(faixaEmOrdem(ok)).toBe(ok);
  });
});

describe("texto do envio dos treinos: dor marcada (R3-7)", () => {
  const comDor = treino("a", 20, { exercises: [ex("e1", "supino_reto_barra", "Supino reto com barra", [feita(40, 10)], { pain: true }), ex("e2", "remada_curvada_barra", "Remada curvada", [feita(40, 10)])] });

  it("aceite: pacote com pain num exercício → a mensagem contém 'Dor marcada: {exercício} ({dd/mm})'", () => {
    const msg = treinosMessage([comDor], "L", "Rafael");
    expect(msg).toContain("Dor marcada: Supino reto com barra (20/11)");
    expect(msg).not.toContain("Dor marcada: Remada curvada");
    // Vem antes do link, junto do treino.
    expect(msg.indexOf("Dor marcada")).toBeLessThan(msg.indexOf("Para registrar"));
  });

  it("aceite negativo: sem pain, a mensagem não contém 'Dor'", () => {
    expect(treinosMessage([treino("a", 20), treino("b", 21)], "L")).not.toMatch(/Dor/);
  });

  it("no resumo de mais de 3 treinos a dor também aparece (nada escondido no link)", () => {
    const msg = treinosMessage([treino("x1", 1), treino("x2", 2), treino("x3", 3), comDor], "L");
    expect(msg).toContain("• Treino B · 20/11");
    expect(msg).toContain("Dor marcada: Supino reto com barra (20/11)");
  });

  it("paridade: todo exercício com dor no pacote está na mensagem (mesmos treinos)", () => {
    const sessions = [comDor, treino("b", 22, { exercises: [ex("e9", "agachamento_livre", "Agachamento livre", [vazia()], { pain: true }), ex("e1", "supino_reto_barra", "Supino", [feita(40, 10)])] })];
    const packet = buildTreinosPacket({ student: aluno, coachId: "c1", studentRef: "s1", sessions });
    const msg = treinosMessage(sessions, "L");
    for (const s of packet.sessions) for (const e of s.exercises) if (e.pain) expect(msg).toContain(`Dor marcada: ${e.name}`);
    expect(painLines(sessions)).toEqual(["Dor marcada: Supino reto com barra (20/11)", "Dor marcada: Agachamento livre (22/11)"]);
  });
});

describe("texto do treino: minutos pela regra única e completude (R3-4)", () => {
  it("com minutos ativos: '42 min ativos'; corrigidos: '(ajustado)'; acima de 180 brutos, sem minutos", () => {
    expect(sessionToText(treino("a", 20, { activeMin: 42 })).split("\n")[0]).toBe("*Treino B · 20/11 · 42 min ativos*");
    expect(sessionToText(treino("a", 20, { activeMin: 40, activeEdited: true })).split("\n")[0]).toBe("*Treino B · 20/11 · 40 min ativos (ajustado)*");
    const dias = treino("a", 20, { finishedAt: new Date(Date.parse(treino("a", 20).startedAt) + 26 * 3_600_000).toISOString() });
    expect(sessionToText(dias).split("\n")[0]).toBe("*Treino B · 20/11*");
  });

  it("aceite: '{feitas} de {planejadas}' igual ao da tela; 'parcial' só abaixo da metade", () => {
    const umDe24 = treino("a", 20, { activeMin: 20, plannedSets: 24, exercises: [ex("e1", "supino_reto_barra", "Supino", [feita(40, 10)])] });
    expect(sessionToText(umDe24).split("\n")[0]).toBe("*Treino B · 20/11 · 20 min ativos · 1 de 24 séries (parcial)*");
    expect(completudeLinha(umDe24)).toBe("1 de 24 séries (parcial)");
    const quase = treino("a", 20, { plannedSets: 3 });
    expect(completudeLinha(quase)).toBe("2 de 3 séries");
  });

  it("sem plannedSets (sessão e link antigos): nenhum número de séries nem 'parcial'", () => {
    const t = sessionToText(treino("a", 20));
    expect(t).not.toMatch(/parcial| de \d+ séries/);
    expect(completudeLinha(treino("a", 20))).toBeNull();
  });

  it("exercício só com a dor (sem série feita) não vira linha vazia no texto", () => {
    const s = treino("a", 20, { exercises: [ex("e1", "supino_reto_barra", "Supino", [feita(40, 10)]), ex("e2", "agachamento_livre", "Agachamento livre", [vazia()], { pain: true })] });
    expect(sessionToText(s)).not.toContain("• Agachamento livre");
  });
});
