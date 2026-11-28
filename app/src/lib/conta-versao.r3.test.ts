import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRANSFER_VERSION } from "@/lib/domain/transfer";

/**
 * Rodada 3, R3-2: rodapé de versão na Conta ("Versão a1b2c3d · 26/11 · links v1"), o mesmo build que /api/versao
 * responde. A página é renderizada de verdade; só o que depende do navegador ou de outra trilha é trocado.
 */

const estado = vi.hoisted(() => ({ role: "athlete" as "athlete" | "coach", isTester: false, returnTo: null as string | null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined }) }));
vi.mock("@/lib/app-context", () => ({
  localRepo: { wipe: async () => undefined },
  useApp: () => ({
    user: { id: "u1", role: estado.role, name: "Rafael Souza", createdAt: "2026-11-01T12:00:00.000Z", onboarded: true, plan: "free" },
    repo: { mode: "local", capabilities: { invites: false }, getCoach: async () => null },
    mode: "local",
    isDemo: false,
    isTester: estado.isTester,
    plan: "free",
    returnTo: estado.returnTo,
    updateProfile: async () => undefined,
    signOut: async () => undefined,
  }),
}));
vi.mock("@/components/pwa", () => ({ InstallCard: () => null }));
vi.mock("@/components/backup-reminder", () => ({ BackupReminder: () => null, backupDoneText: () => "" }));
vi.mock("@/components/backup-restore", () => ({ RestoreBackupButton: () => null }));
vi.mock("@/components/colar-link", () => ({ ColarLink: () => null }));
vi.mock("@/components/tester", () => ({ FeedbackDialog: () => null }));
vi.mock("@/lib/transfer-client", () => ({ makeBackup: async () => null }));
vi.mock("@/lib/analytics", () => ({ track: () => undefined, reportError: () => undefined }));
vi.mock("@/lib/flags", () => ({ estadoChave: () => "desligado", questionarioLigado: () => false }));

const { default: ContaPage } = await import("@/app/(painel)/conta/page");

const SHA = process.env.NEXT_PUBLIC_BUILD_SHA;
const AT = process.env.NEXT_PUBLIC_BUILD_AT;
afterEach(() => {
  process.env.NEXT_PUBLIC_BUILD_SHA = SHA;
  process.env.NEXT_PUBLIC_BUILD_AT = AT;
  if (SHA === undefined) delete process.env.NEXT_PUBLIC_BUILD_SHA;
  if (AT === undefined) delete process.env.NEXT_PUBLIC_BUILD_AT;
  estado.role = "athlete";
  estado.isTester = false;
  estado.returnTo = null;
});

/** Texto do rodapé (`<p data-versao>`); null sem rodapé. */
function rodape(): string | null {
  const h = renderToStaticMarkup(createElement(ContaPage));
  const m = h.match(/<p data-versao="[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  return m ? m[1]!.replace(/<[^>]+>/g, "").trim() : null;
}

describe("Rodapé de versão na Conta (R3-2)", () => {
  it('"Versão a1b2c3d · 26/11 · links v1" com o build da Vercel', () => {
    process.env.NEXT_PUBLIC_BUILD_SHA = "a1b2c3d";
    // Meio-dia em UTC: 26/11 em qualquer fuso do Brasil (e no do servidor de teste).
    process.env.NEXT_PUBLIC_BUILD_AT = "2026-11-26T15:00:00.000Z";
    expect(rodape()).toBe(`Versão a1b2c3d · 26/11 · links v${TRANSFER_VERSION}`);
  });

  it('build local (sem a variável): "Versão local", sem data inventada', () => {
    delete process.env.NEXT_PUBLIC_BUILD_SHA;
    delete process.env.NEXT_PUBLIC_BUILD_AT;
    expect(rodape()).toBe(`Versão local · links v${TRANSFER_VERSION}`);
  });

  it("valor fora do formato nunca aparece cru (vira 'local')", () => {
    process.env.NEXT_PUBLIC_BUILD_SHA = "sk_live_1234567890abcdef";
    process.env.NEXT_PUBLIC_BUILD_AT = "ontem";
    const r = rodape()!;
    expect(r).toBe(`Versão local · links v${TRANSFER_VERSION}`);
    expect(r).not.toContain("sk_live");
  });

  it("aparece também para o personal, no perfil de teste e em 'Ver como aluno' (sem o botão Sair)", () => {
    process.env.NEXT_PUBLIC_BUILD_SHA = "0f1e2d3";
    estado.role = "coach";
    expect(rodape()).toMatch(/^Versão 0f1e2d3/);
    estado.isTester = true;
    expect(rodape()).toMatch(/^Versão 0f1e2d3/);
    estado.isTester = false;
    estado.returnTo = "/alunos/s1";
    expect(rodape()).toMatch(/^Versão 0f1e2d3/);
  });
});
