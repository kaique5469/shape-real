import { describe, expect, it } from "vitest";
import { assignLinks, dissolvedNote, isLinkDissolved, linkGroups, linkLabel, scrollDeltaToReveal, type LinkInfo } from "./session-flow";
import type { ExerciseLog, Technique } from "./types";

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
