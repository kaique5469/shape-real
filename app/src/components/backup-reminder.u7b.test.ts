import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * U7b (U7 §3.4, critério 12): em Conta, a linha da cópia de segurança mostra só a situação, sem "Fazer agora".
 * O botão "Fazer cópia de segurança" do painel é o único gatilho ali.
 * Render no servidor: `lastBackupAt` vem do snapshot do servidor (null = nunca fez cópia).
 */
vi.mock("@/lib/app-context", () => ({
  useApp: () => ({
    ready: true,
    user: { id: "u1", role: "coach", name: "Personal", createdAt: "2026-01-01T12:00:00.000Z", onboarded: true },
    repo: {},
    mode: "local",
    isDemo: false,
    returnTo: null,
  }),
}));
vi.mock("@/lib/data/local", () => ({ BACKUP_EVENT: "sr:backup", lastBackupAt: () => null }));
vi.mock("@/lib/transfer-client", () => ({ makeBackup: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ reportError: vi.fn() }));

const { BackupReminder } = await import("@/components/backup-reminder");

describe("BackupReminder em Conta (U7b)", () => {
  it('mostra a situação curta e nenhum botão "Fazer agora"', () => {
    const out = renderToStaticMarkup(createElement(BackupReminder, { where: "conta" }));
    expect(out).toContain("Nenhuma cópia ainda");
    expect(out).not.toContain("Fazer agora");
    expect(out).not.toContain("<button");
    expect(out).not.toMatch(/plate-red/);
  });

  it("fora de Conta não aparece sem os dados carregados (o aviso depende da contagem)", () => {
    expect(renderToStaticMarkup(createElement(BackupReminder, { where: "alunos" }))).toBe("");
  });
});
