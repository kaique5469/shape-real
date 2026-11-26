"use client";

import { useEffect, useState, type ReactElement } from "react";
import { Trash2 } from "lucide-react";
import { Alert, Button, Dialog } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { evAnamneseDeleted } from "@/lib/anamnese-events";
import { useApp } from "@/lib/app-context";
import { APAGAR_CAIXA, APAGAR_TITULO, apagarRespostas, idsDeRespostas } from "@/lib/domain/anamnese-perfil";
import { ehExemplo } from "@/lib/domain/anamnese-types";
import type { Profile } from "@/lib/domain/types";
import { marcarApagado } from "@/lib/questionario-client";

/**
 * "Apagar respostas do questionário" (spec §11.2), no fim do resumo e no menu do aluno: tira as respostas atuais e
 * anteriores, as liberações e o pedido; a caixa "Apagar também…" tira o que o app copiou para o cadastro. Depois de
 * gravar, `sr:v1:qapagado:{id}` de cada rodada (só a data): a mensagem antiga do WhatsApp não traz a saúde de volta
 * sem aviso. `anamnese_deleted` só com `com_cadastro`, e nunca para aluno de exemplo. Raiz com `ph-no-capture`.
 */
export function ApagarRespostasDialog({ open, onClose, student, onSaved }: { open: boolean; onClose: () => void; student: Profile; onSaved: (p: Profile) => void }): ReactElement {
  const { repo } = useApp();
  const [comCadastro, setComCadastro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setComCadastro(false);
    setErro(null);
    setBusy(false);
  }, [open]);

  async function apagar() {
    setBusy(true);
    setErro(null);
    // Os ids saem do perfil ANTES de apagar (depois, as respostas já não estão lá); o registro só vale se gravou.
    const ids = idsDeRespostas(student);
    try {
      const saved = await repo.saveProfile(apagarRespostas(student, comCadastro));
      const at = new Date().toISOString();
      for (const id of ids) marcarApagado(id, at);
      if (!ehExemplo(student)) track("anamnese_deleted", evAnamneseDeleted(comCadastro));
      onSaved(saved);
      onClose();
    } catch (e) {
      reportError(e, "anamnese:apagar");
      setErro("Não foi possível apagar neste aparelho. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={APAGAR_TITULO(student.name)}>
      <div className="ph-no-capture space-y-4">
        <p className="text-[0.9375rem] text-steel">Saem deste aparelho as respostas, as liberações registradas e o pedido pendente. Não dá para desfazer.</p>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper p-3 text-[0.9375rem] font-semibold">
          <input type="checkbox" checked={comCadastro} onChange={(e) => setComCadastro(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]" />
          <span>{APAGAR_CAIXA}</span>
        </label>
        {erro ? <Alert tone="error">{erro}</Alert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} loading={busy} onClick={() => void apagar()}>
            Apagar respostas
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
