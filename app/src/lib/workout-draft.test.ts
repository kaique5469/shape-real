import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assignLinks, linkGroups } from "@/lib/domain/session-flow";
import type { PlannedExercise, Program, Session, Technique } from "@/lib/domain/types";
import { startRest } from "@/lib/domain/rest";
import {
  addedLog,
  buildDraft,
  decidirRascunho,
  decimalsOf,
  defaultPlan,
  draftHasWork,
  draftKey,
  draftProgressText,
  initialLoad,
  marcarRetomado,
  parseDraft,
  parsePtNumber,
  RASCUNHO_FRESCO_MS,
  readDraftInfo,
  restDelayBand,
  resumeOpenUid,
  saveDraft,
  splitCompareLine,
  suggestionEdit,
  swapInDraft,
  tween,
  unmarkBand,
  type WorkoutDraft,
} from "./workout-draft";
import { PAIN_SUGGESTION_TEXT } from "@/lib/domain/progression";
import { activeMinutes, minutosAtivosAoFinalizar, registrarAtividade } from "@/lib/domain/session-time";
import { sessaoParaSalvar } from "@/lib/domain/session-flow";

const session: Session = {
  id: "s1",
  userId: "u",
  programId: "p1",
  dayKey: "B",
  startedAt: "2026-03-01T10:00:00Z",
  exercises: [{ uid: "a", exerciseId: "supino_reto_barra", name: "Supino", sets: [{ loadKg: 40, reps: 10, done: true }, { loadKg: 40, reps: null, done: false }] }],
  volumeKg: 0,
  prs: [],
};

describe("parseDraft: rascunhos antigos e novos", () => {
  it("rascunho gravado antes deste lote (sem rest, sugestão sem 'retorno') abre igual", () => {
    const old = JSON.stringify({ session, suggestions: { a: { kind: "manter", loadKg: 40, text: "Manter 40 kg: faltaram 9 reps para fechar 3×12." } }, restSec: { a: 90 } });
    const d = parseDraft(old);
    expect(d).toEqual({ session, suggestions: { a: { kind: "manter", loadKg: 40, text: "Manter 40 kg: faltaram 9 reps para fechar 3×12." } }, restSec: { a: 90 } });
    expect(d && "rest" in d).toBe(false);
  });

  it("sugestão de retorno e descanso em andamento", () => {
    const raw = JSON.stringify({
      session,
      suggestions: { a: { kind: "retorno", loadKg: 36, text: "Faz 18 dias desde a última vez neste exercício: volte com 36 kg e reencontre o ritmo." } },
      restSec: { a: 90 },
      rest: { until: 1_772_360_000_000, total: 90 },
    });
    const d = parseDraft(raw);
    expect(d?.suggestions.a?.kind).toBe("retorno");
    expect(d?.rest).toEqual({ until: 1_772_360_000_000, total: 90 });
  });

  it("partes ausentes ou inválidas viram vazias; sem sessão utilizável, null", () => {
    expect(parseDraft(JSON.stringify({ session }))).toEqual({ session, suggestions: {}, restSec: {} });
    const messy = parseDraft(JSON.stringify({ session, suggestions: { a: { kind: "manter" }, b: "x", c: { kind: "reps", loadKg: null, text: "Busque 12 reps." } }, restSec: { a: "90", b: 60 }, rest: { until: "amanhã" } }));
    expect(messy).toEqual({ session, suggestions: { c: { kind: "reps", loadKg: null, text: "Busque 12 reps." } }, restSec: { b: 60 } });
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("{nope")).toBeNull();
    expect(parseDraft(JSON.stringify({ suggestions: {} }))).toBeNull();
    expect(parseDraft(JSON.stringify({ session: { ...session, exercises: "x" } }))).toBeNull();
    expect(parseDraft(JSON.stringify({ session: { ...session, exercises: [{ uid: "a" }] } }))).toBeNull();
  });
});

describe("saveDraft", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("grava o descanso atual junto, e some com ele quando não há descanso", () => {
    const draft: WorkoutDraft = { session, suggestions: {}, restSec: { a: 90 }, rest: { until: 1, total: 1 } };
    saveDraft("u", draft, { until: 1_772_360_000_000, total: 90 });
    expect(parseDraft(store.get(draftKey("u")))?.rest).toEqual({ until: 1_772_360_000_000, total: 90 });
    saveDraft("u", draft, null);
    expect(JSON.parse(store.get(draftKey("u"))!)).not.toHaveProperty("rest");
    // "Hoje" continua lendo o mesmo rascunho.
    expect(readDraftInfo("u")).toMatchObject({ done: 1, total: 2, href: "/sessao?p=p1&d=B" });
  });

  it("série preenchida sem ✓ também é treino em andamento (Hoje mostra a retomada; nada é sobrescrito sem aviso)", () => {
    const filledOnly: Session = { ...session, exercises: [{ ...session.exercises[0]!, sets: [{ loadKg: 40, reps: 9, done: false }, { loadKg: 40, reps: null, done: false }] }] };
    const empty: Session = { ...session, exercises: [{ ...session.exercises[0]!, sets: [{ loadKg: 40, reps: null, done: false }] }] };
    expect(draftHasWork(filledOnly)).toBe(true);
    expect(draftHasWork(session)).toBe(true);
    expect(draftHasWork(empty)).toBe(false);
    saveDraft("u", { session: filledOnly, suggestions: {}, restSec: {} }, null);
    expect(readDraftInfo("u")).toMatchObject({ done: 0, total: 2, filled: 1 });
    saveDraft("u", { session: empty, suggestions: {}, restSec: {} }, null);
    expect(readDraftInfo("u")).toBeNull();
  });

  it("nunca lança sem armazenamento", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => saveDraft("u", { session, suggestions: {}, restSec: {} }, null)).not.toThrow();
  });
});

describe("restDelayBand", () => {
  it("faixas do atraso entre o fim do descanso e a próxima série", () => {
    expect(restDelayBand(0)).toBe("0-15s");
    expect(restDelayBand(14.9)).toBe("0-15s");
    expect(restDelayBand(15)).toBe("15-60s");
    expect(restDelayBand(59)).toBe("15-60s");
    expect(restDelayBand(60)).toBe("60s+");
    expect(restDelayBand(900)).toBe("60s+");
    expect(restDelayBand(-3)).toBe("0-15s");
    expect(restDelayBand(Number.NaN)).toBe("0-15s");
  });
});

describe("suggestionEdit", () => {
  const sets = (...loads: (number | null)[]) => ({ sets: loads.map((loadKg, i) => ({ loadKg, reps: 10, done: i < 2 })) });

  it("mantida ou editada, só pelo tipo e sim/não", () => {
    expect(suggestionEdit(sets(40, 40, 50), { kind: "manter", loadKg: 40 })).toEqual({ tipo: "manter", editada: false });
    expect(suggestionEdit(sets(40, 42.5), { kind: "aumentar", loadKg: 40 })).toEqual({ tipo: "aumentar", editada: true });
    expect(suggestionEdit(sets(36, 36), { kind: "retorno", loadKg: 36 })).toEqual({ tipo: "retorno", editada: false });
    expect(suggestionEdit(sets(null, 20), { kind: "reduzir", loadKg: 20 })).toEqual({ tipo: "reduzir", editada: true });
  });

  it("fora do evento: sem sugestão, sem carga, primeira vez, reps, nenhuma série feita", () => {
    expect(suggestionEdit(sets(40), undefined)).toBeNull();
    expect(suggestionEdit(sets(40), { kind: "manter", loadKg: null })).toBeNull();
    expect(suggestionEdit(sets(40), { kind: "primeira", loadKg: 40 })).toBeNull();
    expect(suggestionEdit(sets(40), { kind: "reps", loadKg: 40 })).toBeNull();
    expect(suggestionEdit({ sets: [{ loadKg: 40, reps: 10, done: false }, { loadKg: 40, reps: 0, done: true }] }, { kind: "manter", loadKg: 40 })).toBeNull();
  });
});

describe("splitCompareLine", () => {
  it("separa nome e detalhe, e os números de 'A → B' para animar", () => {
    expect(splitCompareLine("Agachamento: 60 → 62,5 kg")).toEqual({
      name: "Agachamento",
      detail: "60 → 62,5 kg",
      arrow: { head: "", fromText: "60", from: 60, toText: "62,5", to: 62.5, tail: " kg" },
    });
    expect(splitCompareLine("Prancha: 45 → 60 s").arrow).toMatchObject({ from: 45, to: 60, tail: " s" });
    expect(splitCompareLine("Barra fixa: 8 → 10 reps").arrow).toMatchObject({ from: 8, to: 10, tail: " reps" });
    expect(splitCompareLine("Barra fixa assistida (graviton/gravitron): 30 → 25 kg de ajuda")).toMatchObject({
      name: "Barra fixa assistida (graviton/gravitron)",
      arrow: { from: 30, to: 25, tail: " kg de ajuda" },
    });
  });

  it("sem seta: detalhe inteiro, sem animação", () => {
    expect(splitCompareLine("Supino reto: +1 rep com 40 kg")).toEqual({ name: "Supino reto", detail: "+1 rep com 40 kg" });
    expect(splitCompareLine("Flexão: +5 kg extra")).toEqual({ name: "Flexão", detail: "+5 kg extra" });
    expect(splitCompareLine("Sem nome")).toEqual({ name: "", detail: "Sem nome" });
    // Nome com dois-pontos: corta no último.
    expect(splitCompareLine("Remada: pegada neutra: 40 → 45 kg").name).toBe("Remada: pegada neutra");
  });

  it("números em pt-BR e casas decimais", () => {
    expect(parsePtNumber("62,5")).toBe(62.5);
    expect(parsePtNumber("60")).toBe(60);
    expect(parsePtNumber("1.000")).toBeNaN();
    expect(decimalsOf("62,5")).toBe(1);
    expect(decimalsOf("62,25")).toBe(2);
    expect(decimalsOf("60")).toBe(0);
  });
});

describe("tween", () => {
  it("vai do valor anterior ao novo, sem passar do alvo", () => {
    expect(tween(60, 62.5, 0)).toBe(60);
    expect(tween(60, 62.5, 1)).toBe(62.5);
    expect(tween(60, 62.5, 2)).toBe(62.5);
    expect(tween(30, 25, 0.5)).toBeLessThan(30);
    expect(tween(30, 25, 0.5)).toBeGreaterThan(25);
  });
});

describe("draftProgressText", () => {
  it("feitas, preenchidas sem ✓ ou as duas, com singular e plural", () => {
    expect(draftProgressText({ done: 3, total: 21, filled: 0 })).toBe("3 de 21 séries feitas");
    expect(draftProgressText({ done: 3, total: 21, filled: 1 })).toBe("3 de 21 séries feitas e 1 preenchida sem marcar");
    expect(draftProgressText({ done: 3, total: 21, filled: 2 })).toBe("3 de 21 séries feitas e 2 preenchidas sem marcar");
    expect(draftProgressText({ done: 0, total: 21, filled: 1 })).toBe("1 série preenchida sem marcar");
    expect(draftProgressText({ done: 0, total: 21, filled: 4 })).toBe("4 séries preenchidas sem marcar");
  });
});

// ───────────────────────── U1d: grupos de bi-set no rascunho ─────────────────────────

const planned = (uid: string, exerciseId: string, name: string, technique: Technique = "normal", extra: Partial<PlannedExercise> = {}): PlannedExercise => ({
  uid,
  exerciseId,
  name,
  sets: 4,
  repsMin: 8,
  repsMax: 12,
  restSec: 90,
  technique,
  ...extra,
});

/** Treino A do cenário u1c-01: só o supino marcado "Bi-set com o próximo". */
const program: Program = {
  id: "p1",
  ownerId: "u",
  createdBy: "coach",
  name: "Ficha",
  system: "abc" as Program["system"],
  goal: "hipertrofia" as Program["goal"],
  level: "intermediario" as Program["level"],
  daysPerWeek: 3,
  active: true,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
  days: [
    {
      key: "A",
      title: "Agachamento, supino e remada",
      focus: [],
      exercises: [
        planned("p-ag", "agachamento_livre", "Agachamento livre"),
        planned("p-sup", "supino_reto_barra", "Supino reto com barra", "bi_set"),
        planned("p-rem", "remada_curvada_barra", "Remada curvada com barra"),
        planned("p-abd", "abdominal_supra", "Abdominal supra", "normal", { sets: 3, restSec: 45 }),
      ],
    },
    { key: "B", title: "", focus: [], exercises: [planned("p-a", "supino_reto_barra", "Supino", "tri_set"), planned("p-b", "remada_curvada_barra", "Remada", "tri_set")] },
  ],
};

describe("buildDraft (U1d)", () => {
  it("grava links coerentes com assignLinks, pelo uid de cada registro", () => {
    const d = buildDraft("u", program, "A", []);
    const [ag, sup, rem, abd] = d.session.exercises;
    expect(d.links).toEqual({ [sup!.uid]: "A:1", [rem!.uid]: "A:1" });
    expect(d.links).toEqual(assignLinks("A", d.session.exercises));
    expect(d.links).not.toHaveProperty(ag!.uid);
    expect(d.links).not.toHaveProperty(abd!.uid);
    // A tela agrupa igual à heurística no início do treino.
    expect(linkGroups(d.session.exercises, d.links)).toEqual(linkGroups(d.session.exercises));
  });

  it("monta o rascunho como antes: séries vazias, descanso por registro, técnica e observação da ficha em planned", () => {
    const d = buildDraft("u", program, "A", []);
    expect(d.session).toMatchObject({ userId: "u", programId: "p1", programName: "Ficha", dayKey: "A", dayTitle: "Agachamento, supino e remada", volumeKg: 0, prs: [] });
    expect(d.session.exercises.map((e) => e.sets.length)).toEqual([4, 4, 4, 3]);
    expect(d.session.exercises.every((e) => e.sets.every((s) => !s.done && s.reps === null))).toBe(true);
    expect(d.session.exercises[1]!.planned?.technique).toBe("bi_set");
    expect(Object.values(d.restSec)).toEqual([90, 90, 90, 45]);
    // Nada novo em planned para o grupo (fica só no rascunho).
    expect(Object.keys(d.session.exercises[1]!.planned!)).not.toContain("link");
  });

  it("dia sem grupo e treino livre gravam links vazio (não cai na heurística depois)", () => {
    expect(buildDraft("u", { ...program, days: [{ key: "C", title: "", focus: [], exercises: [planned("x", "prancha", "Prancha")] }] }, "C", []).links).toEqual({});
    const free = buildDraft("u", null, null, []);
    expect(free.session.exercises).toEqual([]);
    expect(free.links).toEqual({});
  });

  it("tri-set com só 2 exercícios no dia fica com os 2", () => {
    const d = buildDraft("u", program, "B", []);
    expect(Object.values(d.links!)).toEqual(["B:0", "B:0"]);
  });

  it("defaultPlan conforme a unidade", () => {
    expect(defaultPlan({ id: "supino_reto_barra", compound: true })).toEqual({ sets: 3, repsMin: 8, repsMax: 12, restSec: 120 });
    expect(defaultPlan({ id: "abdominal_supra", compound: false })).toEqual({ sets: 3, repsMin: 8, repsMax: 12, restSec: 75 });
    expect(defaultPlan({ id: "prancha", compound: false })).toEqual({ sets: 3, repsMin: 30, repsMax: 45, restSec: 45 });
  });
});

describe("parseDraft: links (U1d)", () => {
  it("preserva links válidos (inclusive de quem saiu do treino)", () => {
    const d = parseDraft(JSON.stringify({ session, suggestions: {}, restSec: {}, links: { a: "B:0", saiu: "B:0" } }));
    expect(d?.links).toEqual({ a: "B:0", saiu: "B:0" });
  });

  it("descarta valores que não são string e mantém o resto", () => {
    const d = parseDraft(JSON.stringify({ session, links: { a: "B:0", b: 3, c: null, d: { id: "x" }, e: "" } }));
    expect(d?.links).toEqual({ a: "B:0" });
  });

  it("links vazio continua vazio (treino sem grupos), não vira rascunho antigo", () => {
    expect(parseDraft(JSON.stringify({ session, links: {} }))?.links).toEqual({});
  });

  it("rascunho antigo (sem links) ou links sem formato de mapa → undefined (a tela usa a heurística)", () => {
    const old = parseDraft(JSON.stringify({ session, suggestions: {}, restSec: {} }));
    expect(old?.links).toBeUndefined();
    expect(old && "links" in old).toBe(false);
    expect(parseDraft(JSON.stringify({ session, links: ["B:0"] }))?.links).toBeUndefined();
    expect(parseDraft(JSON.stringify({ session, links: "B:0" }))?.links).toBeUndefined();
  });

  it("saveDraft + parseDraft: o grupo sobrevive a recarregar a página", () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
    try {
      const d = buildDraft("u", program, "A", []);
      saveDraft("u", d, null);
      expect(parseDraft(store.get(draftKey("u")))?.links).toEqual(d.links);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe("parseDraft: série que iniciou o descanso (U1b)", () => {
  it("rascunho com rest.from preserva o campo; from inválido some sem perder o descanso", () => {
    const rest = startRest(90, Date.parse("2026-03-01T10:01:00Z"), { logUid: "a", index: 0 })!;
    expect(parseDraft(JSON.stringify({ session, rest }))?.rest).toEqual(rest);
    const bad = parseDraft(JSON.stringify({ session, rest: { ...rest, from: { logUid: "a", index: "0" } } }));
    expect(bad?.rest).toEqual({ until: rest.until, total: 90 });
  });
});

describe("unmarkBand", () => {
  it("faixas do tempo entre marcar e desmarcar (evento serie_desmarcada)", () => {
    expect(unmarkBand(0)).toBe("ate_10s");
    expect(unmarkBand(10)).toBe("ate_10s");
    expect(unmarkBand(10.5)).toBe("10_60s");
    expect(unmarkBand(60)).toBe("10_60s");
    expect(unmarkBand(61)).toBe("mais_60s");
    expect(unmarkBand(-3)).toBe("ate_10s");
    expect(unmarkBand(Number.NaN)).toBe("ate_10s");
  });
});

describe("swapInDraft (U1c)", () => {
  /** Treino A com uma marca anterior do supino com halteres, para haver sugestão de carga. */
  const prior: Session = {
    id: "old",
    userId: "u",
    programId: "p1",
    dayKey: "A",
    startedAt: "2026-11-10T10:00:00Z",
    finishedAt: "2026-11-10T11:00:00Z",
    exercises: [{ uid: "o1", exerciseId: "supino_reto_halter", name: "Supino reto com halteres", sets: [{ loadKg: 24, reps: 10, done: true }, { loadKg: 24, reps: 10, done: true }] }],
    volumeKg: 480,
    prs: [],
  };
  const base = () => {
    const d = buildDraft("u", program, "A", []);
    const sup = d.session.exercises[1]!;
    // Valores digitados (sem ✓) e observação do personal no supino.
    sup.sets[0] = { loadKg: 40, reps: 8, done: false };
    sup.planned = { ...sup.planned!, notes: "Amplitude parcial (ombro)." };
    return d;
  };

  it("mesma unidade: mantém número de séries, faixa, técnica e uid; séries recomeçam vazias", () => {
    const d = base();
    const sup = d.session.exercises[1]!;
    const out = swapInDraft(d, sup.uid, { id: "supino_reto_halter", name: "Supino reto com halteres", compound: true }, [prior]);
    const got = out.session.exercises[1]!;
    expect(got.uid).toBe(sup.uid);
    expect(got).toMatchObject({ exerciseId: "supino_reto_halter", name: "Supino reto com halteres", unit: "reps" });
    expect(got.sets).toHaveLength(4);
    expect(got.sets.every((s) => !s.done && s.reps === null)).toBe(true);
    expect(got.planned).toMatchObject({ sets: 4, repsMin: 8, repsMax: 12, restSec: 90, technique: "bi_set", loadKg: null });
    // A observação do personal era do exercício trocado: não vale para o substituto.
    expect(got.planned?.notes).toBeUndefined();
    // O grupo do bi-set continua (mesmo uid) e os outros registros não mudam.
    expect(out.links).toEqual(d.links);
    expect(out.session.exercises[0]).toBe(d.session.exercises[0]);
    expect(out.session.exercises[2]).toBe(d.session.exercises[2]);
    // O rascunho de entrada não é alterado.
    expect(d.session.exercises[1]!.exerciseId).toBe("supino_reto_barra");
  });

  it("atualiza a sugestão de carga do registro (e a carga das séries)", () => {
    const d = base();
    const uid = d.session.exercises[1]!.uid;
    const out = swapInDraft(d, uid, { id: "supino_reto_halter", name: "Supino reto com halteres", compound: true }, [prior]);
    expect(out.suggestions[uid]).toBeDefined();
    expect(out.suggestions[uid]).not.toEqual(d.suggestions[uid]);
    expect(out.session.exercises[1]!.sets.every((s) => s.loadKg === (out.suggestions[uid]!.loadKg ?? null))).toBe(true);
  });

  it("outra unidade: prescrição padrão com a técnica de antes, sem sugestão de carga", () => {
    const d = base();
    const uid = d.session.exercises[1]!.uid;
    const out = swapInDraft(d, uid, { id: "prancha", name: "Prancha", compound: false }, []);
    const got = out.session.exercises[1]!;
    expect(got).toMatchObject({ uid, exerciseId: "prancha", unit: "seg" });
    expect(got.planned).toEqual({ ...defaultPlan({ id: "prancha", compound: false }), technique: "bi_set" });
    expect(got.sets).toHaveLength(3);
    expect(got.sets.every((s) => s.loadKg === null && s.reps === null && !s.done)).toBe(true);
    expect(out.suggestions).not.toHaveProperty(uid);
  });

  it("registro inexistente: devolve o mesmo rascunho", () => {
    const d = base();
    expect(swapInDraft(d, "nao-existe", { id: "prancha", name: "Prancha", compound: false }, [])).toBe(d);
  });
});

describe("openUid (U8a: retomar no exercício aberto)", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("parseDraft mantém openUid string", () => {
    expect(parseDraft(JSON.stringify({ session, openUid: "u3" }))?.openUid).toBe("u3");
  });
  it("parseDraft descarta openUid que não é string (ou vazio)", () => {
    for (const bad of [42, null, true, { uid: "u3" }, ["u3"], ""]) {
      const d = parseDraft(JSON.stringify({ session, openUid: bad }));
      expect(d).not.toBeNull();
      expect(d && "openUid" in d).toBe(false);
    }
  });
  it("rascunho antigo sem openUid continua abrindo (e igual a antes)", () => {
    const d = parseDraft(JSON.stringify({ session, suggestions: {}, restSec: { a: 90 } }));
    expect(d).toEqual({ session, suggestions: {}, restSec: { a: 90 } });
  });
  it("saveDraft grava o openUid que vem no objeto e omite undefined", () => {
    const draft: WorkoutDraft = { session, suggestions: {}, restSec: {} };
    saveDraft("u", { ...draft, openUid: "a" }, null);
    expect(JSON.parse(store.get(draftKey("u"))!).openUid).toBe("a");
    expect(parseDraft(store.get(draftKey("u")))?.openUid).toBe("a");
    saveDraft("u", { ...draft, openUid: undefined }, null);
    expect("openUid" in JSON.parse(store.get(draftKey("u"))!)).toBe(false);
  });
});

describe("resumeOpenUid (U8a)", () => {
  const ex = (uid: string, done: boolean[]) => ({ uid, exerciseId: "supino_reto_barra", name: "Supino", sets: done.map((d) => ({ loadKg: 20, reps: d ? 10 : null, done: d })) });
  const three = { exercises: [ex("u1", [false, false]), ex("u2", [false]), ex("u3", [false])] };
  it("volta ao que estava aberto", () => expect(resumeOpenUid(three, "u3")).toBe("u3"));
  it("exercício removido → 1º pendente", () => expect(resumeOpenUid(three, "x")).toBe("u1"));
  it("sem openUid → 1º pendente (regra de hoje)", () => expect(resumeOpenUid({ exercises: [ex("u1", [true, true]), ex("u2", [true, false])] })).toBe("u2"));
  it("tudo feito → 1º exercício", () => expect(resumeOpenUid({ exercises: [ex("u1", [true]), ex("u2", [true])] })).toBe("u1"));
  it("sem exercícios → null", () => {
    expect(resumeOpenUid({ exercises: [] })).toBeNull();
    expect(resumeOpenUid({ exercises: [] }, "u1")).toBeNull();
  });
  it("aberto já concluído continua valendo (a pessoa estava nele)", () => expect(resumeOpenUid({ exercises: [ex("u1", [false]), ex("u2", [true])] }, "u2")).toBe("u2"));
});

// ───────────────────────── Rodada 3, trilha S ─────────────────────────

/** Histórico com o supino da ficha (A) feito na última vez, com ou sem "Senti dor". */
const supinoFeito = (pain: boolean, startedAt = "2026-11-24T10:00:00Z"): Session => ({
  id: `h-${startedAt}`,
  userId: "u",
  programId: "p1",
  dayKey: "A",
  startedAt,
  finishedAt: startedAt,
  exercises: [{ uid: "h1", exerciseId: "supino_reto_barra", name: "Supino reto com barra", sets: [{ loadKg: 50, reps: 12, done: true }, { loadKg: 50, reps: 12, done: true }, { loadKg: 50, reps: 12, done: true }, { loadKg: 50, reps: 12, done: true }], ...(pain ? { pain: true } : {}) }],
  volumeKg: 0,
  prs: [],
});
const comCarga: Program = { ...program, days: program.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => (e.exerciseId === "supino_reto_barra" ? { ...e, loadKg: 50 } : e)) })) };

describe("R3-7: dor marcada da última vez → carga vazia e nenhuma sugestão de carga", () => {
  it("aceite: buildDraft com dor no supino → séries com loadKg null, mesmo com a carga na ficha (a última feita)", () => {
    const d = buildDraft("u", comCarga, "A", [supinoFeito(true)]);
    const sup = d.session.exercises.find((e) => e.exerciseId === "supino_reto_barra")!;
    expect(sup.sets.every((s) => s.loadKg === null)).toBe(true);
    expect(d.suggestions[sup.uid]).toEqual({ kind: "dor", loadKg: null, text: PAIN_SUGGESTION_TEXT });
    expect(d.suggestions[sup.uid]!.text).not.toMatch(/Manter|aument/i);
  });

  it("negativo: sem dor, sugestão e carga inicial iguais a hoje (fechou o topo → 52,5 kg)", () => {
    const d = buildDraft("u", comCarga, "A", [supinoFeito(false)]);
    const sup = d.session.exercises.find((e) => e.exerciseId === "supino_reto_barra")!;
    expect(d.suggestions[sup.uid]).toMatchObject({ kind: "aumentar", loadKg: 52.5 });
    expect(sup.sets.every((s) => s.loadKg === 52.5)).toBe(true);
  });

  it("aceite: dor em outro exercício não afeta este", () => {
    const hist: Session = { ...supinoFeito(false), exercises: [...supinoFeito(false).exercises, { uid: "h2", exerciseId: "agachamento_livre", name: "Agachamento livre", pain: true, sets: [{ loadKg: 60, reps: 10, done: true }] }] };
    const d = buildDraft("u", comCarga, "A", [hist]);
    const sup = d.session.exercises.find((e) => e.exerciseId === "supino_reto_barra")!;
    const ag = d.session.exercises.find((e) => e.exerciseId === "agachamento_livre")!;
    expect(d.suggestions[sup.uid]!.kind).toBe("aumentar");
    expect(d.suggestions[ag.uid]!.kind).toBe("dor");
    expect(ag.sets.every((s) => s.loadKg === null)).toBe(true);
  });

  it("initialLoad: dor zera em qualquer unidade e implemento; o resto como antes", () => {
    const dor = { kind: "dor", loadKg: null, text: PAIN_SUGGESTION_TEXT } as const;
    const manter = { kind: "manter", loadKg: 40, text: "x" } as const;
    expect(initialLoad("reps", "barra", dor, 50)).toBeNull();
    expect(initialLoad("reps", "peso_corporal", dor, 10)).toBeNull();
    expect(initialLoad("seg", "peso_corporal", dor, 10)).toBeNull();
    expect(initialLoad("reps", "barra", manter, 50)).toBe(40);
    expect(initialLoad("reps", "barra", { ...manter, loadKg: null }, 50)).toBe(50);
    expect(initialLoad("reps", "peso_corporal", { ...manter, loadKg: null }, 0)).toBeNull();
    expect(initialLoad("seg", "peso_corporal", manter, 10)).toBe(10);
    expect(initialLoad("min", "maquina", manter, 10)).toBeNull();
    expect(initialLoad("reps", "barra", null, 50)).toBe(50);
  });

  it("exercício por tempo com dor: a sugestão de dor fica no rascunho (texto de cuidado), sem carga", () => {
    const prancha: Program = { ...program, days: [{ key: "C", title: "", focus: [], exercises: [planned("p-pr", "prancha", "Prancha", "normal", { repsMin: 30, repsMax: 45, loadKg: 10 })] }] };
    const hist: Session = { ...supinoFeito(false), exercises: [{ uid: "h3", exerciseId: "prancha", name: "Prancha", unit: "seg", pain: true, sets: [{ loadKg: 10, reps: 45, done: true }] }] };
    const d = buildDraft("u", prancha, "C", [hist]);
    const pr = d.session.exercises[0]!;
    expect(d.suggestions[pr.uid]?.kind).toBe("dor");
    expect(pr.sets.every((s) => s.loadKg === null)).toBe(true);
    // Sem dor, a prancha continua sem sugestão guardada (como sempre) e com o peso extra da ficha.
    const sem = buildDraft("u", prancha, "C", [{ ...hist, exercises: [{ ...hist.exercises[0]!, pain: undefined }] }]);
    expect(sem.suggestions).toEqual({});
    expect(sem.session.exercises[0]!.sets[0]!.loadKg).toBe(10);
  });

  it("adicionar exercício na hora com dor da última vez: séries vazias e a sugestão de dor", () => {
    const a = addedLog({ id: "supino_reto_barra", name: "Supino reto com barra", compound: true }, [supinoFeito(true)], "novo");
    expect(a.log.sets.every((s) => s.loadKg === null)).toBe(true);
    expect(a.suggestion?.kind).toBe("dor");
    // Negativo: sem dor, a carga sugerida (como antes).
    const b = addedLog({ id: "supino_reto_barra", name: "Supino reto com barra", compound: true }, [supinoFeito(false)], "novo");
    expect(b.log.sets.every((s) => s.loadKg === b.suggestion!.loadKg)).toBe(true);
    expect(b).toMatchObject({ restSec: 120, log: { uid: "novo", exerciseId: "supino_reto_barra", unit: "reps", planned: defaultPlan({ id: "supino_reto_barra", compound: true }) } });
    // Por tempo, sem dor: sem sugestão e sem carga (como antes).
    const c = addedLog({ id: "prancha", name: "Prancha", compound: false }, [], "p");
    expect(c.suggestion).toBeNull();
    expect(c.log.sets.every((s) => s.loadKg === null)).toBe(true);
  });

  it("trocar para um exercício com dor marcada: séries vazias e a sugestão de dor", () => {
    const d = buildDraft("u", program, "A", []);
    const uid = d.session.exercises[1]!.uid;
    const out = swapInDraft(d, uid, { id: "supino_reto_halter", name: "Supino reto com halteres", compound: true }, [{ ...supinoFeito(true), exercises: [{ ...supinoFeito(true).exercises[0]!, exerciseId: "supino_reto_halter" }] }]);
    expect(out.suggestions[uid]?.kind).toBe("dor");
    expect(out.session.exercises[1]!.sets.every((s) => s.loadKg === null)).toBe(true);
  });

  it("rascunho gravado com sugestão de dor volta igual (nunca com carga, mesmo alterado à mão)", () => {
    const raw = JSON.stringify({ session, suggestions: { a: { kind: "dor", loadKg: 40, text: PAIN_SUGGESTION_TEXT } }, restSec: {} });
    expect(parseDraft(raw)?.suggestions.a).toEqual({ kind: "dor", loadKg: null, text: PAIN_SUGGESTION_TEXT });
  });
});

describe("R3-4: relógio no rascunho (tempo) e recarregar", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("buildDraft começa o relógio no início do treino", () => {
    const d = buildDraft("u", program, "A", []);
    expect(d.tempo).toEqual({ lastActivityAt: d.session.startedAt, activeMs: 0, pausedMs: 0 });
  });

  it("aceite: saveDraft com intervalos e pausa → parseDraft dá o mesmo activeMinutes e as mesmas séries", () => {
    const d = buildDraft("u", program, "A", []);
    const t0 = Date.parse(d.session.startedAt);
    let tempo = d.tempo!;
    for (const min of [5, 12, 20, 20 + 90, 20 + 90 + 10]) tempo = registrarAtividade(tempo, t0 + min * 60_000).tempo;
    d.session.exercises[0]!.sets[0] = { loadKg: 60, reps: 10, done: true };
    saveDraft("u", { ...d, tempo }, null);
    const back = parseDraft(store.get(draftKey("u")))!;
    expect(back.tempo).toEqual(tempo);
    expect(back.tempo!.pausedMs).toBe(90 * 60_000);
    expect(back.session.exercises).toEqual(d.session.exercises);
    const fim = t0 + (20 + 90 + 15) * 60_000;
    expect(minutosAtivosAoFinalizar(back.tempo!, fim)).toBe(minutosAtivosAoFinalizar(tempo, fim));
    expect(minutosAtivosAoFinalizar(back.tempo!, fim)).toBe(35);
  });

  it("rascunho antigo sem relógio continua abrindo (sem tempo); relógio inválido é descartado", () => {
    expect(parseDraft(JSON.stringify({ session }))).not.toHaveProperty("tempo");
    expect(parseDraft(JSON.stringify({ session, tempo: { lastActivityAt: "x", activeMs: 1, pausedMs: 0 } }))).not.toHaveProperty("tempo");
  });

  it("retomar o rascunho e finalizar → 1 sessão só (o id do rascunho)", () => {
    const d = buildDraft("u", program, "A", []);
    d.session.exercises[0]!.sets[0] = { loadKg: 60, reps: 10, done: true };
    saveDraft("u", d, null);
    const back = parseDraft(store.get(draftKey("u")))!;
    const agora = new Date(Date.parse(d.session.startedAt) + 30 * 60_000);
    const a = sessaoParaSalvar(back.session, { agora, tempo: back.tempo });
    const b = sessaoParaSalvar(d.session, { agora, tempo: d.tempo });
    expect(a!.id).toBe(d.session.id);
    expect(b!.id).toBe(a!.id);
    expect(activeMinutes(a!)).toBe(30);
  });
});

describe("R3-10: retomar o treino de ontem sem laço", () => {
  const T = Date.parse("2026-11-25T20:00:00Z");
  const h = (horas: number) => new Date(T - horas * 3_600_000).toISOString();
  const comTrabalho = (startedAt: string): WorkoutDraft => ({ session: { ...session, startedAt }, suggestions: {}, restSec: {} });
  const semTrabalho = (startedAt: string): WorkoutDraft => ({ session: { ...session, startedAt, exercises: [{ ...session.exercises[0]!, sets: [{ loadKg: 40, reps: null, done: false }] }] }, suggestions: {}, restSec: {} });
  const mesmo = { programId: "p1", dayKey: "B" };

  it("aceite: rascunho de 7 h marcado como retomado não volta a ser pendente", () => {
    const d = marcarRetomado(comTrabalho(h(7)), new Date(T - 60_000));
    expect(decidirRascunho(d, mesmo, T)).toBe("retomar");
  });

  it("negativo: rascunho de 7 h NÃO retomado continua perguntando (nada some sem a pessoa escolher)", () => {
    expect(decidirRascunho(comTrabalho(h(7)), mesmo, T)).toBe("perguntar");
  });

  it("retomado há mais de 6 h volta a perguntar (a regra é a mesma, contada da retomada)", () => {
    const d = marcarRetomado(comTrabalho(h(30)), new Date(T - RASCUNHO_FRESCO_MS));
    expect(decidirRascunho(d, mesmo, T)).toBe("perguntar");
  });

  it("negativo: outro treino com trabalho continua perguntando, mesmo retomado (\"Começar outro\" pede confirmação)", () => {
    const d = marcarRetomado(comTrabalho(h(1)), new Date(T - 60_000));
    expect(decidirRascunho(d, { programId: "p1", dayKey: "A" }, T)).toBe("perguntar");
    expect(decidirRascunho(d, { programId: "p2", dayKey: "B" }, T)).toBe("perguntar");
  });

  it("como antes: mesmo treino recente reabre; sem dia no endereço vale o do rascunho; sem trabalho, treino novo", () => {
    expect(decidirRascunho(comTrabalho(h(1)), mesmo, T)).toBe("retomar");
    expect(decidirRascunho(comTrabalho(h(1)), { programId: "p1", dayKey: null }, T)).toBe("retomar");
    expect(decidirRascunho(semTrabalho(h(7)), mesmo, T)).toBe("novo");
    expect(decidirRascunho(semTrabalho(h(1)), { programId: "p1", dayKey: "A" }, T)).toBe("novo");
  });

  it("início ilegível: nunca reabre direto (pergunta, porque há trabalho)", () => {
    expect(decidirRascunho(comTrabalho("ontem"), mesmo, T)).toBe("perguntar");
  });

  it("a retomada sobrevive a recarregar (saveDraft + parseDraft); rascunho antigo abre sem ela", () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
    try {
      const d = marcarRetomado(comTrabalho(h(7)), new Date(T - 60_000));
      saveDraft("u", d, null);
      const back = parseDraft(store.get(draftKey("u")))!;
      expect(back.resumedAt).toBe(d.resumedAt);
      expect(decidirRascunho(back, mesmo, T)).toBe("retomar");
      expect(parseDraft(JSON.stringify({ session }))).not.toHaveProperty("resumedAt");
      expect(parseDraft(JSON.stringify({ session, resumedAt: "amanhã" }))).not.toHaveProperty("resumedAt");
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
