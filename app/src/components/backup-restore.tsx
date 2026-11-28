"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Alert, Button, Dialog, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { backupSummary, TEXTO_PROBLEMA_DA_COPIA, textoDoPlano, textoRodadasOmitidas, type Backup, type PlanoRestauracao } from "@/lib/domain/export";
import type { Profile } from "@/lib/domain/types";
import { lerCopia, planejarRestauracao, restoreBackup } from "@/lib/transfer-client";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "Restaurar cópia": escolhe o arquivo, confirma e restaura neste aparelho (modo sem conta), abre o perfil
 * restaurado e leva para Hoje (aluno) ou Alunos (personal).
 *  - origin "conta": botão secundário (o texto de apoio fica no painel de Conta);
 *  - origin "entrar": linha "Já usava o Shape Real? Restaurar cópia" já com o texto de apoio embaixo
 *    (quem coloca o componente em /entrar não precisa repetir a explicação).
 * Rodada 3 (R3-6 A e R3-13): o arquivo é conferido antes de qualquer gravação (cópia de versão mais nova pede para
 * atualizar); o diálogo mostra o plano (o que fica deste aparelho e o que entra) antes de confirmar; depois de
 * restaurar, avisa quando respostas de saúde apagadas aqui não voltaram.
 */
export function RestoreBackupButton({ origin, className }: { origin: "entrar" | "conta"; className?: string }) {
  const { mode, enterLocalProfile } = useApp();
  const router = useRouter();
  const [pending, setPending] = useState<Backup | null>(null);
  const [plano, setPlano] = useState<PlanoRestauracao | null>(null);
  /**
   * Depois de restaurar com respostas que não voltaram: o aviso, o perfil a abrir e para onde ir ao continuar. O perfil só
   * é aberto em "Continuar": em /entrar, abrir o perfil já leva para Hoje ou Alunos, e o aviso sumiria sem ser lido.
   */
  const [depois, setDepois] = useState<{ linhas: string[]; destino: string; profile: Profile } | null>(null);
  const seguiu = useRef(false);
  const [busy, setBusy] = useState(false);
  /** Arquivo que não serve (lido antes de abrir o diálogo): aparece junto do botão de escolher o arquivo. */
  const [err, setErr] = useState<string | null>(null);
  /** A restauração falhou com o diálogo aberto: o aviso fica no diálogo, junto de "Tentar de novo" e "Cancelar". */
  const [falha, setFalha] = useState<string | null>(null);
  const hintId = useId();
  const planoId = useId();

  // Restaurar grava no aparelho: com conta na nuvem os dados já estão lá.
  if (mode === "supabase") return null;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    const text = await file.text().catch(() => "");
    const lida = text ? lerCopia(text) : ({ problema: "invalido" } as const);
    if ("problema" in lida) return setErr(TEXTO_PROBLEMA_DA_COPIA[lida.problema]);
    setFalha(null);
    setPlano(planejarRestauracao(lida.copia));
    setPending(lida.copia);
  }

  function fechar() {
    setPending(null);
    setPlano(null);
    setFalha(null);
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setFalha(null);
    try {
      const r = await restoreBackup(pending);
      track("backup_restored", { origem: origin, role: r.profile.role, students: r.students, v: pending.v ?? 1 });
      fechar();
      const destino = !r.profile.onboarded ? "/onboarding" : r.profile.role === "coach" ? "/alunos" : "/hoje";
      if (r.rodadasOmitidas.length) {
        seguiu.current = false;
        setDepois({ linhas: r.rodadasOmitidas.map(textoRodadasOmitidas), destino, profile: r.profile });
      } else {
        enterLocalProfile(r.profile);
        router.push(destino);
      }
    } catch (e) {
      reportError(e, `${origin}:restaurar`);
      // Nunca sucesso: cota → "Não coube neste aparelho. Nada foi alterado…"; volta que falhou → "A restauração ficou
      // incompleta. Restaure de novo o mesmo arquivo." O diálogo fica aberto (tentar de novo é restaurar o mesmo arquivo),
      // com o plano relido do aparelho como ficou.
      setFalha(e instanceof Error && e.message ? e.message : "Não foi possível restaurar. Tente de novo.");
      setPlano(planejarRestauracao(pending));
    } finally {
      setBusy(false);
    }
  }

  /** "Continuar" (ou fechar) o aviso de depois da restauração: abre o perfil restaurado e segue. Uma vez só. */
  function continuar() {
    if (!depois || seguiu.current) return;
    seguiu.current = true;
    enterLocalProfile(depois.profile);
    router.push(depois.destino);
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

      <Dialog open={Boolean(pending)} onClose={() => (busy ? undefined : fechar())} title="Restaurar esta cópia?">
        {pending && summary ? (
          <div className="space-y-4">
            <p className="text-[0.9375rem] text-steel">
              Cópia de <strong className="text-iron">{pending.profile.name}</strong>
              {pending.exportedAt ? `, de ${new Date(pending.exportedAt).toLocaleDateString("pt-BR")}` : ""}: {plural(summary.programs, "ficha", "fichas")}, {plural(summary.sessions, "treino", "treinos")}
              {summary.students ? ` e ${plural(summary.students, "aluno", "alunos")}` : ""}. Fotos não entram na cópia.
            </p>
            {/* Plano (R3-6 A.4): o que fica deste aparelho e o que entra, antes de confirmar. */}
            {plano ? (
              <div id={planoId} className="space-y-2">
                {textoDoPlano(plano).map((linha) => (
                  <p key={linha} className="text-[0.9375rem] text-steel">
                    {linha}
                  </p>
                ))}
              </div>
            ) : null}
            {summary.students ? <p className="text-[0.9375rem] text-steel">Restaurar mantém as respostas de questionário mais novas de cada aluno.</p> : null}
            {falha ? <Alert tone="error">{falha}</Alert> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={fechar} disabled={busy}>
                Cancelar
              </Button>
              <Button loading={busy} onClick={confirm} aria-describedby={plano ? planoId : undefined}>
                {falha ? "Tentar de novo" : "Restaurar"}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(depois)} onClose={continuar} title="Cópia restaurada">
        {depois ? (
          <div className="space-y-4">
            {depois.linhas.map((linha) => (
              <p key={linha} className="text-[0.9375rem] text-steel">
                {linha}
              </p>
            ))}
            <div className="flex justify-end">
              <Button onClick={continuar}>Continuar</Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
