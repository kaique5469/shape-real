import { describe, expect, it } from "vitest";
import {
  ABOVE_MAX_NOTE,
  KEYBOARD_MIN_SHRINK,
  SWAP_BLOCKED_NOTE,
  acceptTyped,
  afterDonePlan,
  assignLinks,
  canSwap,
  dissolvedNote,
  exerciseWork,
  isLinkDissolved,
  lastSetHint,
  linkGroups,
  linkLabel,
  nextPendingIndex,
  removeExerciseConfirm,
  removeExerciseHint,
  removeSetConfirm,
  programWithFinishedLoads,
  revealAfterResize,
  scrollDeltaToReveal,
  summaryHeadline,
  swapCopy,
  swapOrigin,
  type LinkInfo,
} from "./session-flow";
import type { ExerciseLog, Program, SetLog, Technique } from "./types";

describe("scrollDeltaToReveal", () => {
  const area = { top: 92, bottom: 218 };
  it("já cabe → 0", () => expect(scrollDeltaToReveal({ top: 132, bottom: 180 }, area)).toBe(0));
  it("encostado nas bordas da área ainda cabe → 0", () => expect(scrollDeltaToReveal({ top: 92, bottom: 218 }, area)).toBe(0));
  it("abaixo → desce o exato", () => expect(scrollDeltaToReveal({ top: 369, bottom: 417 }, area)).toBe(199));
  it("cortado embaixo → desce só o que falta", () => expect(scrollDeltaToReveal({ top: 200, bottom: 230 }, area)).toBe(12));
  it("acima → sobe", () => expect(scrollDeltaToReveal({ top: 40, bottom: 88 }, area)).toBe(-52));
  it("maior que a área → alinha o topo", () => expect(scrollDeltaToReveal({ top: 300, bottom: 500 }, area)).toBe(208));
  it("maior que a área e acima → alinha o topo (sobe)", () => expect(scrollDeltaToReveal({ top: -100, bottom: 400 }, area)).toBe(-192));
});

// ───────────────────────── U1d: grupos fixados no início do treino ─────────────────────────

type LinkLike = Pick<ExerciseLog, "uid" | "planned">;
/** Registro com a técnica da ficha ("normal" quando não há). */
const log = (uid: string, technique: Technique = "normal"): LinkLike => ({ uid, planned: { sets: 3, repsMin: 8, repsMax: 12, technique } });
const uids = (r: Record<string, LinkInfo>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, `${v.members.join("+")}#${v.pos}`]));

/** Cópia literal do linkGroups que a sessão usava antes da U1d (page.tsx), para comparar a heurística. */
function legacyLinkGroups(exercises: LinkLike[]): Record<string, { members: string[]; pos: number }> {
  const LINKED: Technique[] = ["bi_set", "tri_set", "super_serie"];
  const out: Record<string, { members: string[]; pos: number }> = {};
  let i = 0;
  while (i < exercises.length) {
    const t = exercises[i]!.planned?.technique;
    if (!t || !LINKED.includes(t)) {
      i++;
      continue;
    }
    const size = t === "tri_set" ? 3 : 2;
    let j = i;
    while (j + 1 < exercises.length && j - i + 1 < size && exercises[j + 1]!.planned?.technique === t) j++;
    if (j === i && i + 1 < exercises.length) j = Math.min(exercises.length - 1, i + size - 1);
    const members = exercises.slice(i, j + 1).map((e) => e.uid);
    if (members.length > 1) members.forEach((u, pos) => (out[u] = { members, pos }));
    i = j + 1;
  }
  return out;
}

describe("assignLinks", () => {
  it("par com os dois marcados → mesmo id '<dia>:<índice do 1º membro>'", () => {
    expect(assignLinks("A", [log("ag"), log("sup", "bi_set"), log("rem", "bi_set"), log("abd")])).toEqual({ sup: "A:1", rem: "A:1" });
  });

  it("só o 1º marcado ('Bi-set com o próximo') se junta ao seguinte", () => {
    expect(assignLinks("A", [log("ag"), log("sup", "bi_set"), log("rem"), log("abd")])).toEqual({ sup: "A:1", rem: "A:1" });
    // Supersérie também é de 2; tri-set só no 1º pega os 2 seguintes.
    expect(assignLinks("B", [log("a", "super_serie"), log("b"), log("c")])).toEqual({ a: "B:0", b: "B:0" });
    expect(assignLinks("C", [log("a", "tri_set"), log("b"), log("c"), log("d")])).toEqual({ a: "C:0", b: "C:0", c: "C:0" });
  });

  it("tri-set com os 3 marcados; dois grupos seguidos têm ids diferentes", () => {
    expect(assignLinks("D", [log("a", "tri_set"), log("b", "tri_set"), log("c", "tri_set"), log("d", "bi_set"), log("e", "bi_set")])).toEqual({
      a: "D:0",
      b: "D:0",
      c: "D:0",
      d: "D:3",
      e: "D:3",
    });
  });

  it("técnica normal (ou outra técnica) fica fora do mapa; bi-set marcado no último exercício não tem par", () => {
    expect(assignLinks("A", [log("a"), log("b", "drop_set"), log("c", "rest_pause")])).toEqual({});
    expect(assignLinks("A", [log("a"), log("b", "bi_set")])).toEqual({});
    expect(assignLinks("A", [])).toEqual({});
  });
});

describe("linkGroups com links (rascunho novo)", () => {
  // Cenário u1c-01: só o supino marcado "Bi-set com o próximo".
  const day = [log("ag"), log("sup", "bi_set"), log("rem"), log("abd")];
  const links = assignLinks("A", day);

  it("com todos presentes, igual à heurística", () => {
    expect(uids(linkGroups(day, links))).toEqual(uids(legacyLinkGroups(day)));
    expect(uids(linkGroups(day, links))).toEqual({ sup: "sup+rem#0", rem: "sup+rem#1" });
  });

  it("removida a remada: o supino fica sem grupo e NÃO se junta ao abdominal (regressão u1-16 e u1c-01)", () => {
    const after = day.filter((e) => e.uid !== "rem");
    expect(linkGroups(after, links)).toEqual({});
    // A heurística antiga inventava o par:
    expect(uids(legacyLinkGroups(after))).toEqual({ sup: "sup+abd#0", abd: "sup+abd#1" });
  });

  it("tri-set que perde 1 membro vira grupo de 2, na ordem atual", () => {
    const tri = [log("a", "tri_set"), log("b", "tri_set"), log("c", "tri_set"), log("d")];
    const l = assignLinks("C", tri);
    expect(uids(linkGroups(tri.filter((e) => e.uid !== "b"), l))).toEqual({ a: "a+c#0", c: "a+c#1" });
    expect(linkGroups(tri.filter((e) => e.uid !== "b" && e.uid !== "c"), l)).toEqual({});
  });

  it("exercício adicionado na hora não tem entrada (nem com técnica de grupo)", () => {
    const added = [...day.filter((e) => e.uid !== "rem"), log("novo"), log("novo2", "bi_set")];
    expect(linkGroups(added, links)).toEqual({});
  });

  it("troca mantém o uid: o grupo continua", () => {
    const swapped = day.map((e) => (e.uid === "rem" ? { ...e, planned: { sets: 3, repsMin: 30, repsMax: 45, technique: "normal" as const } } : e));
    expect(uids(linkGroups(swapped, links))).toEqual({ sup: "sup+rem#0", rem: "sup+rem#1" });
  });

  it("links vazio ({}, treino sem grupos) não cai na heurística", () => {
    expect(linkGroups([log("a", "bi_set"), log("b", "bi_set")], {})).toEqual({});
  });
});

describe("linkGroups sem links (rascunho de antes da U1d): igual à função antiga", () => {
  const cases: LinkLike[][] = [
    [],
    [log("a"), log("b")],
    [log("ag"), log("sup", "bi_set"), log("rem"), log("abd")],
    [log("ag"), log("sup", "bi_set"), log("abd")],
    [log("a", "bi_set"), log("b", "bi_set"), log("c", "bi_set")],
    [log("a", "tri_set"), log("b", "tri_set"), log("c", "tri_set"), log("d", "tri_set")],
    [log("a", "tri_set"), log("b")],
    [log("a", "super_serie"), log("b", "super_serie"), log("c", "bi_set"), log("d")],
    [log("a"), log("b", "bi_set")],
    [log("a", "bi_set"), log("b", "tri_set"), log("c", "tri_set")],
    [{ uid: "x" }, log("y", "bi_set"), { uid: "z" }],
  ];
  it.each(cases.map((c, k) => [k, c] as const))("caso %i", (_k, c) => {
    expect(linkGroups(c)).toEqual(legacyLinkGroups(c));
    expect(linkGroups(c, undefined)).toEqual(legacyLinkGroups(c));
  });
});

describe("isLinkDissolved, linkLabel e dissolvedNote", () => {
  const day = [log("ag"), log("sup", "bi_set"), log("rem"), log("abd")];
  const links = assignLinks("A", day);
  const semRemada = day.filter((e) => e.uid !== "rem");

  it("desfeito só quando o registro era de um grupo e ficou sozinho", () => {
    expect(isLinkDissolved("sup", day, links)).toBe(false);
    expect(isLinkDissolved("sup", semRemada, links)).toBe(true);
    expect(isLinkDissolved("ag", semRemada, links)).toBe(false); // nunca foi de grupo
    expect(isLinkDissolved("rem", semRemada, links)).toBe(false); // não está mais no treino
    expect(isLinkDissolved("novo", [...semRemada, log("novo", "bi_set")], links)).toBe(false); // adicionado na hora
    // Rascunho antigo (sem links): nunca desfeito.
    expect(isLinkDissolved("sup", semRemada, undefined)).toBe(false);
  });

  it("os 3 rótulos e null", () => {
    expect(linkLabel("bi_set", true)).toBe("Bi-set desfeito neste treino");
    expect(linkLabel("tri_set", true)).toBe("Tri-set desfeito neste treino");
    expect(linkLabel("super_serie", true)).toBe("Supersérie desfeita neste treino");
    expect(linkLabel("bi_set", false)).toBeNull();
    // Membro sem técnica de grupo (entrou pelo "só o 1º marcado"): o rótulo da técnica dele continua.
    expect(linkLabel("normal", true)).toBeNull();
    expect(linkLabel(undefined, true)).toBeNull();
  });

  it("caixa: 'O outro' quando saiu 1; 'Os outros' quando saíram 2 ou mais", () => {
    expect(dissolvedNote("sup", links)).toBe("O outro exercício saiu deste treino. Descanse entre as séries normalmente.");
    const tri = assignLinks("C", [log("a", "tri_set"), log("b", "tri_set"), log("c", "tri_set")]);
    expect(dissolvedNote("a", tri)).toBe("Os outros exercícios saíram deste treino. Descanse entre as séries normalmente.");
    // Tri-set que começou com 2 (só havia 2 exercícios marcados no fim do dia): saiu 1.
    const tri2 = assignLinks("C", [log("x"), log("a", "tri_set"), log("b", "tri_set")]);
    expect(dissolvedNote("a", tri2)).toBe("O outro exercício saiu deste treino. Descanse entre as séries normalmente.");
  });
});

// ───────────────────────── U1b: avanço depois de marcar ─────────────────────────

/** Séries: "x" feita, "p" preenchida sem ✓, "." vazia. */
const sets = (code: string): SetLog[] => [...code].map((c) => ({ loadKg: 40, reps: c === "." ? null : 8, done: c === "x" }));
const ex = (uid: string, code: string) => ({ uid, sets: sets(code) });

describe("afterDonePlan", () => {
  const plan = (exercises: Array<{ uid: string; sets: SetLog[] }>, mark: { logUid: string; index: number }, links: Record<string, LinkInfo> = {}, restSec = 90) =>
    afterDonePlan({ exercises, links, mark, restSec });

  it("série do meio → fica e descansa", () => {
    expect(plan([ex("ag", "x..."), ex("sup", "....")], { logUid: "ag", index: 1 })).toEqual({ open: null, startRest: true });
  });

  it("último índice com série anterior pendente → fica no exercício (regressão de V5c)", () => {
    expect(plan([ex("ag", "...."), ex("sup", "....")], { logUid: "ag", index: 3 })).toEqual({ open: null, startRest: true });
    // Preenchida sem ✓ também é pendente.
    expect(plan([ex("ag", "xxp."), ex("sup", "....")], { logUid: "ag", index: 3 })).toEqual({ open: null, startRest: true });
  });

  it("exercício completo → abre o próximo com série pendente e descansa", () => {
    expect(plan([ex("ag", "xxx."), ex("sup", "...."), ex("rem", "....")], { logUid: "ag", index: 3 })).toEqual({ open: "sup", startRest: true });
    // Fora de ordem: completar a última série que faltava (a 1ª) também fecha o exercício.
    expect(plan([ex("ag", ".xxx"), ex("sup", "....")], { logUid: "ag", index: 0 })).toEqual({ open: "sup", startRest: true });
    // O próximo já completo é pulado.
    expect(plan([ex("ag", "xxx."), ex("sup", "xxxx"), ex("rem", "....")], { logUid: "ag", index: 3 })).toEqual({ open: "rem", startRest: true });
  });

  it("bi-set: membro 1 → abre o membro 2, sem descanso", () => {
    const links = linkGroups([log("sup", "bi_set"), log("rem", "bi_set")]);
    expect(plan([ex("sup", "...."), ex("rem", "....")], { logUid: "sup", index: 0 }, links)).toEqual({ open: "rem", startRest: false });
    // Mesmo na última série do membro 1.
    expect(plan([ex("sup", "xxx."), ex("rem", "xxx.")], { logUid: "sup", index: 3 }, links)).toEqual({ open: "rem", startRest: false });
  });

  it("bi-set: último membro com o 1º ainda pendente → volta ao 1º e descansa", () => {
    const links = linkGroups([log("sup", "bi_set"), log("rem", "bi_set"), log("abd")]);
    expect(plan([ex("sup", "x..."), ex("rem", "...."), ex("abd", "...")], { logUid: "rem", index: 0 }, links)).toEqual({ open: "sup", startRest: true });
    // O 1º já completo e o último também: abre o próximo fora do grupo.
    expect(plan([ex("sup", "xxxx"), ex("rem", "xxx."), ex("abd", "...")], { logUid: "rem", index: 3 }, links)).toEqual({ open: "abd", startRest: true });
    // O 1º completo e o último com pendência: fica no último.
    expect(plan([ex("sup", "xxxx"), ex("rem", "x..."), ex("abd", "...")], { logUid: "rem", index: 1 }, links)).toEqual({ open: null, startRest: true });
  });

  it("última série do treino → sem descanso e sem abrir nada", () => {
    expect(plan([ex("ag", "xxxx"), ex("sup", "xxx.")], { logUid: "sup", index: 3 })).toEqual({ open: null, startRest: false });
  });

  it("restSec 0 → sem descanso (o avanço continua)", () => {
    expect(plan([ex("ag", "xxx."), ex("sup", "....")], { logUid: "ag", index: 3 }, {}, 0)).toEqual({ open: "sup", startRest: false });
    expect(plan([ex("ag", "x..."), ex("sup", "....")], { logUid: "ag", index: 1 }, {}, 0)).toEqual({ open: null, startRest: false });
  });

  it("grupo desfeito (o par saiu do treino) → fluxo normal: descansa e fica", () => {
    const day = [log("ag"), log("sup", "bi_set"), log("rem"), log("abd")];
    const fixed = assignLinks("A", day);
    const now = day.filter((e) => e.uid !== "rem");
    const links = linkGroups(now, fixed);
    expect(links).toEqual({});
    expect(plan([ex("ag", "...."), ex("sup", "...."), ex("abd", "...")], { logUid: "sup", index: 0 }, links)).toEqual({ open: null, startRest: true });
  });

  it("nextPendingIndex: a próxima série por fazer, sem contar a recém-marcada", () => {
    expect(nextPendingIndex({ sets: sets("x...") }, 1)).toBe(2);
    expect(nextPendingIndex({ sets: sets("..x.") }, 0)).toBe(1);
    expect(nextPendingIndex({ sets: sets("xxx.") }, 3)).toBe(-1);
    expect(nextPendingIndex({ sets: sets("xx..") })).toBe(2);
  });
});

// ───────────────────────── U1c: ações do exercício ─────────────────────────

describe("troca: origem, textos e bloqueio", () => {
  it("swapOrigin: sem ficha → livre; ficha própria → propria; criada por outro → personal", () => {
    expect(swapOrigin(null, "u")).toBe("livre");
    expect(swapOrigin(undefined, "u")).toBe("livre");
    expect(swapOrigin({ createdBy: "u" }, "u")).toBe("propria");
    expect(swapOrigin({ createdBy: "coach" }, "u")).toBe("personal");
  });

  it("swapCopy: rótulo do botão e dica do seletor nos 3 casos", () => {
    expect(swapCopy("personal")).toEqual({ label: "Trocar só neste treino", hint: "A ficha do seu personal não muda." });
    expect(swapCopy("propria")).toEqual({ label: "Trocar só neste treino", hint: "A ficha não muda. Para trocar de vez, edite a ficha em Treinos." });
    expect(swapCopy("livre")).toEqual({ label: "Trocar exercício", hint: null });
  });

  it("canSwap: com série feita → false; preenchida ou vazia → true", () => {
    expect(canSwap({ sets: sets("x...") })).toBe(false);
    expect(canSwap({ sets: sets("...x") })).toBe(false);
    expect(canSwap({ sets: sets("pp..") })).toBe(true);
    expect(canSwap({ sets: sets("....") })).toBe(true);
    expect(SWAP_BLOCKED_NOTE).toBe("Este exercício já tem série feita. Para fazer outro, use “Adicionar exercício”.");
  });
});

describe("remover a última série", () => {
  it("lastSetHint: os 4 textos e disabled", () => {
    expect(lastSetHint({ sets: sets("xx..") })).toEqual({ text: "Série 4 · vazia", disabled: false });
    expect(lastSetHint({ sets: sets("xx.p") })).toEqual({ text: "Série 4 · preenchida, sem ✓", disabled: false });
    expect(lastSetHint({ sets: sets("xxxx") })).toEqual({ text: "Série 4 · feita", disabled: false });
    expect(lastSetHint({ sets: sets("x") })).toEqual({ text: "O exercício precisa de pelo menos 1 série.", disabled: true });
    expect(lastSetHint({ sets: [] }).disabled).toBe(true);
  });

  it("a carga pré-preenchida não conta como valor digitado", () => {
    expect(lastSetHint({ sets: [{ loadKg: 40, reps: null, done: false }, { loadKg: 40, reps: null, done: false }] }).text).toBe("Série 2 · vazia");
    expect(lastSetHint({ sets: [{ loadKg: 40, reps: null, done: false }, { loadKg: 40, reps: 0, done: false }] }).text).toBe("Série 2 · vazia");
  });

  it("removeSetConfirm: vazia → null (sai na hora); preenchida e feita → título e texto", () => {
    expect(removeSetConfirm({ sets: sets("xx..") })).toBeNull();
    expect(removeSetConfirm({ sets: sets("xx.p") })).toEqual({ title: "Remover a série 4?", body: "A série 4 tem valores digitados, que serão descartados." });
    expect(removeSetConfirm({ sets: sets("xxx") })).toEqual({ title: "Remover a série 3?", body: "A série 3 já está marcada como feita e sai deste treino." });
    // Feita sem reps (✓ sem digitar) também pede confirmação.
    expect(removeSetConfirm({ sets: [...sets("x"), { loadKg: 20, reps: null, done: true }] })?.title).toBe("Remover a série 2?");
    // Uma série só: nada a remover.
    expect(removeSetConfirm({ sets: sets("x") })).toBeNull();
  });
});

describe("remover o exercício do treino", () => {
  const named = (code: string) => ({ name: "Agachamento livre", sets: sets(code) });

  it("nada feito nem preenchido → null (sai na hora)", () => {
    expect(removeExerciseConfirm(named("...."), true)).toBeNull();
    expect(removeExerciseConfirm(named("...."), false)).toBeNull();
  });

  it("só preenchida (sem ✓) → valores digitados; 'A ficha não muda.' só com ficha", () => {
    expect(removeExerciseConfirm(named("p..."), true)).toEqual({ body: "Agachamento livre sai deste treino e os valores digitados são descartados. A ficha não muda." });
    expect(removeExerciseConfirm(named("pp.."), false)).toEqual({ body: "Agachamento livre sai deste treino e os valores digitados são descartados." });
  });

  it("1 e N séries feitas (a feita vence a preenchida); com e sem ficha", () => {
    expect(removeExerciseConfirm(named("xp.."), true)).toEqual({ body: "Agachamento livre sai deste treino e a série já feita é descartada. A ficha não muda." });
    expect(removeExerciseConfirm(named("xxx."), true)).toEqual({ body: "Agachamento livre sai deste treino e as 3 séries já feitas são descartadas. A ficha não muda." });
    expect(removeExerciseConfirm(named("xxx."), false)).toEqual({ body: "Agachamento livre sai deste treino e as 3 séries já feitas são descartadas." });
    expect(removeExerciseConfirm(named("x"), false)?.body).not.toContain("A ficha não muda.");
  });

  it("exerciseWork conta feitas e preenchidas; dica da folha de ações", () => {
    expect(exerciseWork({ sets: sets("xxp..") })).toEqual({ feitas: 2, preenchidas: 1 });
    expect(exerciseWork({ sets: [] })).toEqual({ feitas: 0, preenchidas: 0 });
    expect(removeExerciseHint(true)).toBe("A ficha não muda.");
    expect(removeExerciseHint(false)).toBe("Sai deste treino.");
  });
});

// ───────────────────────── U8a: teclado aberto e valor acima do limite ─────────────────────────

describe("revealAfterResize (U8 §3.2b)", () => {
  const base = { heightAtFocus: 740, height: 420, fieldFocused: true, dragged: false };
  it("teclado abriu → revela", () => expect(revealAfterResize(base)).toBe(true));
  it("barra de endereço (56 px) → não", () => expect(revealAfterResize({ ...base, height: 684 })).toBe(false));
  it("exatamente 100 px → revela", () => expect(revealAfterResize({ ...base, height: 640 })).toBe(true));
  it("99 px → não", () => expect(revealAfterResize({ ...base, height: 641 })).toBe(false));
  it("a pessoa arrastou → não", () => expect(revealAfterResize({ ...base, dragged: true })).toBe(false));
  it("sem campo em foco → não", () => expect(revealAfterResize({ ...base, fieldFocused: false })).toBe(false));
  it("viewport cresceu → não", () => expect(revealAfterResize({ ...base, height: 800 })).toBe(false));
  it("limite de 100 px", () => expect(KEYBOARD_MIN_SHRINK).toBe(100));
});

describe("acceptTyped (limite de 999, U8a)", () => {
  it("aceita até o limite", () => {
    expect(acceptTyped(30, 35, 999)).toEqual({ value: 35, rejected: false });
    expect(acceptTyped(30, 999, 999)).toEqual({ value: 999, rejected: false });
    expect(acceptTyped(30, 102.5, 999)).toEqual({ value: 102.5, rejected: false });
    expect(acceptTyped(null, 0, 999)).toEqual({ value: 0, rejected: false });
  });
  it("acima do limite: fica o valor de antes, nunca o limite", () => {
    expect(acceptTyped(30, 1000, 999)).toEqual({ value: 30, rejected: true });
    // "30" + "35" com a seleção falhando: "3035" (antes virava 999 calado).
    expect(acceptTyped(30, 3035, 999)).toEqual({ value: 30, rejected: true });
    expect(acceptTyped(30, 999.5, 999)).toEqual({ value: 30, rejected: true });
    expect(acceptTyped(null, 1200, 999)).toEqual({ value: null, rejected: true });
  });
  it("campo apagado vira vazio, sem aviso", () => expect(acceptTyped(30, null, 999)).toEqual({ value: null, rejected: false }));
  it("não número: fica o de antes, sem aviso", () => {
    expect(acceptTyped(30, Number.NaN, 999)).toEqual({ value: 30, rejected: false });
    expect(acceptTyped(30, Number.POSITIVE_INFINITY, 999)).toEqual({ value: 30, rejected: false });
  });
  it("texto do aviso", () => expect(ABOVE_MAX_NOTE).toBe("Acima de 999 não é aceito."));
});

// ───────────────────────── U2a e U5a: fim do treino ─────────────────────────

describe("summaryHeadline (U2a: 'salvo' só com evidência)", () => {
  it("aluno com personal de link, modo local → celular", () =>
    expect(summaryHeadline({ mode: "local", hasCoach: true, viewingAsStudent: false })).toBe("Treino concluído · salvo neste celular"));
  it("sem personal, modo local → aparelho", () =>
    expect(summaryHeadline({ mode: "local", hasCoach: false, viewingAsStudent: false })).toBe("Treino concluído · salvo neste aparelho"));
  it("nuvem: nada de 'neste aparelho'", () => {
    expect(summaryHeadline({ mode: "supabase", hasCoach: false, viewingAsStudent: false })).toBe("Treino concluído");
    expect(summaryHeadline({ mode: "supabase", hasCoach: true, viewingAsStudent: false })).toBe("Treino concluído");
  });
  it("'Ver como aluno' fica como era", () => expect(summaryHeadline({ mode: "local", hasCoach: false, viewingAsStudent: true })).toBe("Treino concluído"));
  it("nunca afirma envio", () => {
    for (const mode of ["local", "supabase"] as const)
      for (const hasCoach of [true, false])
        for (const viewingAsStudent of [true, false]) expect(summaryHeadline({ mode, hasCoach, viewingAsStudent })).not.toMatch(/enviad|aberto|chegou|recebid|conferid/i);
  });
});

describe("programWithFinishedLoads (U5a: finalizar não edita a ficha)", () => {
  const planned = (exerciseId: string, loadKg?: number | null) => ({ uid: `u-${exerciseId}`, exerciseId, name: exerciseId, sets: 3, repsMin: 8, repsMax: 12, restSec: 90, loadKg, technique: "normal" as const });
  const program: Program = {
    id: "p1",
    ownerId: "a1",
    createdBy: "c1",
    name: "ABC",
    system: "livre",
    goal: "hipertrofia",
    level: "intermediario",
    daysPerWeek: 3,
    active: true,
    source: "personal",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-20T17:00:00.000Z",
    days: [
      { key: "A", title: "A", focus: [], exercises: [planned("agachamento", 30), planned("leg_press", 100)] },
      { key: "B", title: "B", focus: [], exercises: [planned("supino", 40), planned("agachamento", 30)] },
    ],
  };
  const done = (exerciseId: string, loads: (number | null)[], marks = "x".repeat(loads.length)): ExerciseLog =>
    ({ uid: `l-${exerciseId}`, exerciseId, name: exerciseId, sets: loads.map((loadKg, i) => ({ loadKg, reps: 8, done: marks[i] === "x" })) }) as ExerciseLog;

  it("a maior carga concluída vai para a ficha (em todos os dias com o exercício); updatedAt e o resto ficam iguais", () => {
    const next = programWithFinishedLoads(program, [done("agachamento", [30, 35, 32.5])])!;
    expect(next.days[0]!.exercises[0]!.loadKg).toBe(35);
    expect(next.days[1]!.exercises[1]!.loadKg).toBe(35);
    expect(next.days[0]!.exercises[1]).toBe(program.days[0]!.exercises[1]);
    expect(next.updatedAt).toBe(program.updatedAt);
    expect({ ...next, days: program.days }).toEqual(program);
  });
  it("série não marcada não conta", () => expect(programWithFinishedLoads(program, [done("agachamento", [30, 50], "x.")])).toBeNull());
  it("nenhuma carga muda → null (não regrava)", () => expect(programWithFinishedLoads(program, [done("agachamento", [30, 30]), done("supino", [40])])).toBeNull());
  it("carga 0 ou vazia não apaga a da ficha", () => expect(programWithFinishedLoads(program, [done("leg_press", [0, null])])).toBeNull());
  it("exercício fora da ficha não muda nada", () => expect(programWithFinishedLoads(program, [done("remada", [50])])).toBeNull());
  it("mesmo exercício duas vezes no treino: vale a maior", () =>
    expect(programWithFinishedLoads(program, [done("supino", [45]), done("supino", [42.5])])!.days[1]!.exercises[0]!.loadKg).toBe(45));
  it("ficha sem carga recebe a carga feita", () => {
    const blank = { ...program, days: [{ ...program.days[0]!, exercises: [planned("agachamento", null)] }] };
    expect(programWithFinishedLoads(blank, [done("agachamento", [20])])!.days[0]!.exercises[0]!.loadKg).toBe(20);
  });
  it("não muda a ficha recebida", () => {
    const before = structuredClone(program);
    programWithFinishedLoads(program, [done("agachamento", [60])]);
    expect(program).toEqual(before);
  });
});
