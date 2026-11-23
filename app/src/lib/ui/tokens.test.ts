import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Tokens semânticos de cor (U7 §3.1, §5.2): existem, batem com os primitivos e passam no contraste WCAG 2.x
 * (texto ≥ 4,5:1; borda, ícone e anel de foco ≥ 3:1). As regras de foco no escuro ficam fora de @layer.
 */
const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

interface Block {
  header: string;
  parents: string[];
  body: string;
}

/** Blocos `{ … }` com o cabeçalho e os cabeçalhos dos blocos em volta (para saber se está dentro de @layer). */
function blocks(src: string): Block[] {
  const out: Block[] = [];
  const stack: { header: string; start: number }[] = [];
  let buf = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === "{") {
      stack.push({ header: buf.trim().replace(/\s+/g, " "), start: i + 1 });
      buf = "";
    } else if (c === "}") {
      const top = stack.pop();
      if (top) out.push({ header: top.header, parents: stack.map((s) => s.header), body: src.slice(top.start, i) });
      buf = "";
    } else if (c === ";") {
      buf = "";
    } else {
      buf += c;
    }
  }
  return out;
}

const all = blocks(css);
const theme = all.find((b) => b.header === "@theme" && b.parents.length === 0);
const tokens: Record<string, string> = {};
for (const m of (theme?.body ?? "").matchAll(/--color-([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]!] = m[2]!.toLowerCase();

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(tokens[a]!), luminance(tokens[b]!)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const SEMANTIC = ["brand", "record", "on-record", "danger", "danger-surface", "danger-line", "warn-ink", "warn-surface", "warn-line", "warn-fill", "done", "done-ink", "done-surface", "info-ink", "info-surface", "field"];

describe("tokens semânticos", () => {
  it("os 16 tokens existem no @theme, em hex", () => {
    expect(theme).toBeDefined();
    for (const t of SEMANTIC) expect(tokens[t], t).toMatch(/^#[0-9a-f]{6}$/);
    expect(SEMANTIC).toHaveLength(16);
  });

  it("igualdades com os primitivos (record fica de fora: pode mudar sozinho)", () => {
    expect(tokens.brand).toBe(tokens["plate-red"]);
    expect(tokens.danger).toBe(tokens["plate-red-ink"]);
    expect(tokens.done).toBe(tokens["plate-green"]);
    expect(tokens["done-ink"]).toBe(tokens["plate-green-ink"]);
    expect(tokens["info-ink"]).toBe(tokens["plate-blue-ink"]);
    expect(tokens["warn-fill"]).toBe(tokens["plate-yellow"]);
    expect(tokens.field).toBe(tokens.pencil);
  });

  const TEXT: [string, string][] = [
    ["on-record", "record"],
    ["danger", "paper"],
    ["danger", "chalk"],
    ["danger", "danger-surface"],
    ["iron", "warn-surface"],
    ["warn-ink", "paper"],
    ["warn-ink", "warn-surface"],
    ["warn-ink", "chalk"],
    ["iron", "warn-fill"],
    ["done-ink", "paper"],
    ["done-ink", "done-surface"],
    ["paper", "done"],
    ["info-ink", "paper"],
    ["info-ink", "info-surface"],
    ["suggest", "paper"],
  ];
  it.each(TEXT)("texto %s sobre %s ≥ 4,5:1", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  const NON_TEXT: [string, string][] = [
    ["record", "paper"],
    ["record", "chalk"],
    ["record", "iron"],
    ["danger-line", "paper"],
    ["done", "paper"],
    ["field", "paper"],
    ["field", "chalk"],
    ["chalk", "iron"],
    ["plate-blue", "paper"],
  ];
  it.each(NON_TEXT)("não-texto %s sobre %s ≥ 3:1", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it("valores medidos na U7 (conferência da função de contraste)", () => {
    expect(contrast("on-record", "record")).toBeCloseTo(5.2, 1);
    expect(contrast("danger", "paper")).toBeCloseTo(7.54, 1);
    expect(contrast("field", "chalk")).toBeCloseTo(3.02, 1);
    expect(contrast("plate-blue", "iron")).toBeLessThan(3); // por isso o foco no escuro é chalk
  });
});

describe("regras de foco", () => {
  const DARK = '[data-surface="dark"] :focus-visible';
  const DIALOG = '[data-surface="dark"] [data-surface="light"] :focus-visible';

  it.each([
    [DARK, "var(--color-chalk)"],
    [DIALOG, "var(--color-plate-blue)"],
  ])("%s existe fora de qualquer @layer", (selector, color) => {
    const rule = all.find((b) => b.header === selector);
    expect(rule, selector).toBeDefined();
    expect(rule!.parents.some((p) => p.startsWith("@layer"))).toBe(false);
    expect(rule!.body.replace(/\s+/g, " ")).toContain(`outline-color: ${color}`);
  });

  it("o :focus-visible global continua sem camada (por isso as regras acima também ficam sem)", () => {
    const base = all.find((b) => b.header === ":focus-visible");
    expect(base?.parents).toEqual([]);
  });

  it("bottom-nav-safe soma o menu de baixo e a área segura", () => {
    const u = all.find((b) => b.header === "@utility bottom-nav-safe");
    expect(u?.body.replace(/\s+/g, " ")).toContain("bottom: calc(5rem + env(safe-area-inset-bottom))");
  });

  it("toque sem atraso nos controles (touch-action: manipulation)", () => {
    const rule = all.find((b) => /\bbutton\b/.test(b.header) && b.body.includes("touch-action: manipulation"));
    expect(rule).toBeDefined();
    for (const sel of ["a", "button", "input", "select", "textarea", "summary", "label", '[role="button"]', '[role="radio"]', '[role="checkbox"]', '[role="tab"]']) {
      expect(rule!.header.split(",").map((s) => s.trim())).toContain(sel);
    }
  });
});
