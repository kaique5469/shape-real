"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, DatabaseBackup } from "lucide-react";
import { cx } from "@/components/ui";
import { reportError } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { BACKUP_EVENT, lastBackupAt } from "@/lib/data/local";
import { BACKUP_REMIND_DAYS, backupReminderDue, backupStatusShort, backupStatusText, daysSince } from "@/lib/domain/export";
import { makeBackup } from "@/lib/transfer-client";

function subscribeBackup(cb: () => void) {
  window.addEventListener(BACKUP_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(BACKUP_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Data da última cópia deste aparelho; atualiza quando uma cópia é feita em qualquer tela aberta. */
export function useLastBackupAt(): string | null {
  return useSyncExternalStore(subscribeBackup, lastBackupAt, () => null);
}

/** Mensagem depois de fazer a cópia (usada aqui e no botão de Conta). */
export function backupDoneText(r: { via: "share" | "download"; fileName: string; students: number }): string {
  const withStudents = r.students ? ` com ${r.students === 1 ? "1 aluno" : `${r.students} alunos`}` : "";
  return r.via === "share" ? `Cópia feita${withStudents}. Guarde o arquivo em um lugar seguro.` : `Cópia baixada${withStudents}: ${r.fileName}. Guarde o arquivo em um lugar seguro.`;
}

/**
 * Linha "Cópia de segurança: há N dias · Fazer agora" (ou "Você ainda não fez nenhuma cópia · Fazer agora").
 * Em "conta" aparece sempre, só com a situação ("Nenhuma cópia ainda" / "Última cópia há N dias") e SEM
 * "Fazer agora": o botão do próprio painel é o único gatilho ali (U7 §3.4).
 * Em "hoje" (aluno sem personal) e "alunos" (personal), só com 14 dias ou mais sem cópia e dados que doeria
 * perder: 5 treinos ou mais, ou 1 aluno real (exemplos não contam). Ali, "Fazer agora" faz a cópia na hora.
 * Só no modo sem conta (com conta, os dados já ficam na nuvem), fora da demonstração e do "ver como aluno".
 */
export function BackupReminder({ where, className }: { where: "hoje" | "alunos" | "conta"; className?: string }) {
  const { ready, user, repo, mode, isDemo, returnTo } = useApp();
  const last = useLastBackupAt();
  const [counts, setCounts] = useState<{ sessions: number; realStudents: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "done" | "error"; text: string } | null>(null);

  const userId = user?.id;
  const role = user?.role;
  const hasCoach = Boolean(user?.remoteCoach || user?.managedBy);
  const eligible =
    ready &&
    Boolean(userId) &&
    mode === "local" &&
    !isDemo &&
    !returnTo &&
    (where === "conta" || (where === "hoje" ? role === "athlete" && !hasCoach : role === "coach"));

  useEffect(() => {
    if (!eligible || where === "conta" || !userId) return;
    let alive = true;
    (async () => {
      const [sessions, students] = await Promise.all([
        repo.listSessions(userId, { limit: 5 }).catch(() => []),
        role === "coach" ? repo.listStudents(userId).catch(() => []) : Promise.resolve([]),
      ]);
      if (alive) setCounts({ sessions: sessions.length, realStudents: students.filter((s) => !s.profile.sample).length });
    })();
    return () => {
      alive = false;
    };
  }, [eligible, where, repo, userId, role]);

  if (!eligible || !user) return null;
  // Nunca fez cópia: os 14 dias contam da criação do perfil (o aviso não aparece no primeiro dia).
  const due = where === "conta" || Boolean(counts && backupReminderDue({ lastBackupAt: last, since: user.createdAt, ...counts }));
  if (!due && !msg) return null;
  const days = daysSince(last ?? (where === "conta" ? null : user.createdAt));
  const overdue = days === null || days >= BACKUP_REMIND_DAYS;
  const inConta = where === "conta";

  async function run() {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await makeBackup(repo, user, where);
      if (r) setMsg({ tone: "done", text: backupDoneText(r) });
    } catch (e) {
      reportError(e, `copia:${where}`);
      setMsg({ tone: "error", text: "Não foi possível fazer a cópia. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cx("no-print", className)}>
      {due ? (
        inConta ? (
          // Conta: só a situação. O painel já se chama "Cópia de segurança" e tem o botão.
          <p className="flex min-h-11 items-center gap-2 text-sm leading-snug text-iron">
            <DatabaseBackup className={cx("size-4 shrink-0", overdue ? "text-warn-ink" : "text-steel")} aria-hidden />
            <span className="min-w-0">{backupStatusShort(last)}</span>
          </p>
        ) : (
          <div
            role="group"
            aria-label="Cópia de segurança"
            className={cx(
              "flex min-h-11 items-center gap-2 rounded-[var(--radius-ficha)] border pl-3.5 pr-1",
              // Atenção (U7 R3): caixa warn-surface, ícone warn-ink, texto iron.
              overdue ? "border-warn-line bg-warn-surface" : "border-rule bg-paper",
            )}
          >
            <DatabaseBackup className={cx("size-4 shrink-0", overdue ? "text-warn-ink" : "text-steel")} aria-hidden />
            {/* 360 px: texto curto, sempre em 1 linha com o "Fazer agora" (o completo a partir de sm). */}
            <p className="min-w-0 flex-1 truncate whitespace-nowrap text-sm leading-snug text-iron">
              <span className="sm:hidden">{backupStatusShort(last)}</span>
              <span className="hidden sm:inline">{backupStatusText(last)}</span>
            </p>
            <button
              type="button"
              onClick={run}
              disabled={busy}
              aria-busy={busy || undefined}
              className="min-h-11 shrink-0 rounded-[var(--radius-ficha)] px-2.5 text-sm font-semibold text-plate-blue-ink underline underline-offset-2 hover:text-iron disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Fazendo…" : "Fazer agora"}
            </button>
          </div>
        )
      ) : null}
      {msg ? (
        <p role={msg.tone === "error" ? "alert" : "status"} className={cx("flex items-start gap-1.5 text-sm", due && "mt-1.5", msg.tone === "error" ? "text-danger" : "text-steel")}>
          {msg.tone === "done" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-done" aria-hidden /> : <CircleAlert className="mt-[0.1875rem] size-3.5 shrink-0" aria-hidden />}
          <span>{msg.text}</span>
        </p>
      ) : null}
    </div>
  );
}
