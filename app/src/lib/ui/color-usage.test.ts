import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Uso de cor (U7 §5.2, regras a–f). Lê os .tsx de src/app e src/components, fora da landing e do (site).
 *  (a) nenhuma classe com plate-red (nem var(--color-plate-red)); var(--plate-red) das anilhas é permitido;
 *  (b) nenhuma variante de botão "record"; o tom "record" do Badge só em ui.tsx;
 *  (c) nenhum bg-danger sólido (bg-danger-surface pode);
 *  (d) bg-record e text-record só nos arquivos de recorde;
 *  (e) nenhuma classe com text-warn-ink e bg-warn-fill juntas (ícone na faixa sólida é iron);
 *  (f) nenhum <dialog fora de ui.tsx (todo diálogo herda data-surface="light").
 *
 * PENDENTE: arquivos ainda não convertidos, com as regras que ainda falham e o item que converte. Cada item
 * tira o SEU arquivo da lista ao converter (o teste avisa quando uma entrada fica sobrando). A rodada fecha com
 * a lista vazia ou com o motivo registrado em DECISIONS.md.
 */
type Rule = "a" | "b" | "c" | "d" | "e" | "f";

// Vazia: os arquivos do U7c (anamnese) foram convertidos na costura da rodada do questionário (26/11).
const PENDENTE: Record<string, { regras: Rule[]; item: string }> = {};

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const posix = (p: string) => p.split(sep).join("/");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = [...walk(join(SRC, "app")), ...walk(join(SRC, "components"))]
  .map((f) => posix(relative(SRC, f)))
  .filter((f) => !f.startsWith("components/landing/") && !f.startsWith("app/(site)/"))
  .sort();

const RED_CLASS = /\b(?:text|bg|border|fill|stroke|ring|outline|decoration|from|to|via|divide|caret|accent|shadow)-plate-red(?:-ink)?\b/;
const RED_VAR = /var\(--color-plate-red(?:-ink)?\)/;
const SOLID_DANGER = /(?<![\w-])bg-danger(?![\w-])/;
const RECORD_CLASS = /(?<![\w-])(?:bg|text)-record(?![\w-])/;
const RECORD_FILES = new Set(["components/record-mark.tsx", "components/ui.tsx", "app/(painel)/sessao/page.tsx", "components/charts.tsx"]);

/** Linhas (1-based) que violam cada regra no arquivo. */
function violations(file: string, text: string): Record<Rule, number[]> {
  const out: Record<Rule, number[]> = { a: [], b: [], c: [], d: [], e: [], f: [] };
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const n = i + 1;
    if (RED_CLASS.test(line) || RED_VAR.test(line)) out.a.push(n);
    const recordQuoted = /["']record["']/.test(line);
    if (recordQuoted && /\bvariant\b/.test(line)) out.b.push(n);
    if (recordQuoted && /\btone\b/.test(line) && file !== "components/ui.tsx") out.b.push(n);
    if (file === "components/ui.tsx" && /\btype Variant\b/.test(line) && recordQuoted) out.b.push(n);
    if (SOLID_DANGER.test(line)) out.c.push(n);
    if (RECORD_CLASS.test(line) && !RECORD_FILES.has(file)) out.d.push(n);
    if (/(?<![\w-])text-warn-ink(?![\w-])/.test(line) && /(?<![\w-])bg-warn-fill(?![\w-])/.test(line)) out.e.push(n);
    if (/<dialog\b/.test(line) && file !== "components/ui.tsx") out.f.push(n);
  });
  return out;
}

const RESULTS = FILES.map((file) => ({ file, v: violations(file, readFileSync(join(SRC, file), "utf8")) }));

describe("uso de cor (U7 §5.2)", () => {
  it("encontra os arquivos de tela", () => {
    expect(FILES).toContain("components/ui.tsx");
    expect(FILES).toContain("app/(painel)/sessao/page.tsx");
    expect(FILES.some((f) => f.startsWith("components/landing/"))).toBe(false);
  });

  for (const rule of ["a", "b", "c", "d", "e", "f"] as const) {
    it(`regra ${rule}`, () => {
      const bad = RESULTS.filter(({ file, v }) => v[rule].length && !PENDENTE[file]?.regras.includes(rule)).map(({ file, v }) => `${file}:${v[rule].join(",")}`);
      expect(bad).toEqual([]);
    });
  }

  it("a lista PENDENTE não tem entrada sobrando (arquivo convertido sai da lista)", () => {
    const stale = Object.entries(PENDENTE)
      .filter(([file, { regras }]) => {
        if (!existsSync(join(SRC, file))) return true;
        const r = RESULTS.find((x) => x.file === file);
        return !r || regras.every((rule) => r.v[rule].length === 0);
      })
      .map(([file]) => file);
    expect(stale).toEqual([]);
  });

  it("as regras pegam o que devem e deixam passar o que é permitido", () => {
    const v = (text: string, file = "components/x.tsx") => violations(file, text);
    expect(v('className="text-plate-red-ink"').a).toEqual([1]);
    expect(v('className="hover:bg-plate-red/5"').a).toEqual([1]);
    expect(v('fill="var(--color-plate-red)"').a).toEqual([1]);
    expect(v('fill="var(--plate-red)"').a).toEqual([]);
    expect(v('<Button variant="record">').b).toEqual([1]);
    expect(v('variant?: "primary" | "record";').b).toEqual([1]);
    expect(v('<Badge tone="record">').b).toEqual([1]);
    expect(v('<Badge tone="record">', "components/ui.tsx").b).toEqual([]);
    expect(v('className="bg-danger text-white"').c).toEqual([1]);
    expect(v('className="bg-danger-surface hover:bg-danger-surface"').c).toEqual([]);
    expect(v('className="bg-record"').d).toEqual([1]);
    expect(v('className="text-on-record"').d).toEqual([]);
    expect(v('className="bg-record"', "components/record-mark.tsx").d).toEqual([]);
    expect(v('className="bg-warn-fill text-warn-ink"').e).toEqual([1]);
    expect(v('className="bg-warn-fill text-iron"').e).toEqual([]);
    expect(v("<dialog open>").f).toEqual([1]);
    expect(v("<dialog open>", "components/ui.tsx").f).toEqual([]);
  });
});
