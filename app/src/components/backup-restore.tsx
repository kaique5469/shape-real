"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Alert, Button, Dialog, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { backupSummary, type Backup } from "@/lib/domain/export";
import { parseBackup, restoreBackup } from "@/lib/transfer-client";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Restaurar cópia": escolhe o arquivo, confirma e restaura neste aparelho (modo sem conta), abre o perfil
 * restaurado e leva para Hoje (aluno) ou Alunos (personal).
 *  - origin "conta": botão secundário (o texto de apoio fica no painel de Conta);
 *  - origin "entrar": linha "Já usava o Shape Real? Restaurar cópia" já com o texto de apoio embaixo
 *    (quem coloca o componente em /entrar não precisa repetir a explicação).
 */
export function RestoreBackupButton({ origin, className }: { origin: "entrar" | "conta"; className?: string }) {
  const { mode, enterLocalProfile } = useApp();
  const router = useRouter();
  const [pending, setPending] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hintId = useId();

  // Restaurar grava no aparelho: com conta na nuvem os dados já estão lá.
  if (mode === "supabase") return null;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    const text = await file.text().catch(() => "");
    const parsed = text ? parseBackup(text) : null;
    if (!parsed) return setErr("Esse arquivo não é uma cópia do Shape Real.");
    setPending(parsed);
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await restoreBackup(pending);
      track("backup_restored", { origem: origin, role: r.profile.role, students: r.students, v: pending.v ?? 1 });
      enterLocalProfile(r.profile);
      setPending(null);
      router.push(!r.profile.onboarded ? "/onboarding" : r.profile.role === "coach" ? "/alunos" : "/hoje");
    } catch (e) {
      reportError(e, `${origin}:restaurar`);
      setErr(e instanceof Error && e.message ? e.message : "Não foi possível restaurar. Tente de novo.");
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  const input = <input type="file" accept="application/json,.json" className="sr-only" onChange={pick} aria-describedby={origin === "entrar" ? hintId : undefined} />;
  const summary = pending ? backupSummary(pending) : null;

  return (
    <>
      {origin === "conta" ? (
        <label className={cx("inline-flex h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-4 text-[0.9375rem] font-semibold text-iron hover:border-iron focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-plate-blue", className)}>
          <Upload className="size-4" aria-hidden /> Restaurar cópia
          {input}
        </label>
      ) : (
        <div className={className}>
          <label className="inline-flex min-h-11 cursor-pointer flex-wrap items-center gap-x-1.5 rounded-[var(--radius-ficha)] text-[0.9375rem] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-plate-blue">
            <span className="text-steel">Já usava o Shape Real?</span>
            <span className="font-semibold text-plate-blue-ink underline underline-offset-2">Restaurar cópia</span>
            {input}
          </label>
          <p id={hintId} className="text-[0.8125rem] text-steel">
            Salve o arquivo no celular (no iPhone, em Arquivos) e toque em Restaurar. Fotos não entram na cópia.
          </p>
        </div>
      )}
      {err ? (
        <Alert tone="error" className="mt-3 w-full basis-full">
          {err}
        </Alert>
      ) : null}

      <Dialog open={Boolean(pending)} onClose={() => (busy ? undefined : setPending(null))} title="Restaurar esta cópia?">
        {pending && summary ? (
          <div className="space-y-4">
            <p className="text-[0.9375rem] text-steel">
              Cópia de <strong className="text-iron">{pending.profile.name}</strong>
              {pending.exportedAt ? `, de ${new Date(pending.exportedAt).toLocaleDateString("pt-BR")}` : ""}: {plural(summary.programs, "ficha", "fichas")}, {plural(summary.sessions, "treino", "treinos")}
              {summary.students ? ` e ${plural(summary.students, "aluno", "alunos")}` : ""}. Os mesmos registros que já estiverem neste aparelho são substituídos. Fotos não entram na cópia.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button loading={busy} onClick={confirm}>
                Restaurar
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
