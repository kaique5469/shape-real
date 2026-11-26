import { describe, expect, it } from "vitest";
import { coachSignature, cloneProgram, crefLabel, crefLooksValid, focusOfDay, maskCref, nextDayKey, normalizeCref, programSetsPerGroup, programToText, signerFor, techniqueText } from "./program-share";
import { maskPhone, waPhone } from "./format";
import type { Profile, Program } from "./types";

const program: Program = {
  id: "p1",
  ownerId: "u1",
  createdBy: "c1",
  name: "ABC Hipertrofia",
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  durationWeeks: 6,
  notes: "Aqueça 5 min antes.",
  active: true,
  source: "personal",
  createdAt: "2026-01-01T10:00:00Z",
  updatedAt: "2026-01-01T10:00:00Z",
  days: [
    {
      key: "A",
      title: "Peito e tríceps",
      focus: ["peito", "triceps"],
      exercises: [
        { uid: "1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: 4, repsMin: 6, repsMax: 8, restSec: 120, loadKg: 80, technique: "normal" },
        { uid: "2", exerciseId: "triceps_corda", name: "Tríceps na corda", sets: 3, repsMin: 10, repsMax: 12, restSec: 60, loadKg: 22.5, technique: "drop_set", notes: "Cotovelos colados" },
        { uid: "3", exerciseId: "prancha", name: "Prancha", sets: 3, repsMin: 30, repsMax: 45, restSec: 45, technique: "normal" },
      ],
    },
    { key: "B", title: "", focus: [], exercises: [] },
  ],
};

describe("ficha em texto para WhatsApp", () => {
  const text = programToText(program, { studentName: "Ana Souza", coachName: "Carlos" });
  it("traz cabeçalho, validade e quem enviou", () => {
    expect(text.split("\n")[0]).toBe("*ABC Hipertrofia*");
    expect(text.split("\n")[1]).toBe("Aluno: Ana Souza");
    expect(text).toContain("Validade: 6 semanas");
    expect(text).not.toContain("Personal:");
  });
  it("formata cada exercício com esquema, carga e descanso", () => {
    expect(text).toContain("1. Supino reto com barra — 4 × 6–8 · 80 kg · desc. 2:00");
    expect(text).toContain("2. Tríceps na corda — 3 × 10–12 · 22,5 kg · desc. 1:00");
  });
  it("mostra técnica e observação na linha seguinte", () => {
    expect(text).toMatch(/Tríceps na corda[^\n]*\n {3}Drop-?set[^\n]*Cotovelos colados/i);
  });
  it("respeita a unidade (segundos) e não envia treino vazio", () => {
    expect(text).toContain("3. Prancha — 3 × 30–45 s · desc. 45s");
    expect(text).not.toContain("*B*");
  });
  it("bi-set: o primeiro diz 'com o próximo' e o segundo 'com o anterior'", () => {
    const list = [{ technique: "normal" }, { technique: "bi_set" }, { technique: "bi_set" }, { technique: "tri_set" }, { technique: "tri_set" }, { technique: "tri_set" }, { technique: "drop_set" }] as const;
    expect(techniqueText([...list], 0)).toBeNull();
    expect(techniqueText([...list], 1)).toBe("Bi-set com o próximo");
    expect(techniqueText([...list], 2)).toBe("Bi-set com o anterior");
    expect(techniqueText([...list], 3)).toBe("Tri-set com os próximos");
    expect(techniqueText([...list], 4)).toBe("Tri-set em sequência");
    expect(techniqueText([...list], 5)).toBe("Tri-set com os anteriores");
    expect(techniqueText([...list], 6)).toMatch(/Drop-set/);
    // Só o primeiro marcado: continua "com o próximo".
    expect(techniqueText([{ technique: "bi_set" }, { technique: "normal" }], 0)).toBe("Bi-set com o próximo");
  });
  it("termina com as orientações e a assinatura do personal, sem emoji", () => {
    expect(text.trim().endsWith("Aqueça 5 min antes.\n\nCarlos")).toBe(true);
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
    // Sem personal (quem treina sozinho), termina nas orientações.
    expect(programToText(program).trim().endsWith("Aqueça 5 min antes.")).toBe(true);
  });
  it("com CREF, a assinatura é 'Nome · CREF …'", () => {
    const signed = programToText(program, { studentName: "Ana Souza", coachName: "Camila Duarte", coachCref: "012345-G/SP" });
    expect(signed.split("\n").at(-1)).toBe("Camila Duarte · CREF 012345-G/SP");
    expect(signed.match(/CREF/g)).toHaveLength(1);
  });
});

describe("nome e CREF do personal", () => {
  it("máscara tolerante: monta 000000-G/UF enquanto digita", () => {
    expect(maskCref("0123")).toBe("0123");
    expect(maskCref("012345")).toBe("012345");
    expect(maskCref("012345g")).toBe("012345-G");
    expect(maskCref("012345gs")).toBe("012345-G/S");
    expect(maskCref("012345gsp")).toBe("012345-G/SP");
    expect(maskCref("012345-G/SP")).toBe("012345-G/SP");
    expect(maskCref("012345 g sp")).toBe("012345-G/SP");
    // Apagar o último caractere não deixa separador pendurado.
    expect(maskCref("012345-G/")).toBe("012345-G");
    expect(maskCref("012345-")).toBe("012345");
  });
  it("tira o 'CREF' colado na frente, mas não destrói o que foge do formato", () => {
    expect(maskCref("CREF 012345-G/SP")).toBe("012345-G/SP");
    expect(maskCref("cref: 012345gsp")).toBe("012345-G/SP");
    expect(maskCref("CREF")).toBe("CREF");
    expect(maskCref("1234567")).toBe("1234567");
    expect(maskCref("CREF4/SP 012345-G")).toBe("CREF4/SP 012345-G");
    expect(maskCref("x".repeat(40))).toHaveLength(24);
  });
  it("normaliza para guardar e avisa (sem bloquear) fora do formato", () => {
    expect(normalizeCref(" 012345gsp ")).toBe("012345-G/SP");
    expect(normalizeCref("")).toBeUndefined();
    expect(normalizeCref("   ")).toBeUndefined();
    expect(crefLooksValid("012345-G/SP")).toBe(true);
    expect(crefLooksValid("012345-P/RJ")).toBe(true);
    expect(crefLooksValid("12345-G/SP")).toBe(false);
    expect(crefLooksValid("012345-G/XX")).toBe(false);
    expect(crefLooksValid("012345-G")).toBe(false);
    expect(crefLooksValid(undefined)).toBe(false);
  });
  it("assinatura única: 'Nome · CREF …' ou só o nome", () => {
    expect(coachSignature({ name: "Camila Duarte", cref: "012345-G/SP" })).toBe("Camila Duarte · CREF 012345-G/SP");
    expect(coachSignature({ name: " Camila Duarte ", cref: "  " })).toBe("Camila Duarte");
    expect(coachSignature({ name: "Camila", cref: "CREF4/SP 012345-G" })).toBe("Camila · CREF4/SP 012345-G");
    expect(coachSignature({ name: "", cref: "012345-G/SP" })).toBeUndefined();
    expect(coachSignature(null)).toBeUndefined();
  });
  it("rótulo do CREF (o mesmo da assinatura e do Hoje): não dobra o 'CREF' digitado", () => {
    expect(crefLabel("012345-G/SP")).toBe("CREF 012345-G/SP");
    expect(crefLabel(" cref 012345-G/SP ")).toBe("cref 012345-G/SP");
    expect(crefLabel("  ")).toBeNull();
    expect(crefLabel(undefined)).toBeNull();
  });
  it("texto da ficha fecha com 'Nome · CREF …' quando o personal informou o CREF", () => {
    const text = programToText(program, { coachName: "Camila Duarte", coachCref: "012345-G/SP" });
    expect(text.trim().split("\n").at(-1)).toBe("Camila Duarte · CREF 012345-G/SP");
  });
  it("quem assina: o personal logado, ou no celular do aluno o personal que enviou", () => {
    const coach = { role: "coach", name: "Camila Duarte", cref: "012345-G/SP" } as Profile;
    expect(signerFor(coach)).toEqual({ name: "Camila Duarte", cref: "012345-G/SP" });
    expect(signerFor({ ...coach, name: "Personal" })).toBeNull();
    const aluno = { role: "athlete", name: "Ana", remoteCoach: { id: "c1", name: "Camila Duarte", cref: "012345-G/SP", studentRef: "s1" } } as Profile;
    expect(signerFor(aluno, "c1")).toEqual({ name: "Camila Duarte", cref: "012345-G/SP" });
    // Ficha montada pela própria pessoa: ninguém assina.
    expect(signerFor(aluno, "outro")).toBeNull();
    expect(signerFor({ ...aluno, remoteCoach: undefined }, "c1")).toBeNull();
    expect(signerFor(null)).toBeNull();
  });
});

describe("cópia e resumo da ficha", () => {
  it("clona com ids novos e aplica o patch", () => {
    const c = cloneProgram(program, { ownerId: "u2", active: false, name: "Cópia" });
    expect(c.id).not.toBe(program.id);
    expect(c.ownerId).toBe("u2");
    expect(c.days[0]!.exercises[0]!.uid).not.toBe("1");
    expect(c.days[0]!.exercises).toHaveLength(3);
    c.days[0]!.exercises[0]!.sets = 9;
    expect(program.days[0]!.exercises[0]!.sets).toBe(4);
  });
  it("a cópia não leva o ajuste da original (adjustedAt)", () => {
    const adjusted = { ...program, adjustedAt: "2026-11-20T10:00:00.000Z" };
    const c = cloneProgram(adjusted, { ownerId: "u2", createdBy: "u2", active: false });
    expect("adjustedAt" in c).toBe(false);
    expect(adjusted.adjustedAt).toBe("2026-11-20T10:00:00.000Z");
  });
  it("soma séries diretas por grupo", () => {
    const rows = programSetsPerGroup(program);
    expect(rows.find((r) => r.group === "peito")?.sets).toBe(4);
    expect(rows.find((r) => r.group === "triceps")?.sets).toBe(3);
  });
  it("deriva o foco do dia e a próxima letra", () => {
    expect(focusOfDay(program.days[0]!).slice(0, 2)).toEqual(["peito", "triceps"]);
    expect(nextDayKey(program.days)).toBe("C");
  });
});

describe("telefone do aluno", () => {
  it("formata enquanto digita", () => {
    expect(maskPhone("11")).toBe("11");
    expect(maskPhone("119123")).toBe("(11) 9123");
    expect(maskPhone("1132345678")).toBe("(11) 3234-5678");
    expect(maskPhone("11912345678")).toBe("(11) 91234-5678");
  });

  it("aceita número colado do WhatsApp, com +55 ou zero antes do DDD", () => {
    expect(maskPhone("+55 11 91234-5678")).toBe("(11) 91234-5678");
    expect(maskPhone("5511912345678")).toBe("(11) 91234-5678");
    expect(maskPhone("011 91234-5678")).toBe("(11) 91234-5678");
    expect(maskPhone("+55 (11) 3234-5678")).toBe("(11) 3234-5678");
    // DDD 55 (RS) sem código do país continua sendo DDD
    expect(maskPhone("55991234567")).toBe("(55) 99123-4567");
  });

  it("o link do WhatsApp sai com um único 55", () => {
    const digits = maskPhone("+55 11 91234-5678").replace(/\D/g, "");
    expect(waPhone(digits)).toBe("5511912345678");
  });

  it("rótulo segue o cadastro: Aluna ou Aluno", () => {
    expect(programToText(program, { studentName: "Juliana Prado", studentLabel: "Aluna" })).toContain("Aluna: Juliana Prado");
    expect(programToText(program, { studentName: "Rafael" })).toContain("Aluno: Rafael");
  });
});
