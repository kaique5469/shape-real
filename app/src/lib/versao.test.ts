import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKUP_VERSION } from "@/lib/domain/export";
import { TRANSFER_VERSION } from "@/lib/domain/transfer";
import { horaDoBuild, rodapeVersao, shaDoBuild, SHA_LOCAL, versaoDoBuild } from "@/lib/versao";

/**
 * Rodada 3, R3-2 (gate de release): build identificável. `GET /api/versao` responde exatamente
 * `{ sha, at, protocolo, copia }`, sem cache; o rodapé da Conta mostra "Versão a1b2c3d · 26/11 · links v1".
 * Troca o teste antigo "nenhum valor de process.env com mais de 8 caracteres": `at` é ISO (24 caracteres), e o que
 * importa é o formato de cada chave e que nenhum outro valor do ambiente saia.
 */

const SHA_RE = /^([0-9a-f]{7}|local)$/;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("shaDoBuild / horaDoBuild", () => {
  it("7 caracteres hexadecimais minúsculos passam; qualquer outra coisa vira 'local'", () => {
    expect(shaDoBuild("a1b2c3d")).toBe("a1b2c3d");
    for (const v of [undefined, null, "", "A1B2C3D", "a1b2c3", "a1b2c3d4", "a1b2c3dXYZ", "zzzzzzz", " a1b2c3d", "local", "segredo-qualquer-123"]) {
      expect(shaDoBuild(v)).toBe(SHA_LOCAL);
    }
  });

  it("hora: ISO legível volta normalizada; ausente ou ilegível dá null", () => {
    expect(horaDoBuild("2026-11-26T15:04:05.000Z")).toBe("2026-11-26T15:04:05.000Z");
    expect(horaDoBuild("2026-11-26T12:04:05-03:00")).toBe("2026-11-26T15:04:05.000Z");
    expect(horaDoBuild(undefined)).toBeNull();
    expect(horaDoBuild("")).toBeNull();
    expect(horaDoBuild("ontem")).toBeNull();
  });
});

describe("versaoDoBuild (corpo de /api/versao)", () => {
  it("exatamente as 4 chaves, protocolo e copia numéricos e iguais às constantes", () => {
    const v = versaoDoBuild({ sha: "a1b2c3d", at: "2026-11-26T15:00:00.000Z" });
    expect(Object.keys(v).sort()).toEqual(["at", "copia", "protocolo", "sha"]);
    expect(v).toEqual({ sha: "a1b2c3d", at: "2026-11-26T15:00:00.000Z", protocolo: TRANSFER_VERSION, copia: BACKUP_VERSION });
    expect(typeof v.protocolo).toBe("number");
    expect(typeof v.copia).toBe("number");
  });

  it("sem variáveis (build local): sha 'local' e at null, ainda com as 4 chaves", () => {
    const v = versaoDoBuild({});
    expect(v.sha).toBe("local");
    expect(v.at).toBeNull();
    expect(Object.keys(v)).toHaveLength(4);
  });
});

describe("rodapeVersao (Conta)", () => {
  it("'Versão a1b2c3d · 26/11 · links v1' (dia no fuso do aparelho)", () => {
    // Meio-dia UTC é 26/11 em qualquer fuso de -11 h a +11 h.
    expect(rodapeVersao({ sha: "a1b2c3d", at: "2026-11-26T12:00:00.000Z", protocolo: 1 })).toBe("Versão a1b2c3d · 26/11 · links v1");
  });

  it("build às 23h30 de São Paulo fica no dia local, não no dia UTC", () => {
    const local = new Date(2026, 10, 26, 23, 30).toISOString();
    expect(rodapeVersao({ sha: "a1b2c3d", at: local, protocolo: 1 })).toBe("Versão a1b2c3d · 26/11 · links v1");
  });

  it("build local e hora ilegível: 'Versão local · links v1', sem data inventada", () => {
    expect(rodapeVersao({ sha: "local", at: null, protocolo: 1 })).toBe("Versão local · links v1");
    expect(rodapeVersao({ sha: "qualquer", at: "x", protocolo: 1 })).toBe("Versão local · links v1");
  });
});

describe("GET /api/versao", () => {
  const chamar = async () => {
    const { GET } = await import("@/app/api/versao/route");
    return GET();
  };

  it("4 chaves, sha no formato, protocolo e copia numéricos, Cache-Control no-store", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "0fa01a1");
    vi.stubEnv("NEXT_PUBLIC_BUILD_AT", "2026-11-27T22:11:40.000Z");
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(corpo).sort()).toEqual(["at", "copia", "protocolo", "sha"]);
    expect(corpo.sha).toMatch(SHA_RE);
    expect(corpo).toEqual({ sha: "0fa01a1", at: "2026-11-27T22:11:40.000Z", protocolo: TRANSFER_VERSION, copia: BACKUP_VERSION });
  });

  it("sem NEXT_PUBLIC_BUILD_SHA (build local): sha 'local'", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", undefined as unknown as string);
    vi.stubEnv("NEXT_PUBLIC_BUILD_AT", undefined as unknown as string);
    const corpo = (await (await chamar()).json()) as Record<string, unknown>;
    expect(corpo.sha).toBe("local");
    expect(corpo.at).toBeNull();
  });

  it("nada sensível: nenhum outro valor do ambiente aparece na resposta", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "0fa01a1");
    vi.stubEnv("NEXT_PUBLIC_BUILD_AT", "2026-11-27T22:11:40.000Z");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-segredo-de-teste-123456");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-segredo-de-teste-abcdef");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0fa01a1fb095455b5c2d68cba389834d9f6ce259");
    const texto = await (await chamar()).text();
    expect(texto).not.toContain("segredo");
    // O SHA completo nunca sai: só os 7 primeiros.
    expect(texto).not.toContain("0fa01a1fb");
  });

  it("sha adulterado no ambiente não sai cru (o formato é conferido de novo)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "<script>");
    const corpo = (await (await chamar()).json()) as Record<string, unknown>;
    expect(corpo.sha).toBe("local");
  });
});

describe("next.config.ts (env de build)", () => {
  const carregar = async () => (await import("../../next.config")).default;

  it("NEXT_PUBLIC_BUILD_SHA = 7 primeiros caracteres de VERCEL_GIT_COMMIT_SHA", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0FA01A1fb095455b5c2d68cba389834d9f6ce259");
    const config = await carregar();
    expect(config.env?.NEXT_PUBLIC_BUILD_SHA).toBe("0fa01a1");
  });

  it("sem VERCEL_GIT_COMMIT_SHA (ou fora do formato): 'local'", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined as unknown as string);
    expect((await carregar()).env?.NEXT_PUBLIC_BUILD_SHA).toBe("local");
    vi.resetModules();
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "não-é-sha");
    expect((await carregar()).env?.NEXT_PUBLIC_BUILD_SHA).toBe("local");
  });

  it("NEXT_PUBLIC_BUILD_AT é ISO e fica igual nas leituras seguintes do mesmo build", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_AT", undefined as unknown as string);
    const primeira = (await carregar()).env?.NEXT_PUBLIC_BUILD_AT;
    expect(horaDoBuild(primeira)).toBe(primeira);
    vi.resetModules();
    const segunda = (await carregar()).env?.NEXT_PUBLIC_BUILD_AT;
    expect(segunda).toBe(primeira);
  });

  it("só as duas chaves de versão no env do pacote", async () => {
    const config = await carregar();
    expect(Object.keys(config.env ?? {}).sort()).toEqual(["NEXT_PUBLIC_BUILD_AT", "NEXT_PUBLIC_BUILD_SHA"]);
  });
});
