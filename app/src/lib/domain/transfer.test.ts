import { describe, expect, it } from "vitest";
import { cameFromPaste, packData, packedFromHash, packedFromText, pastedLinkHref, unpackData } from "../share-link";
import { getExercise } from "./exercises";
import { backupAgeBucket, backupFileName, backupReminderDue, backupStatusShort, backupStatusText, buildBackup, programsToCsv, promptShowsAgain } from "./export";
import { parseBackup } from "./restauracao";
import { buildFichaPacket, buildTreinosPacket, consentConfirmed, fichaLinkMessage, consentFromCheckbox, consentMetric, hasHealthData, MAX_SESSIONS_PER_LINK, mergeMetric, mirrorLoads, parsePacket, sessionToText, studentFieldsOf, topLoads, TRANSFER_VERSION, treinosMessage, type FichaPacket, type TreinosPacket } from "./transfer";
import type { Anamnese } from "./anamnese-types";
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

  it("o que o gerador pré-preencheu (`sugerido`) fica no aparelho do personal e não vai no link", () => {
    const comSugerido: Program = { ...program, sugerido: { system: program.system, durationWeeks: 8 } };
    const p = buildFichaPacket({ coach, student, program: comSugerido, diet: null, customExercises: [], customFoods: [] });
    expect(p.program).not.toHaveProperty("sugerido");
    expect(p.program).toEqual(program);
    expect(comSugerido.sugerido).toEqual({ system: program.system, durationWeeks: 8 });
  });

  it("mensagem do envio por link: leva /abrir#d= e não leva o texto da ficha (§8.6)", async () => {
    const p = buildFichaPacket({ coach, student, program, diet, customExercises: customEx, customFoods: [] });
    const link = `https://shapereal.app/abrir#d=${await packData(p)}`;
    const msg = fichaLinkMessage({ studentFirstName: "Marina", coachSignature: "Rafael Nunes · CREF 012345-G/SP", hasProgram: true, hasDiet: true, link });
    expect(msg).toContain("/abrir#d=");
    expect(msg).toContain(link);
    expect(msg.startsWith("Oi, Marina! Sua ficha e sua dieta estão no Shape Real.")).toBe(true);
    expect(msg.endsWith("— Rafael Nunes · CREF 012345-G/SP")).toBe(true);
    // Nada do conteúdo da ficha nem da dieta no texto: nome da ficha, treinos, exercícios.
    const fora = msg.replace(link, "");
    for (const t of [program.name, ...program.days.map((d) => d.title), ...program.days.flatMap((d) => d.exercises.map((e) => e.name))]) expect(fora).not.toContain(t);
    expect(fichaLinkMessage({ studentFirstName: "Marina", hasProgram: false, hasDiet: true, link })).toMatch(/^Oi, Marina! Sua dieta está no Shape Real\. .*guardar e consultar quando quiser.*\n— seu personal$/s);
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
    // Sessão sem minutos ativos gravados (anterior à rodada 3): a duração registrada, rotulada assim (R3-4).
    expect(t.split("\n")[0]).toBe("*Treino A — Peito e tríceps · 20/11 · 52 min (início ao fim)*");
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
  it("respostas do questionário contam como dados de saúde, menos as enviadas sem saúde (healthOmitted)", () => {
    const anamnese: Anamnese = { v: 1, id: "r1", answeredAt: "2026-11-23T12:00:00.000Z", by: "aluno", via: "link", modulos: [], parqText: "sp-16724-2018", a: { nome: "Marina Costa" } };
    expect(hasHealthData({ anamnese })).toBe(true);
    expect(hasHealthData({ anamnese: { ...anamnese, healthOmitted: true } })).toBe(false);
    expect(hasHealthData({ anamnese: { ...anamnese, healthOmitted: true }, weightKg: 60 })).toBe(true);
    expect(hasHealthData({ anamnese: undefined })).toBe(false);
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

describe("o que vai no link da ficha (U2b)", async () => {
  const { fichaLinkItems } = await import("./transfer");
  const plan = (items: number): DietPlan => ({
    id: "d1",
    ownerId: "s1",
    createdBy: "c1",
    name: "Plano",
    targets: { kcal: 1650, proteinG: 120, carbsG: 180, fatG: 50 },
    meals: [{ uid: "m1", name: "Café", items: Array.from({ length: items }, (_, i) => ({ uid: `i${i}`, name: "Ovo", grams: 50, kcal: 70, proteinG: 6, carbsG: 0, fatG: 5 })) }],
    updatedAt: "2026-11-18T13:00:00.000Z",
  });
  it("a ficha ativa e a dieta salva (com itens, orientações ou metas); o resto não vai (e o registro de envio compara estes dois)", () => {
    const inactive = { ...program, id: "p0", active: false };
    expect(fichaLinkItems([inactive, program], plan(1))).toEqual({ program, diet: plan(1) });
    // U3c: sem itens, mas com metas, a dieta vai.
    expect(fichaLinkItems([inactive], plan(0))).toEqual({ program: null, diet: plan(0) });
    // Sem itens, sem orientações e sem metas: não há o que mandar.
    const blank = { ...plan(0), targets: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } };
    expect(fichaLinkItems([inactive], blank)).toEqual({ program: null, diet: null });
    expect(fichaLinkItems([], null)).toEqual({ program: null, diet: null });
  });
});

// ---- U2c: eco da versão no pacote de treinos ------------------------------------------------
/**
 * Links reais da versão anterior (ux/scripts/treino-msg.txt e ficha-msg.txt, gerados em 23/11 antes da U2c): o pacote
 * novo continua lendo os dois, e o de treinos chega sem eco (`ficha` undefined).
 */
const OLD_TREINOS_LINK = "1.jVHLbtQwFP2V6K7jkRN7Ese78hAqBYSgq1YVcuybGYvESW2najUaiY_gNyqxQ2LZ_glfgpwOFKEu2Nm-5-F7zg6uQBY5fLbOgITo0boxQA4BXTyKIKGkZUWKgpTslFLJhaTVirHmLGHibNDFD9glKoaIBK9J8Th5pwYECa_n3iqnsvdemRFy0KPS22PzhzShD6NT_WIbgh1dAHm-A5sgoli3qmoEWWtjCNeUkhZNQwrTNm3HhGImOc4B_SJJaVmta4qkK4uG8JZxIqpakE4IXXLRcCNayGHy48arYaGwumGadh0xja4IZ11FBK8rooqGd6ZoRFXjI-Ww1NGz5y-yV_39j4hjyO6-Zy8HtfGo7YAupi2NujnBm4R8uJza2CfisevQ29FjyH5--Zpdzsr4-1uNU8gw2xwElwyVj2ieKqGW62pFaZVKwGv02gZ8iGxeMms7zRTnnDBdC8JNVRPFuSEtY2qty5ILyv6iLiH0uPk0eQzJ2j2s-AY32fKU8fXdtxSys-k3HqeEmnrlHBqQOwgYA0iWL6O31oEUh7O6BlmUOfSjMicbkIKmQYgfUYNsaA4R9dbZyzkZutEPqod9fhA83_3Dm8KibEaHIKOfcZ8_BXFz3_9GdaoP_w272F_kcDX284AJWnGaak8_ucihs86G7dONCEnpqqzpGSSFAaO3eqHtfwE";
const OLD_FICHA_LINK = "1.vVrdiiQ3ln4VETDQhlSh_5-8627PGM-OZz3uAbOzmOJIOqoKd2REOiKyXG1j2IfYF_D6wnhgYG-WBV9Ovsk-yaLIzMrIqixXb7dnb4oKHUXkd6Tz850jfVvdVEu-qF7XbaqWVa7jNVSLasB2fD5Wy0owYSjnVMg_M7ZUdsnchTXuL9Wiih3E62r5bVWXN0ccRqRr7IeuhaZaVC2ssFpWn0EGbMgfNy0O1XeLahg3CduxvNdjvnsRbyk_vvT7TVNDC-TTHlI3wbmtltXvqkUV6n68_heEvlpy7_miusb66np8uaqW3OhF9fX0-E9X1dLIC7GoII71TT2-qZbVqku4_95VB021rHAFVz3GeoXtWIYbvMEyXrcj9itMNfR1GU_wZvgU-88RX1dLVeAMQ921n9TtZsShWhq2qPCrTb1eTZpVECHhqoai77rvrnpY3a2TtF5GljNNPhqqZDbUKWsocK9y4t4Zi9Wi6r5usf843V-f2COMmF68-YUVf_7i5Yfko2b784jdQP7-3-S399Qc3gwjrgrOENNl3Wbs667H4f0Xpu2m9aief7U5vL0kmqzqlpRPDAQXpO3Iuq9XWPcdwVvs4_Zvse5I6kiqYUEEGbY_9TUOJCGBdd_d1ivY_rj9oSPPIvYRyrhmvyFIrP4NSUAi9FfwAYF2LC_BcPeBm-33TZ1guCAvyxRSt3WsoVkSHGLXXAPZrMgah458tUGSsL5FIkiPaxzr7Y_b_9pBGLrQA8EViZBg_-kL8qcNtKkjGeM19KQjY7fuCpYM9e00e-wKkiOYBekIrNdk2FxhjwQ2ZXGgv9gvYrX812-r11i29Xm1qMZ6bMpWfny3N-R__u3fyVcbSP32bxHXA0Fytd_ialHlLm7KN6ppRl0mlM1sNpP8i0U1LXQ94O6HNpMlgknZaSUoz0ZTxVSkTkKgyqkEPCHnWVTHVydjbPDqct3jMBzN7Q94RaYhovTf_3Ny1nGolnJR9bgePqnbaun2_8NtteSiPAzjK4zV0rNF1XSQir86tqhGjNdt_dWmfLft-hU01XeLA16TUPCMjLLsOFWoPXWORyplVlFy8BzUfbzY4A1E6C7X2NzUEY6wf1skO7tab3-ahCR2KxKg74E8u67XZLzuN8P4wVmVOHtMJ6uPOklxoZ_QKmRhmFZFDcWpckxRJ5iiGmIQIioNKd_X6hri65m_X0G8hsnZyF7yrnjVU3ugTNApFIzRSKpkSDQgAGVeCym0ZSLz-2hLMKx7uMTbEduh62eb8HInInPRGexijl3PsJuZ_YinVlrnZGzilhqWPFU2Zhp8QpqEYBASZ0LYx7BDSJvxLPSZ5F2Ry6dWPcmEGISn4IOnKnBBvWKSOtTeIedCRHYf-c75L1fw1aZuZ7j3iYG0QFbb7ycheRa7OuIjhv52i39ehWNG-GweVtddTxpI3cVMx2iCVUYGylAkqpyM1HthKAKylEEAiPjo7jy6Oe-9N09aFRofIbFIhVGMKiuB-uAFZZJ5yXMW1rj7uNfQjpu-r5truMTV5RqPyD89ikoaWW9_mu_UeyjymGt_UVTZZZ4Xs8zzarOeZ57YDSOUJLYKfVeST9iloXnu2c0p3GWaNJG1ac4j-SfEiCJrpCzyQJV0ngamGGXBW1TAY8wPIt96cwsJLnOP7ThftWmY5L5rR2gIBOxHIM_Wm6bBN2Q3-73i-JMeqhxamQx1sbC67JAGdJYqHXOGjMmGcF-XHldFl1Aow4wvT6NkGp0S0tjX2_9orzZN9x4KCPtkIkKNwguhqA46U-UtUi-kpiIrB8iM5cnfVyHhgO1N19zsuN7lNTQj9kdlPjyVT_rs5kxs81214U9thwteSB4UDeAVVU4I6o1E6lXILCAT4ReoQgMj9nNCPaMKe9lbKPJWTvnUnhgeYgoyUYYsURUdo4DaUonGI3gVuXoQXPpuiHCZ6h7HYlz9PC5-VmRkJzuynfdQgD-lQbISeJCMQtScKgGcOm6BJs8S8xqElQ9SF4TUreoWmsths57Df34QkIPgDG49wy3YDLeaWVC7aZonkHNntVNSUmVBUqUTp8FEpNnwlFXyAN48sKFhnBJShFXdXhfvrtvY1C2kk-S0F5I7YYnx-3fvlOKPKXWyGewtdFpUm7Yudemqbk8C_svHS411N4yH5_OlxmzG07WGkZlnE2IpcyVVwRka0GqaQgn5xgWZ4f5iDmM9JYD9sr0qj08Y7VsVGk8GcwAjjJaORsOQKqcThcwclZrJ4FDHwB8E8_uFxkPida7geDK1_zqsnQfuHBeOWpUTVSxbGqJxFJKxMmirpH3ghCsc4DI3eHtCrD7BAchx9B_GqrznTLtsaQo-UKWSoC4npEYGZNKhVukBG4RjHXQ5rOrx-nyJ1Hbk1V76D6MDzGvnlVWUh1JQQww0-JAoy4JbnzFY-6C03hN2dQnrru6GywgtNvuIcI-7K7KbM3nD3by3p_GPhkX5viweLKLgUVOhWOluCU-DVZmaJIKSXmoM6Uy430ye0zX1abDf7Nwl4a7zUTfFYaZp5MCa3tUCH-ND_wdds-ZKcciFsAqqXHEoEyVNTMaclLMeH8S0Q8XywLEOFcv_g28ZrhNLHqjkIVElI1BvuaLIhM_RacnEQ949q1hKb3jXRj1TsxyFvzb-Wd768PFCZY312M3qlLF_WKhMc-Z1ytj_YqGStfE2SUEtykBVAKTOOE6dSAjZiWjMg_A5bNZ12132OHb3SdirSUSK6CkO9utEI6GlTkEADY57qjRYCpEbGhxIFpVNKj1o2uzxHxjKQ2q_1-Juwq_G7cUT2tjkAXPMNCZV3K4UXaVssUlLl7iMZ5oh97n9ZYTQ_SLBPwSa9zHkJ0supSVjinHKIliqrOc0FMaZVBReSRtSfqDK3lYvY9fPSeWfD33hfc07ZYb9lHcm909r4FW2KK2nCoyliqtIARKnyhSBFlnAoxqU84tzGkzjs17s5--jwlO-EbKWWoVEUdtElVKO-uiROmfBByWyzOcS1r4-qdt8vj6ZBOQZHg0rIVlj38LwSH7-tcoW7xgKayRNXuoSrCwNjGlqbBLKgHf-oXuEOtaxKfUi9lfdCssOzdR6cRCTSbz96SB_WKgI9pga71KofLE_v8NqOfYbXFRDt-ljeWF26rU_Ejt3WmmWSl0wy8tp5Wadnpjm_lLO61KN491hnTfSeG8cVbz8cdJRYDHQbKXDxC23GN_vsO4l9Gn7_bruSIChdLRG6K-mZf22eh3LYRw3mk3HiCPW7UfF8M2iitCHoTxYsagyjB9VS80X1ZgQy7pr-92iWiE0J_02kXOSDmmKzFOFqGiIKlGOmEX2whtu5sDy9qdypLWC9nr7w5RxJwGzS1YsqB5xNf88Q8ujYJKGqb2O1tJgjafMBq4y5ylqNWXhLu0pRXeZe2gjzg6TPi2uMo1u_zqVlT2UHykrsF-N08VQx6UQ_kIe1oJfmJlHlL4yz4YGKRRVGRN1kUlqsgGZY5YwRdk7YN3NLDX8803JbN_Uu2Pj-2isnIMxF_YIhx3RqAs3Q8NNNJlJyk2JmNEDdZg11VFjQBNZDHGOZrWJ0GMzc8c_bbD-siOrzfbHg2QPTN4B8_4UmJsD8wdgdr5MGrOT1gnqowOqDHM0RM-mEsZLY3OSMAcWoIV5fftieibrHsYZJHsHyZxAmlDcWbG7uDNjdsFnVFUYJr2X1HtdmusMqAvIaYjOeJTCG6_nmCJkvG_CA65IicE_R-iPuDg7rtUprtke8pL_jrC-mKUNbrVwDKjUGakCKymADNQzGR1TzjufZnmhWXXbH7ujD3GxlOd8SGeRvEiKppgmfRV1zDOqWNTWQiglx1xf6Pvum8tQ_GVms8_LKNmNPjBeftwRwd2JLxWLPaiubLGZg-5yZibGWy3RUqZ5yS8qUg-oqFdJKDQ5w1Ta3kHMWH8J3WUsNwbmSeV3WH9ZnH0veIDT6zsnE6co5-FPHI2ZXejZaZLjCoRTNIiJjXBLg2aZam9FCiayBCdeVkLOVWne7CqDQzQqjyVz78TkqsfmGuYo3TEwCTuHKfQcJzuAFHMTyjpAUlQ4iVQFbajD6KnwkmvLjfLo5hAHaE7aiK-m5wlducwwkGfQZIi4IP3257hp4IMjTHOMWKfGPosL_KwHYlJCCRapVoZTpRAoWKeosjrpwFPMjJ9Y5DdYz09mnk_PBWXX1DfzwHAXF062l51ZNDv3vByQBxUTldqUYkZnCk54agRi4EEJyWc__wdo4zWWNDZCn3DmgeZ8FsOcDXeWUcUDUmUMUBeTpSkZJhPzRiYz17furjb9iJctjJuTQ4OPdwKyF5BydeZqN-OhJ7qTbZlFIHkMjHq-LSwGkQqLMbY0mCIGGkRpr5povDAxSnGS0-AGT3or5bGcL-ami91wLoPw-8FBzFLt0Z7nGcR40CwnS4MRprTNHQ06eRp4sqg548qHOaivr_HNEdPn1_iG7H-QxK6N2I79ibPNwIkTFiDmNOBCHVmAm1uOAWUhQ6CpXLpSmnPqIzqKSrOkZIDsZ_zn91Du5xwNRrDzBqNZdk5JpDxlRpVJjHrQgQaQzmWNnDt9mjZHGOEydRHnubMM0jK4C4QzR-Ez8sPNozlU2BJwDh48izMRtEscLbUxGaqSK93soKlm3nomUVtgp7xsrNvrk_bONHAm-vkjMn9iwVLMc8mdtZi5tbAEJiIE6l05ZNGW0yClpTlwZzMLPDI_x9Xg1WaFpxePysA-cwzk2aq-_eBshpf6xFqOyOwFP5vksnEu8GRoyoXLulIQMrQ0a5Uyc15p7t8p6vGjy7unwh5nuxLo0JA8lgoJSY8Z--1f21jDBfm0S6XT1UXoy502aPbHraVr2W3Gfrpdt8Jh1ZGxXnfk2cQbJvHOHEm3ISuI0PfbH7rFId0VeYS-RVKuA8KiNNduscztbrrhg1IZjFiuwUHpz7ZjnSDhBXmBAcjdVT2pyaop_2y_v9rA9M3XV7tqeOgIdKTpym_trv9dvE2h5sRUqM07dV_s9mL697v_BQ";

describe("eco da versão no pacote de treinos (U2c)", async () => {
  const { receivedVersions } = await import("./transfer");
  const echo = { programAt: "2026-11-10T13:00:00.000Z", dietAt: "2026-11-10T14:00:00.000Z" };
  const treinos = (ficha?: { programAt?: string; dietAt?: string } | null) => buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: [session("a", 20)], ficha, now: new Date("2026-11-22T10:00:00Z") });

  it("pacote com ficha vai e volta igual pelo link, com TRANSFER_VERSION 1", async () => {
    const p = treinos(echo);
    expect(TRANSFER_VERSION).toBe(1);
    expect(p.v).toBe(1);
    expect(p.ficha).toEqual(echo);
    const back = parsePacket(await unpackData(await packData(p))) as TreinosPacket | null;
    expect(back?.ficha).toEqual(echo);
    expect(back?.v).toBe(1);
    // Igual ao pacote, a menos dos nulos das séries (o link sempre os tira).
    expect(back).toEqual(parsePacket(JSON.parse(JSON.stringify(p))));
  });

  it("sem ficha informada (ou sem nenhuma versão), o campo não existe", () => {
    for (const f of [undefined, null, {}, { programAt: "" }]) {
      const p = treinos(f);
      expect(p).not.toHaveProperty("ficha");
      expect(parsePacket(JSON.parse(JSON.stringify(p)))).not.toHaveProperty("ficha");
    }
    expect(treinos({ dietAt: echo.dietAt }).ficha).toEqual({ dietAt: echo.dietAt });
  });

  it("campo futuro na raiz é aceito e descartado, nos dois tipos de pacote (o app antigo lendo o link novo)", () => {
    const t = parsePacket({ ...JSON.parse(JSON.stringify(treinos(echo))), recibo: { ids: ["x"] } });
    expect(t?.kind).toBe("treinos");
    expect(t).not.toHaveProperty("recibo");
    const f = parsePacket({ ...JSON.parse(JSON.stringify(buildFichaPacket({ coach, student, program, diet, customExercises: [], customFoods: [] }))), received: { ids: ["x"] } });
    expect(f?.kind).toBe("ficha");
    expect(f).not.toHaveProperty("received");
  });

  it("ficha malformada: o pacote é aceito e a ficha fica undefined (a versão é acessória)", () => {
    const raw = JSON.parse(JSON.stringify(treinos(null)));
    for (const bad of [3, "2026-11-10", [echo.programAt], null, { programAt: "x".repeat(50) }, { programAt: 20261110 }]) {
      const p = parsePacket({ ...raw, ficha: bad });
      expect(p?.kind).toBe("treinos");
      expect((p as TreinosPacket).ficha).toBeUndefined();
      expect(p).not.toHaveProperty("ficha");
      expect((p as TreinosPacket).sessions).toHaveLength(1);
    }
    // Chave extra dentro do bloco: descartada, o resto vale.
    expect((parsePacket({ ...raw, ficha: { ...echo, recibo: 1 } }) as TreinosPacket).ficha).toEqual(echo);
  });

  it("link de treinos da versão anterior abre, sem eco", async () => {
    const p = parsePacket(await unpackData(OLD_TREINOS_LINK)) as TreinosPacket | null;
    expect(p?.kind).toBe("treinos");
    expect(p!.ficha).toBeUndefined();
    expect(p!.coachId).toBe("teste-personal");
    expect(p!.sessions.map((s) => s.exercises[0]!.name)).toEqual(["Leg press 45°"]);
  });

  it("link de ficha da versão anterior abre; a versão recebida vem do updatedAt do personal no pacote", async () => {
    const p = parsePacket(await unpackData(OLD_FICHA_LINK)) as FichaPacket | null;
    expect(p?.kind).toBe("ficha");
    expect(p!.program?.updatedAt).toBeTruthy();
    expect(receivedVersions(p!, undefined)).toEqual({ programAt: p!.program!.updatedAt, dietAt: p!.diet!.updatedAt });
  });

  describe("receivedVersions (aparelho do aluno, ao salvar a ficha)", () => {
    const pk = (over: Partial<FichaPacket> = {}) => ({ ...buildFichaPacket({ coach, student, program, diet, customExercises: [], customFoods: [] }), ...over });
    const prev = { id: "c1", name: "Rafael Nunes", studentRef: "s1", recebido: { programAt: "2026-10-01T10:00:00.000Z", dietAt: "2026-10-02T10:00:00.000Z" } };
    it("vem do pacote (o updatedAt do personal), não da hora local", () => {
      expect(receivedVersions(pk(), undefined)).toEqual({ programAt: program.updatedAt, dietAt: diet.updatedAt });
      expect(receivedVersions(pk(), prev)).toEqual({ programAt: program.updatedAt, dietAt: diet.updatedAt });
    });
    it("item que não veio mantém a versão anterior com o mesmo personal", () => {
      expect(receivedVersions(pk({ diet: null }), prev)).toEqual({ programAt: program.updatedAt, dietAt: "2026-10-02T10:00:00.000Z" });
      expect(receivedVersions(pk({ program: null }), prev)).toEqual({ programAt: "2026-10-01T10:00:00.000Z", dietAt: diet.updatedAt });
    });
    it("outro personal recomeça; data ilegível não vira versão; nada conhecido → null", () => {
      expect(receivedVersions(pk({ diet: null }), { ...prev, id: "c9" })).toEqual({ programAt: program.updatedAt });
      expect(receivedVersions(pk({ diet: null, program: { ...program, updatedAt: "ontem" } }), undefined)).toBeNull();
      expect(receivedVersions(pk({ diet: null, program: null }), undefined)).toBeNull();
    });
  });
});
