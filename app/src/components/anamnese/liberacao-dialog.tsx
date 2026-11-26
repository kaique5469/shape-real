"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, Button, Dialog, Field, Input, Segmented, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { RESTRICOES_MAX, diaLocal, errosLiberacao, type FormLiberacao } from "@/lib/domain/anamnese-ficha";
import type { AlertId, Alerta, Liberacao } from "@/lib/domain/anamnese-types";
import { reportError } from "@/lib/analytics";
import { abertosParaLiberar, comLiberacao, novaLiberacao } from "@/lib/domain/triagem";
import type { Profile } from "@/lib/domain/types";

const POR: { value: Liberacao["por"]; label: string }[] = [
  { value: "medico", label: "Médico(a)" },
  { value: "obstetra", label: "Obstetra" },
  { value: "fisio", label: "Fisioterapeuta" },
  { value: "outro", label: "Outro profissional de saúde" },
];

const vazio = (alertas: AlertId[], hoje: Date): FormLiberacao => ({ data: diaLocal(hoje), modo: "livre", restricoes: "", alertas });

/**
 * Registrar liberação em 3 toques (spec §6.4): quem liberou, data (hoje por padrão, nunca futura), restrições
 * opcionais e os pontos cobertos (os vermelhos, laranja e A-DOENCA-ATIVO abertos, todos marcados). Entrega 1:
 * liberação simples, sem validade nem reconfirmação. Grava no perfil do aluno; nenhum evento de medição.
 * Raiz com `ph-no-capture`.
 */
export function LiberacaoDialog(props: { open: boolean; onClose: () => void; student: Profile; alertas: Alerta[]; onSaved: (p: Profile) => void }): ReactElement | null {
  const { open, onClose, student, onSaved } = props;
  const { repo } = useApp();
  const abertos = abertosParaLiberar(props.alertas);
  const ids = abertos.map((a) => a.id);
  const chave = ids.join(",");
  const [form, setForm] = useState<FormLiberacao>(() => vazio(ids, new Date()));
  const [tentou, setTentou] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const uid = useId();
  const primeiro = useRef<HTMLDivElement>(null);

  // Cada abertura começa do zero, com todos os pontos abertos marcados.
  useEffect(() => {
    if (!open) return;
    setForm(vazio(chave ? (chave.split(",") as AlertId[]) : [], new Date()));
    setTentou(false);
    setErro(null);
    setBusy(false);
  }, [open, chave]);

  const hoje = new Date();
  const erros = errosLiberacao(form, hoje);
  const mostra = (k: keyof typeof erros) => (tentou ? erros[k] : undefined);
  const set = (p: Partial<FormLiberacao>) => setForm((f) => ({ ...f, ...p }));
  const id = (s: string) => `${uid}-${s}`;

  async function salvar() {
    setTentou(true);
    setErro(null);
    if (Object.keys(erros).length) {
      // Leva o foco ao primeiro controle com problema; o resumo em role="alert" lê as mensagens.
      requestAnimationFrame(() => {
        const nota = primeiro.current?.querySelector("[data-field-error]");
        nota?.closest("[role='group'], label, fieldset")?.querySelector<HTMLElement>("button, input, textarea")?.focus();
      });
      return;
    }
    setBusy(true);
    try {
      const lib = novaLiberacao({ por: form.por!, data: form.data, restricoes: form.modo === "restricoes" ? form.restricoes : undefined, alertas: form.alertas, agora: new Date().toISOString() });
      const saved = await repo.saveProfile(comLiberacao(student, lib));
      onSaved(saved);
      onClose();
    } catch (e) {
      // Só o local: nada do formulário vai para o acompanhamento de erros.
      reportError(e, "liberacao:salvar");
      setErro("Não foi possível registrar a liberação neste aparelho. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Registrar liberação">
      <div ref={primeiro} className="ph-no-capture space-y-5">
        {abertos.length ? null : <Alert tone="info">Nenhum ponto aberto para liberar nas respostas atuais.</Alert>}
        <Field group label="Quem liberou?" error={mostra("por")} noteId={id("por")}>
          <Segmented<Liberacao["por"] | "">
            label="Quem liberou?"
            value={form.por ?? ""}
            onChange={(v) => v && set({ por: v })}
            className="grid grid-cols-1 sm:grid-cols-2"
            options={POR}
          />
        </Field>
        <Field label="Quando?" error={mostra("data")} noteId={id("data")}>
          <Input
            type="date"
            value={form.data}
            max={diaLocal(hoje)}
            onChange={(e) => set({ data: e.target.value })}
            aria-invalid={mostra("data") ? true : undefined}
            aria-describedby={mostra("data") ? id("data") : undefined}
            className="max-w-56"
          />
        </Field>
        <Field group label="Liberou para…">
          <Segmented<FormLiberacao["modo"]>
            label="Liberou para…"
            value={form.modo}
            onChange={(modo) => set({ modo })}
            className="grid grid-cols-1 sm:grid-cols-2"
            options={[
              { value: "livre", label: "Atividade sem restrição" },
              { value: "restricoes", label: "Com restrições" },
            ]}
          />
        </Field>
        {form.modo === "restricoes" ? (
          <Field label="Restrições" error={mostra("restricoes")} hint="Aparecem no resumo e no gerador. Não entram sozinhas em Limitações." noteId={id("restricoes")}>
            <Textarea
              value={form.restricoes}
              onChange={(e) => set({ restricoes: e.target.value.slice(0, RESTRICOES_MAX) })}
              maxLength={RESTRICOES_MAX}
              rows={2}
              className="min-h-20"
              aria-invalid={mostra("restricoes") ? true : undefined}
              aria-describedby={id("restricoes")}
            />
          </Field>
        ) : null}
        {abertos.length ? (
          <fieldset aria-describedby={mostra("alertas") ? id("alertas") : undefined}>
            <legend className="mb-1.5 block text-sm font-semibold text-iron">Para quais pontos?</legend>
            <ul className="space-y-1.5">
              {abertos.map((a) => {
                const on = form.alertas.includes(a.id);
                return (
                  <li key={a.id}>
                    <label className={cx("flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-ficha)] border px-3 py-2.5 text-[0.9375rem]", on ? "border-iron" : "border-rule-strong")}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => set({ alertas: e.target.checked ? [...form.alertas, a.id] : form.alertas.filter((x) => x !== a.id) })}
                        className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]"
                      />
                      <span className="min-w-0">{a.titulo}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {mostra("alertas") ? (
              <p id={id("alertas")} data-field-error className="mt-1 text-sm text-danger">
                {mostra("alertas")}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        <p className="flex items-start gap-2 text-sm text-steel">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Não precisa anexar documento. Guarde o original com você.</span>
        </p>
        {tentou && Object.keys(erros).length ? (
          <p role="alert" className="sr-only">
            {Object.values(erros).join(" ")}
          </p>
        ) : null}
        {erro ? <Alert tone="error">{erro}</Alert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} loading={busy} disabled={!abertos.length}>
            Registrar liberação
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
