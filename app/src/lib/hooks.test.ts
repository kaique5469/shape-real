import { describe, expect, it } from "vitest";
import { coachContact, recentRecords, returnNotice, weekGoal } from "@/lib/hooks";
import { sessionsThisWeek, weeklyGoal } from "@/lib/domain/attention";
import { coachSignature } from "@/lib/domain/program-share";
import type { ExerciseLog, Profile, Session } from "@/lib/domain/types";

/** Horário local (o Hoje conta a semana no fuso do aparelho). */
const local = (day: number, hour = 10, month = 10) => new Date(2026, month, day, hour).toISOString();
const NOW = new Date(2026, 10, 19, 12); // quinta-feira, 19/11/2026

const s = (id: string, startedAt: string, exercises: ExerciseLog[] = [], prs: string[] = []): Session => ({ id, userId: "u1", startedAt, exercises, volumeKg: 0, prs });
const log = (exerciseId: string, sets: [number | null, number][], extra: Partial<ExerciseLog> = {}): ExerciseLog => ({
  uid: `${exerciseId}-${sets.length}`,
  exerciseId,
  name: exerciseId,
  sets: sets.map(([loadKg, reps]) => ({ loadKg, reps, done: true })),
  ...extra,
});

describe("weekGoal (card 'Sua semana' do Hoje)", () => {
  it("meta 3 e 2 treinos de segunda a domingo: 2 de 3, sem meta batida", () => {
    const sessions = [s("a", local(16, 7)), s("b", local(18, 19)), s("c", local(15, 10))]; // domingo anterior não conta
    expect(weekGoal(sessions, 3, 5, NOW)).toEqual({ done: 2, goal: 3, met: false });
  });

  it("é a mesma conta de /alunos (sessionsThisWeek + weeklyGoal)", () => {
    const sessions = [s("a", local(16)), s("b", local(17)), s("c", local(19, 22)), s("d", local(9))];
    const alunos = { week: sessionsThisWeek(sessions.map((x) => x.startedAt), NOW), goal: weeklyGoal(4, 2) };
    const hoje = weekGoal(sessions, 4, 2, NOW);
    expect([hoje.done, hoje.goal]).toEqual([alunos.week, alunos.goal]);
  });

  it("treino de domingo à noite fica na semana dele (fuso do aparelho, não UTC)", () => {
    const sunday = new Date(2026, 10, 22, 23, 30);
    expect(weekGoal([s("a", local(22, 22))], 3, null, sunday).done).toBe(1);
    expect(weekGoal([s("a", local(22, 22))], 3, null, new Date(2026, 10, 23, 8)).done).toBe(0);
  });

  it("meta batida (ou passada) e meta do perfil quando a ficha não tem", () => {
    const sessions = [s("a", local(16)), s("b", local(17)), s("c", local(18))];
    expect(weekGoal(sessions, null, 3, NOW)).toEqual({ done: 3, goal: 3, met: true });
    expect(weekGoal(sessions, 2, null, NOW)).toEqual({ done: 3, goal: 2, met: true });
  });

  it("sem meta: goal null (o card continua com o volume) e nunca 'batida'", () => {
    expect(weekGoal([s("a", local(16))], null, undefined, NOW)).toEqual({ done: 1, goal: null, met: false });
    expect(weekGoal([], 0, 0, NOW)).toEqual({ done: 0, goal: null, met: false });
  });
});

describe("returnNotice (volta depois de pausa)", () => {
  it("14 dias ou mais desde o último treino: linha com os dias", () => {
    expect(returnNotice([s("a", local(3, 18)), s("b", local(1))], new Date(2026, 10, 19, 8))).toBe(
      "Faz 16 dias desde o último treino. Hoje as cargas sugeridas vêm mais leves.",
    );
    expect(returnNotice([s("a", local(5, 23))], new Date(2026, 10, 19, 7))).toContain("Faz 14 dias");
  });

  it("13 dias, treino recente ou nenhum treino: sem aviso", () => {
    expect(returnNotice([s("a", local(6, 23))], new Date(2026, 10, 19, 7))).toBeNull();
    expect(returnNotice([s("old", local(1)), s("new", local(18))], NOW)).toBeNull();
    expect(returnNotice([], NOW)).toBeNull();
  });

  it("usa o treino mais recente, em qualquer ordem da lista", () => {
    expect(returnNotice([s("old", local(1)), s("new", local(10))], NOW)).toBeNull();
  });
});

describe("coachContact (personal no Hoje do aluno)", () => {
  const remote: NonNullable<Profile["remoteCoach"]> = { id: "c1", name: "Camila Duarte", phone: "(11) 91234-5678", cref: "012345-G/SP", studentRef: "s1" };

  it("nome, CREF e WhatsApp do pacote", () => {
    const c = coachContact(remote, null)!;
    expect(c.line).toBe("Acompanhamento de Camila Duarte · CREF 012345-G/SP");
    expect(c).toMatchObject({ name: "Camila Duarte", credential: "CREF 012345-G/SP", cta: "Falar com Camila" });
    expect(c.href).toBe(`https://wa.me/5511912345678?text=${encodeURIComponent("Oi, Camila!")}`);
  });

  it("sem CREF: só o nome; sem telefone (ou telefone curto): sem botão", () => {
    const c = coachContact({ ...remote, cref: undefined, phone: undefined }, null)!;
    expect(c.line).toBe("Acompanhamento de Camila Duarte");
    expect(c.credential).toBeNull();
    expect(c.href).toBeNull();
    expect(coachContact({ ...remote, phone: "1234" }, null)!.href).toBeNull();
  });

  it("CREF digitado com o prefixo não vira 'CREF CREF'", () => {
    expect(coachContact({ ...remote, cref: "CREF 012345-G/SP" }, null)!.line).toBe("Acompanhamento de Camila Duarte · CREF 012345-G/SP");
  });

  it("mesma assinatura da ficha, da dieta e do relatório (coachSignature)", () => {
    for (const cref of ["012345-G/SP", "CREF 012345-G/SP", "cref 1234", "", undefined]) {
      expect(coachContact({ ...remote, cref }, null)!.line).toBe(`Acompanhamento de ${coachSignature({ name: remote.name, cref })}`);
    }
  });

  it("o cadastro local do mesmo personal completa telefone e CREF; o de outro personal não", () => {
    const bare = { ...remote, phone: undefined, cref: undefined };
    const same = coachContact(bare, { id: "c1", name: "Camila Duarte", phone: "11912345678", cref: "012345-G/SP" })!;
    expect(same.credential).toBe("CREF 012345-G/SP");
    expect(same.href).not.toBeNull();
    const other = coachContact(bare, { id: "c2", name: "Outro", phone: "11999998888", cref: "999999-G/RJ" })!;
    expect(other).toMatchObject({ name: "Camila Duarte", credential: null, href: null });
  });

  it("aluno vinculado sem link: usa o cadastro do personal", () => {
    expect(coachContact(undefined, { id: "c9", name: "Rafael Lima", phone: "21987654321" })).toMatchObject({ line: "Acompanhamento de Rafael Lima", cta: "Falar com Rafael" });
  });

  it("nome provisório 'Personal': texto genérico, sem 'Acompanhamento de Personal'", () => {
    const c = coachContact({ ...remote, name: "Personal" }, null)!;
    expect(c.line).toBe("Com acompanhamento do seu personal · CREF 012345-G/SP");
    expect(c.cta).toBe("Falar com seu personal");
    expect(c.href).toBe(`https://wa.me/5511912345678?text=${encodeURIComponent("Oi!")}`);
  });

  it("sem personal: null", () => {
    expect(coachContact(undefined, null)).toBeNull();
  });
});

describe("recentRecords ('Recordes recentes' no Hoje)", () => {
  const at = (n: number) => `2026-02-${String(n).padStart(2, "0")}T10:00:00Z`;

  it("mostra a série que bateu a marca, não a mais pesada", () => {
    const sessions = [s("b", at(8), [log("supino_reto_barra", [[62.5, 10], [65, 3]])], ["supino_reto_barra"]), s("a", at(1), [log("supino_reto_barra", [[70, 5], [60, 10]])])];
    expect(recentRecords(sessions)).toEqual([{ date: at(8), exerciseId: "supino_reto_barra", name: "supino_reto_barra", mark: "62,5 kg × 10" }]);
  });

  it("peso corporal mostra reps e isometria mostra segundos, nunca '0 kg × 15'", () => {
    const sessions = [
      s("a", at(1), [log("barra_fixa", [[0, 8]]), log("prancha", [[null, 40]], { unit: "seg" })]),
      s("b", at(8), [log("barra_fixa", [[0, 10], [0, 12]]), log("prancha", [[null, 60]], { unit: "seg" })], ["barra_fixa", "prancha"]),
    ];
    const marks = recentRecords(sessions).map((r) => r.mark);
    expect(marks).toEqual(["12 reps", "60 s"]);
    expect(marks.join(" ")).not.toContain("0 kg");
  });

  it("recorde que não se reproduz com o histórico atual: cai na melhor série, ainda sem '0 kg'", () => {
    // Sem histórico anterior o detector não marca recorde; o carimbo salvo continua valendo.
    const sessions = [s("a", at(1), [log("flexao", [[0, 15], [0, 18], [0, 12]]), log("supino_reto_barra", [[40, 10], [42.5, 8]])], ["flexao", "supino_reto_barra"])];
    expect(recentRecords(sessions).map((r) => r.mark)).toEqual(["18 reps", "42,5 kg × 8"]);
  });

  it("do treino mais recente para o mais antigo, no máximo 5", () => {
    const sessions = Array.from({ length: 4 }, (_, i) =>
      s(`s${i}`, at(i + 1), [log("supino_reto_barra", [[40 + i * 2.5, 8]]), log("agachamento_livre", [[60 + i * 5, 8]])], i ? ["supino_reto_barra", "agachamento_livre"] : []),
    );
    const out = recentRecords(sessions);
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ date: at(4), mark: "47,5 kg × 8" });
    expect(out.map((r) => r.date)).toEqual([at(4), at(4), at(3), at(3), at(2)]);
  });

  it("exercício sem registro na sessão: sem marca, com o nome da biblioteca", () => {
    const out = recentRecords([s("a", at(1), [], ["supino_reto_barra"])]);
    expect(out[0]!.mark).toBeNull();
    expect(out[0]!.name).not.toBe("");
  });
});
