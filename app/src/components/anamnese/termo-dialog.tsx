"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { Alert, Button, Dialog, cx } from "@/components/ui";
import { reportError } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { TERMO_TEXTO } from "@/lib/domain/anamnese";
import { TERMO_CAIXA_PERSONAL, registrarTermo } from "@/lib/domain/anamnese-perfil";
import type { Profile } from "@/lib/domain/types";

const FALTA_CAIXA = "Marque a caixa para salvar o termo.";

/**
 * Termo do PAR-Q assinado no aparelho do personal (spec §7, passo `termo`): o texto literal do Anexo II da Lei SP
 * 16.724/2018, a caixa "{aluno} leu e concordou com o termo" e [Salvar] (`registrarTermo`: grava o nome do cadastro e a
 * data). Nenhum evento de medição (o termo é derivado de saúde, spec §11.3). Raiz com `ph-no-capture`.
 */
export function TermoDialog({ open, onClose, student, onSaved }: { open: boolean; onClose: () => void; student: Profile; onSaved: (p: Profile) => void }): ReactElement {
  const { repo } = useApp();
  const [leu, setLeu] = useState(false);
  const [falta, setFalta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLInputElement>(null);
  const faltaId = useId();

  // Cada abertura começa com a caixa desmarcada: quem marca é o aluno, na hora.
  useEffect(() => {
    if (!open) return;
    setLeu(false);
    setFalta(false);
    setErro(null);
    setBusy(false);
  }, [open]);

  async function salvar() {
    if (!leu) {
      setFalta(true);
      caixa.current?.focus();
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      const saved = await repo.saveProfile(registrarTermo(student, new Date().toISOString()));
      onSaved(saved);
      onClose();
    } catch (e) {
      reportError(e, "termo:salvar");
      setErro("Não foi possível salvar o termo neste aparelho. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Termo do PAR-Q">
      <div className="ph-no-capture space-y-4">
        <div className="space-y-2 rounded-[var(--radius-ficha)] border border-rule bg-chalk px-4 py-3 text-[1.125rem] leading-relaxed">
          {TERMO_TEXTO.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <div>
          <label className={cx("flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-ficha)] border bg-paper p-3 text-[1.125rem] font-semibold", falta && !leu ? "border-danger" : "border-rule-strong")}>
            <input
              ref={caixa}
              type="checkbox"
              checked={leu}
              onChange={(e) => setLeu(e.target.checked)}
              aria-invalid={falta && !leu ? true : undefined}
              aria-describedby={faltaId}
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]"
            />
            <span>{TERMO_CAIXA_PERSONAL(student.name)}</span>
          </label>
          {/* Sempre montado: o leitor de tela anuncia o erro na hora em que ele aparece. */}
          <p id={faltaId} aria-live="assertive" className="mt-1 text-sm text-danger empty:hidden">
            {falta && !leu ? FALTA_CAIXA : ""}
          </p>
        </div>
        {erro ? <Alert tone="error">{erro}</Alert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} loading={busy}>
            Salvar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
