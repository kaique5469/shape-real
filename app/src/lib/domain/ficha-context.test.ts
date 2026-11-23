import { describe, expect, it } from "vitest";
import { fichaCoach, fichaKind, fichaReplaceNotice, programAdjustedNote, shouldMarkAdjusted, SOLO_TESTER_ID, type FichaKind } from "./ficha-context";

const coach = { id: "c1", role: "coach" as const };
const aluna = { id: "s1", role: "athlete" as const };
const fullDay = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};
const shortDay = (iso: string) => fullDay(iso).slice(0, 5);

describe("fichaKind (K1 a K5)", () => {
  it("K1: personal vendo como aluno → como_aluno, antes de qualquer outra regra", () => {
    expect(fichaKind({ viewer: aluna, program: { ownerId: "s1", createdBy: "c1" }, returnTo: { id: "c1" } })).toBe("como_aluno");
    expect(fichaKind({ viewer: aluna, program: { ownerId: "s1", createdBy: "s1" }, returnTo: { id: "c1" } })).toBe("como_aluno");
  });

  it("K1 não vale no modo 'aluno sem personal' (também liga returnTo) → propria", () => {
    expect(SOLO_TESTER_ID).toBe("teste-solo");
    const solo = { id: SOLO_TESTER_ID, role: "athlete" as const };
    expect(fichaKind({ viewer: solo, program: { ownerId: SOLO_TESTER_ID, createdBy: SOLO_TESTER_ID }, returnTo: { id: "teste-personal" } })).toBe("propria");
  });

  it("K2: ficha do próprio personal → modelo", () => {
    expect(fichaKind({ viewer: coach, program: { ownerId: "c1", createdBy: "c1" }, returnTo: null })).toBe("modelo");
  });

  it("K3: personal com ficha de outra pessoa → aluno, mesmo sem o aluno carregado", () => {
    expect(fichaKind({ viewer: coach, program: { ownerId: "s1", createdBy: "c1" }, returnTo: null })).toBe("aluno");
    expect(fichaKind({ viewer: coach, program: { ownerId: "desconhecido", createdBy: "outro" }, returnTo: null })).toBe("aluno");
  });

  it("K4: aluno com ficha montada por outra pessoa → recebida", () => {
    expect(fichaKind({ viewer: aluna, program: { ownerId: "s1", createdBy: "c1" }, returnTo: null })).toBe("recebida");
  });

  it("K5: ficha da própria pessoa, inclusive a cópia que o aluno fez da ficha do personal → propria", () => {
    expect(fichaKind({ viewer: aluna, program: { ownerId: "s1", createdBy: "s1" }, returnTo: null })).toBe("propria");
  });
});

describe("fichaCoach (quem montou a ficha recebida)", () => {
  it("personal atual: nome do remoteCoach e current", () => {
    expect(fichaCoach({ createdBy: "c1", remoteCoach: { id: "c1", name: " Rafael Nunes " } })).toEqual({ full: "Rafael Nunes", first: "Rafael", current: true });
  });

  it("personal anterior: nome do perfil local de quem montou, sem current", () => {
    expect(fichaCoach({ createdBy: "c0", remoteCoach: { id: "c1", name: "Rafael Nunes" }, creator: { id: "c0", role: "coach", name: "Camila Duarte" } })).toEqual({ full: "Camila Duarte", first: "Camila", current: false });
  });

  it("sem nome conhecido (perfil que não é personal, outro id ou nome provisório) → null", () => {
    expect(fichaCoach({ createdBy: "c0", creator: { id: "c0", role: "athlete", name: "Ana" } })).toEqual({ full: null, first: null, current: false });
    expect(fichaCoach({ createdBy: "c0", creator: { id: "c9", role: "coach", name: "Ana" } }).full).toBeNull();
    expect(fichaCoach({ createdBy: "c1", remoteCoach: { id: "c1", name: "Personal" } })).toEqual({ full: null, first: null, current: true });
    expect(fichaCoach({ createdBy: "c1" })).toEqual({ full: null, first: null, current: false });
  });
});

describe("shouldMarkAdjusted", () => {
  it("só a ficha recebida, no modo local", () => {
    const kinds: FichaKind[] = ["modelo", "aluno", "propria", "recebida", "como_aluno"];
    expect(kinds.filter((k) => shouldMarkAdjusted(k, "local"))).toEqual(["recebida"]);
    expect(kinds.filter((k) => shouldMarkAdjusted(k, "supabase"))).toEqual([]);
  });
});

describe("programAdjustedNote (impressão da ficha ajustada pela aluna)", () => {
  it("com nome: data completa e o nome do personal, sem CREF", () => {
    const note = programAdjustedNote({ adjustedAt: "2026-11-24T15:00:00Z" }, "Rafael Nunes", fullDay);
    expect(note).toBe("Ajustada em 24/11/2026 a partir da ficha de Rafael Nunes.");
    expect(note).not.toMatch(/CREF/);
    expect(note).not.toMatch(/^Rafael Nunes/);
  });

  it("sem nome: '… da ficha do seu personal'", () => {
    expect(programAdjustedNote({ adjustedAt: "2026-11-24T15:00:00Z" }, null, fullDay)).toBe("Ajustada em 24/11/2026 a partir da ficha do seu personal.");
    expect(programAdjustedNote({ adjustedAt: "2026-11-24T15:00:00Z" }, "  ", fullDay)).toBe("Ajustada em 24/11/2026 a partir da ficha do seu personal.");
  });

  it("ficha não ajustada → null (a assinatura de sempre continua)", () => {
    expect(programAdjustedNote({}, "Rafael Nunes", fullDay)).toBeNull();
  });
});

describe("fichaReplaceNotice (/abrir antes de atualizar)", () => {
  const local = { id: "p1", adjustedAt: "2026-11-24T15:00:00Z" };

  it("mesmo id e ficha ajustada aqui → avisa que a nova substitui os ajustes", () => {
    expect(fichaReplaceNotice(local, "p1", "Rafael", shortDay)).toBe("Você ajustou a ficha em 24/11. A ficha nova de Rafael substitui esses ajustes. Se quiser manter algo, combine com Rafael antes de atualizar.");
  });

  it("sem nome do personal: 'do seu personal' / 'com o seu personal'", () => {
    expect(fichaReplaceNotice(local, "p1", null, shortDay)).toBe("Você ajustou a ficha em 24/11. A ficha nova do seu personal substitui esses ajustes. Se quiser manter algo, combine com o seu personal antes de atualizar.");
  });

  it("outro id: a ficha ajustada continua no aparelho (inativa) → sem aviso", () => {
    expect(fichaReplaceNotice(local, "p2", "Rafael", shortDay)).toBeNull();
  });

  it("sem ajuste, sem ficha local ou sem ficha no link → sem aviso", () => {
    expect(fichaReplaceNotice({ id: "p1" }, "p1", "Rafael", shortDay)).toBeNull();
    expect(fichaReplaceNotice(null, "p1", "Rafael", shortDay)).toBeNull();
    expect(fichaReplaceNotice(local, null, "Rafael", shortDay)).toBeNull();
  });
});

describe("textos", () => {
  it("sem pronome de gênero nem afirmação de entrega", () => {
    const texts = [
      programAdjustedNote({ adjustedAt: "2026-11-24T15:00:00Z" }, "Rafael Nunes", fullDay),
      programAdjustedNote({ adjustedAt: "2026-11-24T15:00:00Z" }, null, fullDay),
      fichaReplaceNotice({ id: "p1", adjustedAt: "2026-11-24T15:00:00Z" }, "p1", "Rafael", shortDay),
      fichaReplaceNotice({ id: "p1", adjustedAt: "2026-11-24T15:00:00Z" }, "p1", null, shortDay),
    ];
    for (const t of texts) {
      expect(t).toBeTruthy();
      expect(t).not.toMatch(/\bdel[ea]\b|chegou|enviada para/i);
    }
  });
});
