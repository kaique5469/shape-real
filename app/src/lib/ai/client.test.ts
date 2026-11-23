import { afterEach, describe, expect, it, vi } from "vitest";
import { aiAvailable, aiEnabledFor, shouldAskAIStatus } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("shouldAskAIStatus", () => {
  it("sem conta, sem código de teste e sem modo aberto: nem pergunta ao servidor", () => {
    expect(shouldAskAIStatus({ signedIn: false, hasPass: false, openBuild: false })).toBe(false);
  });
  it("qualquer caminho para a IA libera a pergunta", () => {
    expect(shouldAskAIStatus({ signedIn: true, hasPass: false, openBuild: false })).toBe(true);
    expect(shouldAskAIStatus({ signedIn: false, hasPass: true, openBuild: false })).toBe(true);
    expect(shouldAskAIStatus({ signedIn: false, hasPass: false, openBuild: true })).toBe(true);
  });
});

describe("aiEnabledFor", () => {
  it("desligada ou sem resposta: falso", () => {
    expect(aiEnabledFor(null, { signedIn: true, hasPass: true })).toBe(false);
    expect(aiEnabledFor({ configured: false, access: "off" }, { signedIn: true, hasPass: true })).toBe(false);
  });
  it("respeita o tipo de acesso", () => {
    expect(aiEnabledFor({ configured: true, access: "open" }, { signedIn: false, hasPass: false })).toBe(true);
    expect(aiEnabledFor({ configured: true, access: "pass" }, { signedIn: false, hasPass: false })).toBe(false);
    expect(aiEnabledFor({ configured: true, access: "pass" }, { signedIn: false, hasPass: true })).toBe(true);
    expect(aiEnabledFor({ configured: true, access: "account" }, { signedIn: false, hasPass: true })).toBe(false);
    expect(aiEnabledFor({ configured: true, access: "account" }, { signedIn: true, hasPass: false })).toBe(true);
  });
});

describe("aiAvailable", () => {
  it("IA desligada para quem não tem caminho: responde sem nenhuma chamada a /api/ai/*", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(aiAvailable(false)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem sinal: a pergunta falha e a IA conta como desligada", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(aiAvailable(true)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/status");
  });
});
