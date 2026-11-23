import { describe, expect, it } from "vitest";
import { cameFromPaste, packData, packedFromHash, packedFromText, pastedLinkHref, unpackData } from "../share-link";
import { getExercise } from "./exercises";
import { backupAgeBucket, backupFileName, backupReminderDue, backupStatusShort, backupStatusText, buildBackup, parseBackup, programsToCsv, promptShowsAgain } from "./export";
import { buildFichaPacket, buildTreinosPacket, consentConfirmed, consentFromCheckbox, consentMetric, hasHealthData, MAX_SESSIONS_PER_LINK, mergeMetric, mirrorLoads, parsePacket, sessionToText, studentFieldsOf, topLoads, TRANSFER_VERSION, treinosMessage } from "./transfer";
import type { BodyMetric, DietPlan, Exercise, Profile, Program, Session } from "./types";

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z", phone: "11988887777" };
const student: Profile = { id: "s1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", sex: "F", birthYear: 1996, weightKg: 62.5, goal: "hipertrofia", coachNotes: "não mandar", managedBy: "c1", limitations: "" };
const program: Program = {
  id: "p1",
  ownerId: "s1",
  createdBy: "c1",
  name: "ABC Hipertrofia",
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  days: [
    {
      key: "A",
      title: "Peito e tríceps",
      focus: ["peito"],
      exercises: [
        { uid: "u1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: 4, repsMin: 8, repsMax: 10, restSec: 120, loadKg: 40, technique: "normal" },
        { uid: "u2", exerciseId: "custom_remada", name: "Remada articulada", sets: 3, repsMin: 10, repsMax: 12, restSec: 90, technique: "normal", notes: "pegada neutra" },
      ],
    },
  ],
  active: true,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
};
const diet: DietPlan = {
  id: "d1",
  ownerId: "s1",
  createdBy: "c1",
  name: "Plano alimentar de Marina",
  targets: { kcal: 2000, proteinG: 130, carbsG: 220, fatG: 60 },
  meals: [{ uid: "m1", name: "Café da manhã", time: "07:00", items: [{ uid: "i1", foodId: "custom_iogurte", name: "Iogurte proteico", grams: 250, kcal: 150, proteinG: 23, carbsG: 11, fatG: 1 }] }],
  updatedAt: "2026-11-01T10:00:00Z",
};
const customEx: Exercise[] = [
  { id: "custom_remada", name: "Remada articulada", group: "costas", implement: "maquina", pattern: "puxar_h", compound: true, custom: true },
  { id: "custom_outro", name: "Outro", group: "peito", implement: "maquina", pattern: "empurrar_h", compound: true, custom: true },
];

function session(id: string, day: number, extra: Partial<Session> = {}): Session {
  const start = new Date(2026, 10, day, 18, 0).toISOString();
  return {
    id,
    userId: "aluno-local",
    programId: "p1",
    dayKey: "A",
    dayTitle: "Peito e tríceps",
    startedAt: start,
    finishedAt: new Date(Date.parse(start) + 52 * 60000).toISOString(),
    exercises: [
      { uid: "e1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: [{ loadKg: 40, reps: 10, done: true }, { loadKg: 42.5, reps: 8, done: true }, { loadKg: 42.5, reps: null, done: false }] },
      { uid: "e2", exerciseId: "prancha", name: "Prancha", unit: "seg", sets: [{ loadKg: null, reps: 45, done: true }] },
    ],
    volumeKg: 740,
    prs: ["supino_reto_barra"],
    feeling: 4,
    note: "ombro tranquilo",
    ...extra,
  };
}

describe("envio por link", () => {
  it("pacote da ficha leva só o necessário: sem anotações do personal, só os exercícios próprios usados", () => {
    const p = buildFichaPacket({ coach, student, program, diet, customExercises: customEx, customFoods: [{ id: "custom_iogurte", name: "Iogurte proteico", aliases: [], kcal: 60, p: 9.4, c: 4.5, f: 0.5, category: "laticinio" }], now: new Date("2026-11-20T12:00:00Z") });
    expect(p.student).toMatchObject({ ref: "s1", name: "Marina Costa", sex: "F", weightKg: 62.5 });
    expect(p.student).not.toHaveProperty("coachNotes");
    expect(p.student).not.toHaveProperty("managedBy");
    expect(p.student).not.toHaveProperty("limitations");
    expect(p.exercises.map((e) => e.id)).toEqual(["custom_remada"]);
    expect(p.foods.map((f) => f.id)).toEqual(["custom_iogurte"]);
    expect(p.coach).toEqual({ id: "c1", name: "Rafael Nunes", phone: "11988887777" });
  });

  it("vai e volta pelo link sem perder nada e cabe numa mensagem", async () => {
    const p = buildFichaPacket({ coach, student, program, diet, customExercises: customEx, customFoods: [] });
    const packed = await packData(p);
    expect(packed.startsWith("1.")).toBe(true);
    expect(packed).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(packed.length).toBeLessThan(3000);
    const back = parsePacket(await unpackData(packed));
    expect(back).toEqual(p);
    expect(packedFromHash(`#d=${packed}`)).toBe(packed);
  });

  it("ficha grande (6 treinos × 10 exercícios) com dieta completa ainda gera link curto", async () => {
    const big: Program = {
      ...program,
      days: Array.from({ length: 6 }, (_, d) => ({
        key: "ABCDEF"[d]!,
        title: `Treino ${d}`,
        focus: [],
        exercises: Array.from({ length: 10 }, (_, i) => ({ uid: `u${d}${i}`, exerciseId: `exercicio_${i}`, name: `Exercício número ${i} com nome comprido`, sets: 4, repsMin: 8, repsMax: 12, restSec: 90, loadKg: 20 + i, technique: "normal", notes: "Descer controlando em 3 segundos" })),
      })),
    };
    const packed = await packData(buildFichaPacket({ coach, student, program: big, diet, customExercises: [], customFoods: [] }));
    expect(packed.length).toBeLessThan(8000);
  });

  it("pacote de treinos: os mais recentes, até o limite", () => {
    const many = Array.from({ length: MAX_SESSIONS_PER_LINK + 5 }, (_, i) => session(`s${i}`, 1 + (i % 28)));
    const p = buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: many });
    expect(p.sessions).toHaveLength(MAX_SESSIONS_PER_LINK);
    expect(parsePacket(JSON.parse(JSON.stringify(p)))).not.toBeNull();
  });

  it("recusa o que não é um link válido", async () => {
    expect(parsePacket({ kind: "ficha", v: 1 })).toBeNull();
    expect(parsePacket({ kind: "outra" })).toBeNull();
    expect(parsePacket(null)).toBeNull();
    const p = buildFichaPacket({ coach, student, program, diet: null, customExercises: [], customFoods: [] });
    expect(parsePacket({ ...p, program: { ...program, days: [] } })).toBeNull();
    expect(parsePacket({ ...p, exercises: [{ ...customEx[0], id: "supino_reto_barra" }] })).toBeNull();
    await expect(unpackData("x.abc")).rejects.toThrow();
    await expect(unpackData("1.!!!")).rejects.toThrow();
  });

  it("texto do treino para o WhatsApp", () => {
    const t = sessionToText(session("a", 20));
    expect(t.split("\n")[0]).toBe("*Treino A — Peito e tríceps · 20/11 · 52 min*");
    expect(t).toContain("• Supino reto com barra: 40×10 · 42,5×8");
    expect(t).toContain("• Prancha: 45 s");
    expect(t).toContain("Recorde: Supino reto com barra");
    expect(t).toContain("Como foi: Bom");
    expect(t).toContain("Anotação: ombro tranquilo");
    expect(t).not.toMatch(/undefined|null|NaN/);
  });

  it("mensagem com vários treinos resume e leva o link", () => {
    const msg = treinosMessage([session("a", 18), session("b", 20)], "https://x/receber#d=1.abc", "Rafael");
    expect(msg.startsWith("Rafael, 2 treinos feitos:")).toBe(true);
    expect(msg.indexOf("18/11")).toBeLessThan(msg.indexOf("20/11"));
    expect(msg.trim().endsWith("https://x/receber#d=1.abc")).toBe(true);
    const many = treinosMessage([1, 2, 3, 4].map((d) => session(`x${d}`, d)), "L");
    expect(many).toContain("• Treino A · 01/11");
    expect(many).not.toContain("Supino");
  });
});

describe("colar link", () => {
  it("acha o link dentro da mensagem inteira do WhatsApp", async () => {
    const packed = await packData(buildFichaPacket({ coach, student, program, diet, customExercises: [], customFoods: [] }));
    const msg = `Marina, sua ficha nova:\n\n*Treino A — Peito e tríceps*\n• Supino 4 × 8–10\n\nAbra no celular: https://shapereal.app/abrir#d=${packed}.`;
    expect(packedFromText(msg)).toBe(packed);
    expect(packedFromText(`https://shapereal.app/receber%23d=${packed} (enviado)`)).toBe(packed);
    expect(parsePacket(await unpackData(packedFromText(msg)!))?.kind).toBe("ficha");
  });

  it("texto sem link do app não vira pacote", () => {
    expect(packedFromText("")).toBeNull();
    expect(packedFromText("oi, tudo bem? https://exemplo.com/#d=abc")).toBeNull();
    expect(packedFromText("https://shapereal.app/abrir")).toBeNull();
  });

  it("endereço interno marca que veio pelo campo de colar", () => {
    expect(pastedLinkHref("ficha", "1.abc")).toBe("/abrir#d=1.abc&colar=1");
    expect(pastedLinkHref("treinos", "1.abc")).toBe("/receber#d=1.abc&colar=1");
    expect(packedFromHash("#d=1.abc&colar=1")).toBe("1.abc");
    expect(cameFromPaste("#d=1.abc&colar=1")).toBe(true);
    expect(cameFromPaste("#d=1.abc")).toBe(false);
  });

  it("link cortado não abre", async () => {
    const packed = await packData(buildFichaPacket({ coach, student, program, diet, customExercises: [], customFoods: [] }));
    const cut = packedFromText(`https://shapereal.app/abrir#d=${packed.slice(0, Math.floor(packed.length / 2))}`)!;
    const parsed = await unpackData(cut).then(parsePacket, () => null);
    expect(parsed).toBeNull();
  });
});

describe("reenvio da ficha não faz a carga regredir", () => {
  const sessionAt = (id: string, iso: string, load: number, extra: Partial<Session> = {}): Session => ({
    ...session(id, 20),
    startedAt: iso,
    exercises: [{ uid: "e1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: [{ loadKg: load - 2.5, reps: 10, done: true }, { loadKg: load, reps: 8, done: true }, { loadKg: load + 5, reps: null, done: false }] }],
    ...extra,
  });

  it("carga do treino: maior série feita (série não feita não conta)", () => {
    expect(topLoads(sessionAt("a", "2026-11-05T18:00:00Z", 42.5)).get("supino_reto_barra")).toBe(42.5);
  });

  it("aluno treina com 42,5 kg depois da ficha: a ficha do personal passa a mostrar 42,5", () => {
    const next = mirrorLoads(program, [sessionAt("a", "2026-11-05T18:00:00Z", 42.5)]);
    expect(next?.days[0]!.exercises[0]!.loadKg).toBe(42.5);
    // Exercício sem carga no treino (ou não feito) continua como o personal deixou; updatedAt não muda.
    expect(next?.days[0]!.exercises[1]).toEqual(program.days[0]!.exercises[1]);
    expect(next?.updatedAt).toBe(program.updatedAt);
    // O reenvio leva a carga atual.
    const resend = buildFichaPacket({ coach, student, program: next!, diet: null, customExercises: [], customFoods: [] });
    expect(resend.program?.days[0]!.exercises[0]!.loadKg).toBe(42.5);
  });

  it("personal baixou a carga depois do treino: a redução é mantida", () => {
    const reduced: Program = { ...program, updatedAt: "2026-11-06T09:00:00Z", days: [{ ...program.days[0]!, exercises: [{ ...program.days[0]!.exercises[0]!, loadKg: 37.5 }, program.days[0]!.exercises[1]!] }] };
    expect(mirrorLoads(reduced, [sessionAt("a", "2026-11-05T18:00:00Z", 42.5)])).toBeNull();
  });

  it("vale o treino mais recente; treino de outra ficha ou livre não mexe", () => {
    const next = mirrorLoads(program, [sessionAt("b", "2026-11-08T18:00:00Z", 45), sessionAt("a", "2026-11-05T18:00:00Z", 42.5)]);
    expect(next?.days[0]!.exercises[0]!.loadKg).toBe(45);
    expect(mirrorLoads(program, [sessionAt("c", "2026-11-05T18:00:00Z", 50, { programId: "outra" })])).toBeNull();
    expect(mirrorLoads(program, [sessionAt("d", "2026-11-05T18:00:00Z", 50, { programId: null })])).toBeNull();
    // Mesma carga que já está na ficha: nada a gravar.
    expect(mirrorLoads(program, [sessionAt("e", "2026-11-05T18:00:00Z", 40)])).toBeNull();
  });
});

describe("medida do aluno não apaga a avaliação do personal", () => {
  const avaliacao: BodyMetric = { id: "av1", userId: "s1", date: "2026-11-10", weightKg: 63.2, bodyFatPct: 24.5, waistCm: 71, hipCm: 98, armCm: 28, note: "avaliação mensal" };

  it("aluno manda só o peso na data da avaliação: cintura, % de gordura e demais campos continuam", () => {
    const merged = mergeMetric(avaliacao, { id: "m-aluno", userId: "aluno-local", date: "2026-11-10", weightKg: 62.8 });
    expect(merged).toEqual(avaliacao);
  });

  it("o aluno só preenche o que o personal deixou vazio", () => {
    const merged = mergeMetric(avaliacao, { id: "m-aluno", userId: "aluno-local", date: "2026-11-10", weightKg: 62.8, thighCm: 55, chestCm: null });
    expect(merged).toEqual({ ...avaliacao, thighCm: 55 });
    expect(merged.id).toBe("av1");
  });

  it("o mesmo registro do aluno chegando de novo atualiza o valor, sem apagar campo que não veio", () => {
    const first: BodyMetric = { id: "m-aluno", userId: "s1", date: "2026-11-12", weightKg: 62.8, waistCm: 70 };
    expect(mergeMetric(first, { id: "m-aluno", userId: "x", date: "2026-11-12", weightKg: 62.4 })).toEqual({ ...first, weightKg: 62.4 });
  });

  it("data nova entra como veio", () => {
    const m: BodyMetric = { id: "n", userId: "s1", date: "2026-11-15", weightKg: 62 };
    expect(mergeMetric(undefined, m)).toBe(m);
  });
});

describe("cópia de segurança em 1 arquivo", () => {
  const remada = customEx[0]!;
  const iogurte = { id: "custom_iogurte", name: "Iogurte proteico", aliases: [], kcal: 60, p: 9.4, c: 4.5, f: 0.5, category: "laticinio" as const };

  it("o arquivo leva os exercícios próprios que as fichas usam: nenhum exercício falta ao restaurar", () => {
    const backup = buildBackup(
      {
        profile: coach,
        programs: [],
        customExercises: [remada],
        customFoods: [iogurte],
        students: [{ profile: student, programs: [program], sessions: [session("a", 18)], metrics: [], diet }],
        sent: { "sr:sent:s1": '["a"]', "sr:session": "invasor" },
      },
      new Date("2026-11-22T12:00:00Z"),
    );
    expect(backup).toMatchObject({ format: "shape-real-copia", v: 2, exportedAt: "2026-11-22T12:00:00.000Z" });
    const back = parseBackup(JSON.stringify(backup))!;
    expect(back).not.toBeNull();
    // Chave que não é "sr:sent:*" nunca volta para o navegador.
    expect(back.sent).toEqual({ "sr:sent:s1": '["a"]' });
    const known = new Set([...(back.customExercises ?? []), ...(back.students ?? []).flatMap((s) => s.customExercises ?? [])].map((e) => e.id));
    const used = (back.students ?? []).flatMap((s) => s.programs ?? []).flatMap((p) => p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    const missing = used.filter((id) => !getExercise(id) && !known.has(id));
    expect(used).toContain("custom_remada");
    expect(missing).toEqual([]);
    expect(back.customFoods?.map((f) => f.id)).toEqual(["custom_iogurte"]);
  });

  it("arquivo antigo (v1) continua abrindo; outro JSON não", () => {
    const v1 = { exportedAt: "2026-10-01T10:00:00Z", profile: student, programs: [program], sessions: [session("a", 18)], metrics: [], diet: null };
    expect(parseBackup(JSON.stringify(v1))?.profile.id).toBe("s1");
    expect(parseBackup(JSON.stringify({ ...v1, students: [{ profile: student }] }))?.students).toHaveLength(1);
    expect(parseBackup("{}")).toBeNull();
    expect(parseBackup("não é json")).toBeNull();
    expect(parseBackup(JSON.stringify({ profile: { id: "x", name: "y", role: "admin" } }))).toBeNull();
    expect(parseBackup(JSON.stringify({ ...v1, customExercises: [{ id: "supino_reto_barra", name: "troca" }] }))).toBeNull();
  });

  it("nome do arquivo com a data", () => {
    expect(backupFileName(new Date(2026, 10, 2, 23, 59))).toBe("shape-real-copia-2026-11-02.json");
  });

  it("planilha de fichas: várias fichas num arquivo só", () => {
    const csv = programsToCsv([program, { ...program, id: "p2", name: "Ficha B" }]);
    expect(csv.split("\r\n")).toHaveLength(1 + 4);
    expect(csv).toContain("Ficha B;A — Peito e tríceps;1;Supino reto com barra");
  });
});

describe("lembrete da cópia e convite para instalar", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  it("texto da linha de Conta", () => {
    expect(backupStatusText(null, now)).toBe("Você ainda não fez nenhuma cópia");
    expect(backupStatusText(ago(0.5), now)).toBe("Cópia de segurança: hoje");
    expect(backupStatusText(ago(1), now)).toBe("Cópia de segurança: há 1 dia");
    expect(backupStatusText(ago(12), now)).toBe("Cópia de segurança: há 12 dias");
  });

  it("Hoje e Alunos: só com 14 dias ou mais sem cópia e dados que doeria perder", () => {
    expect(backupReminderDue({ lastBackupAt: null, sessions: 4, realStudents: 0, now })).toBe(false);
    expect(backupReminderDue({ lastBackupAt: null, sessions: 5, realStudents: 0, now })).toBe(true);
    expect(backupReminderDue({ lastBackupAt: null, sessions: 0, realStudents: 1, now })).toBe(true);
    expect(backupReminderDue({ lastBackupAt: ago(13), sessions: 40, realStudents: 3, now })).toBe(false);
    expect(backupReminderDue({ lastBackupAt: ago(14), sessions: 40, realStudents: 0, now })).toBe(true);
  });

  it("nunca fez cópia: os 14 dias contam do início dos dados, não do primeiro dia", () => {
    // Personal que criou o painel há 2 dias e acabou de cadastrar o 1º aluno real: ainda sem aviso.
    expect(backupReminderDue({ lastBackupAt: null, since: ago(2), sessions: 0, realStudents: 1, now })).toBe(false);
    expect(backupReminderDue({ lastBackupAt: null, since: ago(13), sessions: 6, realStudents: 0, now })).toBe(false);
    expect(backupReminderDue({ lastBackupAt: null, since: ago(14), sessions: 0, realStudents: 1, now })).toBe(true);
    // Cópia feita vale mais que a data de início.
    expect(backupReminderDue({ lastBackupAt: ago(3), since: ago(90), sessions: 40, realStudents: 3, now })).toBe(false);
  });

  it("texto curto do celular: cabe em 1 linha com o 'Fazer agora'", () => {
    expect(backupStatusShort(null, now)).toBe("Nenhuma cópia ainda");
    expect(backupStatusShort(ago(0), now)).toBe("Última cópia hoje");
    expect(backupStatusShort(ago(1), now)).toBe("Última cópia há 1 dia");
    expect(backupStatusShort(ago(20), now)).toBe("Última cópia há 20 dias");
  });

  it("faixa de dias para a medição", () => {
    expect(backupAgeBucket(null, now)).toBe("nunca");
    expect(backupAgeBucket(ago(13), now)).toBe("0-13");
    expect(backupAgeBucket(ago(14), now)).toBe("14-30");
    expect(backupAgeBucket(ago(31), now)).toBe("31+");
  });

  it("convite dispensado volta uma única vez, 14 dias depois", () => {
    expect(promptShowsAgain(null, now)).toBe(true);
    expect(promptShowsAgain({ n: 1, at: ago(13) }, now)).toBe(false);
    expect(promptShowsAgain({ n: 1, at: ago(14) }, now)).toBe(true);
    expect(promptShowsAgain({ n: 2, at: ago(100) }, now)).toBe(false);
  });
});

describe("CREF do personal no link", () => {
  const withCref = { ...coach, cref: " 012345-G/SP " };
  it("vai no pacote (sem espaços), sem mudar a versão do link", async () => {
    const p = buildFichaPacket({ coach: withCref, student, program, diet, customExercises: [], customFoods: [] });
    expect(p.v).toBe(1);
    expect(TRANSFER_VERSION).toBe(1);
    expect(p.coach).toEqual({ id: "c1", name: "Rafael Nunes", phone: "11988887777", cref: "012345-G/SP" });
    expect(parsePacket(await unpackData(await packData(p)))).toEqual(p);
  });
  it("personal sem CREF: o campo nem aparece", () => {
    expect(buildFichaPacket({ coach: { ...coach, cref: "  " }, student, program, diet: null, customExercises: [], customFoods: [] }).coach).not.toHaveProperty("cref");
  });
  it("link antigo, sem CREF, continua abrindo", () => {
    const old = JSON.parse(JSON.stringify(buildFichaPacket({ coach, student, program, diet: null, customExercises: [], customFoods: [] })));
    delete old.coach.cref;
    expect(parsePacket(old)).not.toBeNull();
  });
  it("CREF absurdo (texto enorme) recusa o link", () => {
    const p = buildFichaPacket({ coach: { ...coach, cref: "x".repeat(200) }, student, program, diet: null, customExercises: [], customFoods: [] });
    expect(parsePacket(JSON.parse(JSON.stringify(p)))).toBeNull();
  });
  it("só campos de cadastro saem do link para o perfil: nada de consentimento, papel ou vínculo", () => {
    const p = buildFichaPacket({ coach, student, program, diet: null, customExercises: [], customFoods: [] });
    const forged = parsePacket(JSON.parse(JSON.stringify({ ...p, student: { ...p.student, consentHealthAt: "2026-01-01T00:00:00Z", consentSource: "personal", role: "coach", managedBy: "x", coachNotes: "y" } }))) as typeof p;
    expect(forged).not.toBeNull();
    const fields = studentFieldsOf(forged.student);
    expect(fields).toMatchObject({ name: "Marina Costa", sex: "F", weightKg: 62.5 });
    for (const k of ["consentHealthAt", "consentSource", "role", "managedBy", "coachNotes", "ref"]) expect(fields).not.toHaveProperty(k);
  });
});

describe("autorização de dados de saúde", () => {
  it("limitação, peso ou altura contam como dados de saúde; o resto não", () => {
    expect(hasHealthData({})).toBe(false);
    expect(hasHealthData({ limitations: "   " })).toBe(false);
    expect(hasHealthData({ limitations: "hérnia lombar" })).toBe(true);
    expect(hasHealthData({ weightKg: 72.5 })).toBe(true);
    expect(hasHealthData({ heightCm: 172 })).toBe(true);
  });
  it("checkbox marcado registra data e origem; marcado de novo mantém a autorização original", () => {
    const now = "2026-11-22T10:00:00.000Z";
    expect(consentFromCheckbox(null, true, "personal", now)).toEqual({ consentHealthAt: now, consentSource: "personal" });
    const prev = { consentHealthAt: "2026-10-01T00:00:00.000Z", consentSource: "aluno_link" as const };
    expect(consentFromCheckbox(prev, true, "personal", now)).toEqual(prev);
  });
  it("data carimbada sozinha por versões anteriores (aluno do personal ou ficha por link, sem origem) não vale", () => {
    const at = "2026-09-01T00:00:00.000Z";
    expect(consentConfirmed({ consentHealthAt: at, managedBy: "c1" })).toBe(false);
    expect(consentConfirmed({ consentHealthAt: at, remoteCoach: { id: "c9", name: "Camila", studentRef: "r1" } })).toBe(false);
    expect(consentConfirmed({ consentHealthAt: at, managedBy: "c1", consentSource: "personal" })).toBe(true);
    // Perfil próprio: a data só era gravada pelo checkbox, continua valendo.
    expect(consentConfirmed({ consentHealthAt: at })).toBe(true);
    expect(consentConfirmed({})).toBe(false);
    expect(consentConfirmed(null)).toBe(false);
    // Marcar de novo registra uma autorização nova, com origem.
    const now = "2026-11-22T10:00:00.000Z";
    expect(consentFromCheckbox({ consentHealthAt: at, managedBy: "c1" }, true, "personal", now)).toEqual({ consentHealthAt: now, consentSource: "personal" });
  });
  it("checkbox desmarcado retira a autorização", () => {
    expect(consentFromCheckbox({ consentHealthAt: "2026-10-01T00:00:00.000Z", consentSource: "personal" }, false, "personal", "x")).toEqual({ consentHealthAt: undefined, consentSource: undefined });
  });
  it("medição: sim, não ou sem dados de saúde (nunca o dado em si)", () => {
    expect(consentMetric({ weightKg: 80 }, true)).toBe("sim");
    expect(consentMetric({ weightKg: 80 }, false)).toBe("nao");
    expect(consentMetric({}, false)).toBe("sem_dados_saude");
  });
});
