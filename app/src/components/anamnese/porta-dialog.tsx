"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, OctagonX } from "lucide-react";
import { Alert, Button, Dialog } from "@/components/ui";
import { textoAntesDeGerar, type AntesDeGerar } from "@/lib/domain/anamnese-ficha";
import { NIVEL_ROTULO } from "@/lib/domain/triagem";

/**
 * Antes de gerar a ficha com as respostas (spec §6.4):
 *  - trava (alerta vermelho aberto): [Registrar liberação] [Voltar]. Com respostas ilegíveis, só a frase de §6.1 e
 *    [Voltar] (não há alerta a cobrir). Não existe caminho que gere a ficha assistida daqui;
 *  - porta (laranja aberto): [Registrar liberação] [Seguir mesmo assim]; "Seguir" só funciona com a caixa
 *    "Conversei com {aluno} sobre isso" marcada e grava o override datado (quem chama).
 * Cada título vem com o ícone e o rótulo do nível (nunca só cor). Nenhum evento de medição. Raiz com `ph-no-capture`.
 */
export function PortaDialog({
  open,
  onClose,
  antes,
  aluno,
  onRegistrar,
  onSeguir,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  antes: AntesDeGerar;
  aluno: string;
  onRegistrar: () => void;
  /** Só na porta, depois da caixa marcada. */
  onSeguir: () => void;
  busy?: boolean;
}) {
  const t = textoAntesDeGerar(antes, aluno);
  const [conversei, setConversei] = useState(false);
  const [falta, setFalta] = useState(false);
  const caixa = useRef<HTMLInputElement>(null);
  const erroId = useId();

  useEffect(() => {
    if (!open) return;
    setConversei(false);
    setFalta(false);
  }, [open]);

  if (!t) return null;
  const alertas = antes.modo === "livre" ? [] : antes.alertas;

  return (
    <Dialog open={open} onClose={onClose} title={t.titulo}>
      <div className="ph-no-capture space-y-4">
        {alertas.length ? (
          <ul className="space-y-2">
            {alertas.map((a) => {
              const vermelho = a.nivel === "vermelho";
              const Icone = vermelho ? OctagonX : FileText;
              return (
                <li key={a.id} className="flex items-start gap-2.5 rounded-[var(--radius-ficha)] border border-rule px-3 py-2.5">
                  <Icone className={vermelho ? "mt-0.5 size-[18px] shrink-0 text-danger" : "mt-0.5 size-[18px] shrink-0 text-warn-ink"} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold uppercase tracking-wide text-steel">{NIVEL_ROTULO[a.nivel]}</span>
                    <span className="block text-[0.9375rem] font-semibold">{a.titulo}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {t.texto ? (antes.modo === "trava" && antes.problema ? <Alert tone="warn">{t.texto}</Alert> : <p className="text-[0.9375rem]">{t.texto}</p>) : null}
        {t.seguir ? (
          <div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-ficha)] border border-rule-strong px-3 py-2.5 text-[0.9375rem]">
              <input
                ref={caixa}
                type="checkbox"
                checked={conversei}
                onChange={(e) => {
                  setConversei(e.target.checked);
                  if (e.target.checked) setFalta(false);
                }}
                aria-invalid={falta || undefined}
                aria-describedby={falta ? erroId : undefined}
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]"
              />
              <span>{t.conversei}</span>
            </label>
            {falta ? (
              <p id={erroId} role="alert" className="mt-1 text-sm text-danger">
                Marque “{t.conversei}” para seguir.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {t.seguir ? (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => {
                if (!conversei) {
                  setFalta(true);
                  caixa.current?.focus();
                  return;
                }
                onSeguir();
              }}
            >
              Seguir mesmo assim
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Voltar
            </Button>
          )}
          {t.registrar ? (
            <Button onClick={onRegistrar} disabled={busy}>
              Registrar liberação
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
