import { describe, expect, it } from "vitest";
import {
  editDuration,
  editorWidth,
  fichaCoach,
  fichaContextText,
  fichaKind,
  fichaReplaceNotice,
  newFichaMessage,
  postSaveNextStep,
  postSaveTitle,
  programAdjustedNote,
  sendReady,
  shouldMarkAdjusted,
  showEditorDeliveryLine,
  SOLO_TESTER_ID,
  type AppMode,
  type FichaContextInput,
  type FichaKind,
} from "./ficha-context";

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

// ---- U5b: cabeçalho e fechamento do editor ------------------------------------------------------------

const KINDS: FichaKind[] = ["modelo", "aluno", "propria", "recebida", "como_aluno"];
const ADJ = "2026-11-24T15:00:00Z";
const ctx = (over: Partial<FichaContextInput> = {}): FichaContextInput => ({
  kind: "aluno",
  mode: "local",
  program: { active: true },
  studentFirst: "Juliana",
  coachFirst: "Rafael",
  currentCoach: true,
  ...over,
});
const text = (over: Partial<FichaContextInput> = {}) => fichaContextText(ctx(over), shortDay);

describe("fichaContextText (título e nota do cabeçalho)", () => {
  it("títulos dos 5 tipos, com e sem nome", () => {
    expect(text({ kind: "aluno" }).title).toBe("Ficha de Juliana");
    expect(text({ kind: "aluno", studentFirst: null }).title).toBe("Ficha do aluno");
    expect(text({ kind: "modelo" }).title).toBe("Modelo de ficha");
    expect(text({ kind: "propria" }).title).toBe("Sua ficha");
    expect(text({ kind: "recebida" }).title).toBe("Ficha montada por Rafael");
    expect(text({ kind: "recebida", coachFirst: null }).title).toBe("Ficha montada pelo seu personal");
    expect(text({ kind: "recebida", coachFirst: "Personal" }).title).toBe("Ficha montada pelo seu personal");
    expect(text({ kind: "como_aluno" }).title).toBe("Ficha de Juliana");
    expect(text({ kind: "como_aluno", studentFirst: null }).title).toBe("Ficha do aluno");
  });

  it("aluno e própria: nota só quando inativa", () => {
    expect(text({ kind: "aluno" }).note).toBeNull();
    expect(text({ kind: "aluno", program: { active: false } }).note).toBe("Inativa: Juliana continua com a ficha ativa até você tocar em “Tornar ativa”.");
    expect(text({ kind: "aluno", program: { active: false }, studentFirst: null }).note).toBe("Inativa: a ficha ativa continua valendo até você tocar em “Tornar ativa”.");
    expect(text({ kind: "propria" }).note).toBeNull();
    expect(text({ kind: "propria", program: { active: false } }).note).toBe("Inativa: sua ficha ativa continua valendo até você tocar em “Tornar ativa”.");
    // Nuvem: a mesma nota (é um fato do app, não do aparelho).
    expect(text({ kind: "aluno", mode: "supabase", program: { active: false } }).note).toMatch(/^Inativa: Juliana/);
  });

  it("modelo: aplicar cria uma cópia", () => {
    expect(text({ kind: "modelo" }).note).toBe("Aplicar a um aluno cria uma cópia. Mudar o modelo depois não muda as cópias já criadas.");
  });

  it("recebida, local, personal atual: sem e com ajuste", () => {
    expect(text({ kind: "recebida" }).note).toBe("O que você mudar aqui fica só neste celular e não aparece para Rafael. Se Rafael mandar uma ficha nova, ela passa a valer no lugar desta.");
    expect(text({ kind: "recebida", program: { active: true, adjustedAt: ADJ } }).note).toBe(
      "Você ajustou esta ficha em 24/11. Os ajustes ficam só neste celular e não aparecem para Rafael. Se Rafael mandar uma ficha nova, ela passa a valer no lugar desta.",
    );
  });

  it("recebida sem nome: 'o seu personal'", () => {
    expect(text({ kind: "recebida", coachFirst: null }).note).toBe("O que você mudar aqui fica só neste celular e não aparece para o seu personal. Se o seu personal mandar uma ficha nova, ela passa a valer no lugar desta.");
  });

  it("recebida de quem não é o personal atual, ou inativa: só a primeira frase", () => {
    expect(text({ kind: "recebida", currentCoach: false }).note).toBe("O que você mudar aqui fica só neste celular e não aparece para Rafael.");
    expect(text({ kind: "recebida", currentCoach: false, program: { active: true, adjustedAt: ADJ } }).note).toBe("Você ajustou esta ficha em 24/11. Os ajustes ficam só neste celular e não aparecem para Rafael.");
    expect(text({ kind: "recebida", program: { active: false } }).note).toBe("O que você mudar aqui fica só neste celular e não aparece para Rafael.");
  });

  it("recebida na nuvem: sem nota", () => {
    expect(text({ kind: "recebida", mode: "supabase" }).note).toBeNull();
    expect(text({ kind: "recebida", mode: "supabase", program: { active: true, adjustedAt: ADJ } }).note).toBeNull();
  });

  it("como aluno: o que muda é a ficha do aluno neste aparelho (a faixa já diz 'Vendo como')", () => {
    expect(text({ kind: "como_aluno" }).note).toBe("O que você mudar aqui muda a ficha de Juliana neste aparelho.");
    expect(text({ kind: "como_aluno", studentFirst: null }).note).toBe("O que você mudar aqui muda a ficha do aluno neste aparelho.");
  });
});

describe("showEditorDeliveryLine e sendReady", () => {
  const base = { kind: "aluno" as FichaKind, mode: "local" as AppMode, sample: false, active: true, dirty: false };
  it("linha de envio só para ficha ativa de aluno real, local e sem alteração pendente", () => {
    expect(showEditorDeliveryLine(base)).toBe(true);
    expect(showEditorDeliveryLine({ ...base, dirty: true })).toBe(false);
    expect(showEditorDeliveryLine({ ...base, active: false })).toBe(false);
    expect(showEditorDeliveryLine({ ...base, sample: true })).toBe(false);
    expect(showEditorDeliveryLine({ ...base, mode: "supabase" })).toBe(false);
    for (const kind of KINDS.filter((k) => k !== "aluno")) expect(showEditorDeliveryLine({ ...base, kind })).toBe(false);
  });

  it("sendReady exige exercícios", () => {
    const r = { kind: "aluno" as FichaKind, mode: "local" as AppMode, sample: false, active: true, hasExercises: true };
    expect(sendReady(r)).toBe(true);
    expect(sendReady({ ...r, hasExercises: false })).toBe(false);
    expect(sendReady({ ...r, active: false })).toBe(false);
    expect(sendReady({ ...r, sample: true })).toBe(false);
    expect(sendReady({ ...r, mode: "supabase" })).toBe(false);
    expect(sendReady({ ...r, kind: "como_aluno" })).toBe(false);
  });
});

describe("postSaveTitle", () => {
  it("local: 'neste aparelho' (personal, própria, como aluno) e 'neste celular' (recebida)", () => {
    expect(postSaveTitle("aluno", "local")).toBe("Ficha salva neste aparelho");
    expect(postSaveTitle("modelo", "local")).toBe("Modelo salvo neste aparelho");
    expect(postSaveTitle("propria", "local")).toBe("Ficha salva neste aparelho");
    expect(postSaveTitle("como_aluno", "local")).toBe("Ficha salva neste aparelho");
    expect(postSaveTitle("recebida", "local")).toBe("Ficha salva neste celular");
  });

  it("nuvem: sem lugar", () => {
    expect(postSaveTitle("aluno", "supabase")).toBe("Ficha salva");
    expect(postSaveTitle("recebida", "supabase")).toBe("Ficha salva");
    expect(postSaveTitle("modelo", "supabase")).toBe("Modelo salvo");
  });

  it("chegada do gerador", () => {
    expect(postSaveTitle("aluno", "local", { fromGenerator: true })).toBe("Ficha nova salva neste aparelho");
    expect(postSaveTitle("aluno", "supabase", { fromGenerator: true })).toBe("Ficha nova salva");
  });
});

describe("postSaveNextStep (o envio OU uma frase, nunca os dois)", () => {
  const step = (over: Partial<FichaContextInput> = {}, extra: { sample?: boolean; hasExercises?: boolean } = {}) =>
    postSaveNextStep({ ...ctx(over), sample: extra.sample ?? false, hasExercises: extra.hasExercises ?? true });

  it("aluno real, local, ativa, com exercícios → o envio", () => {
    expect(step()).toEqual({ send: true });
  });

  it("aluno: sem exercícios, inativa, nuvem e exemplo", () => {
    expect(step({}, { hasExercises: false })).toEqual({ text: "Adicione exercícios antes de enviar." });
    expect(step({ program: { active: false } })).toEqual({ text: "Inativa: Juliana continua com a ficha ativa até você tocar em “Tornar ativa”." });
    expect(step({ mode: "supabase" })).toEqual({ text: "A versão nova já está no app de Juliana." });
    expect(step({ mode: "supabase", studentFirst: null })).toEqual({ text: "A versão nova já está no app do aluno." });
    expect(step({}, { sample: true })).toBeNull();
    // Inativa vale também para o aluno de exemplo (é o que decide o que ele vê).
    expect(step({ program: { active: false } }, { sample: true })).toEqual({ text: "Inativa: Juliana continua com a ficha ativa até você tocar em “Tornar ativa”." });
  });

  it("modelo e própria", () => {
    expect(step({ kind: "modelo" })).toEqual({ text: "As cópias já criadas a partir deste modelo não mudam." });
    expect(step({ kind: "propria" })).toEqual({ text: "A ficha já aparece em Hoje." });
    expect(step({ kind: "propria", program: { active: false } })).toEqual({ text: "Inativa: sua ficha ativa continua valendo até você tocar em “Tornar ativa”." });
  });

  it("recebida: só com o personal atual, no modo local e ficha ativa", () => {
    expect(step({ kind: "recebida" })).toEqual({ text: "Estas mudanças não aparecem para Rafael. Se Rafael mandar uma ficha nova, ela passa a valer no lugar desta." });
    expect(step({ kind: "recebida", coachFirst: null })).toEqual({
      text: "Estas mudanças não aparecem para o seu personal. Se o seu personal mandar uma ficha nova, ela passa a valer no lugar desta.",
    });
    expect(step({ kind: "recebida", currentCoach: false })).toBeNull();
    expect(step({ kind: "recebida", mode: "supabase" })).toBeNull();
    expect(step({ kind: "recebida", program: { active: false } })).toBeNull();
  });

  it("como aluno: nada", () => {
    expect(step({ kind: "como_aluno" })).toBeNull();
  });
});

describe("newFichaMessage (?enviada=1)", () => {
  const msg = (over: Partial<FichaContextInput> = {}, extra: { sample?: boolean; hasExercises?: boolean } = {}) =>
    newFichaMessage({ ...ctx(over), sample: extra.sample ?? false, hasExercises: extra.hasExercises ?? true });

  it("aluno real, local, ativa com exercícios → barra com o envio", () => {
    expect(msg()).toEqual({ bar: true, text: "Revise se quiser e envie quando estiver pronta." });
    expect(postSaveTitle("aluno", "local", { fromGenerator: true })).toBe("Ficha nova salva neste aparelho");
  });

  it("demais casos: uma frase no topo", () => {
    expect(msg({ program: { active: false } })).toEqual({ text: "Ficha criada, ainda inativa: a ficha atual continua valendo até você tocar em “Tornar ativa”." });
    expect(msg({ mode: "supabase" })).toEqual({ text: "Ficha salva e ativa. Ela já está no app de Juliana." });
    expect(msg({}, { sample: true })).toEqual({ text: "Ficha salva e ativa. Revise os detalhes e envie pelo WhatsApp ou imprima." });
    expect(msg({}, { hasExercises: false })).toEqual({ text: "Ficha salva e ativa. Adicione exercícios antes de enviar." });
  });
});

describe("medição do editor (só categorias)", () => {
  it("editorWidth: larga a partir de 1024 px", () => {
    expect(editorWidth(360)).toBe("estreita");
    expect(editorWidth(1023)).toBe("estreita");
    expect(editorWidth(1024)).toBe("larga");
  });

  it("editDuration: faixas", () => {
    expect(editDuration(0)).toBe("<1min");
    expect(editDuration(59_999)).toBe("<1min");
    expect(editDuration(60_000)).toBe("1-3min");
    expect(editDuration(179_999)).toBe("1-3min");
    expect(editDuration(180_000)).toBe("3-10min");
    expect(editDuration(599_999)).toBe("3-10min");
    expect(editDuration(600_000)).toBe("10min+");
    expect(editDuration(Number.NaN)).toBe("<1min");
  });
});

describe("textos do cabeçalho e da barra", () => {
  it("nenhum texto com 'dele', 'dela', 'chegou' ou 'enviada para'", () => {
    const all: string[] = [];
    for (const kind of KINDS)
      for (const mode of ["local", "supabase"] as AppMode[])
        for (const active of [true, false])
          for (const adjustedAt of [undefined, ADJ])
            for (const studentFirst of ["Juliana", null])
              for (const coachFirst of ["Rafael", null])
                for (const currentCoach of [true, false]) {
                  const c: FichaContextInput = { kind, mode, program: { active, adjustedAt }, studentFirst, coachFirst, currentCoach };
                  const t = fichaContextText(c, shortDay);
                  all.push(t.title);
                  if (t.note) all.push(t.note);
                  for (const sample of [true, false])
                    for (const hasExercises of [true, false]) {
                      const n = postSaveNextStep({ ...c, sample, hasExercises });
                      if (n && "text" in n) all.push(n.text);
                      const m = newFichaMessage({ ...c, sample, hasExercises });
                      if ("text" in m) all.push(m.text);
                    }
                  all.push(postSaveTitle(kind, mode), postSaveTitle(kind, mode, { fromGenerator: true }));
                }
    expect(all.length).toBeGreaterThan(100);
    for (const t of all) {
      expect(t).not.toMatch(/\bdel[ea]\b|chegou|enviada para|aberto no WhatsApp|Nenhum envio/i);
      expect(t.trim()).toBe(t);
      expect(t).not.toMatch(/ {2}|\bnull\b|undefined/);
    }
  });
});
