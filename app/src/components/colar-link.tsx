"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Smartphone } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { parsePacket } from "@/lib/domain/transfer";
import { packedFromText, pastedLinkHref, unpackData } from "@/lib/share-link";

const BAD_LINK = "Esse link não é do Shape Real ou veio cortado. Peça para reenviar.";

/**
 * "Recebeu um link do WhatsApp? Colar aqui": abre a ficha (/abrir) ou os treinos (/receber) a partir do
 * texto colado (a mensagem inteira serve). No iPhone, o app da tela de início não divide os dados com o
 * Safari e o WhatsApp sempre abre o link no Safari: colar dentro do app é o caminho que funciona.
 * Campo de texto em vez de ler a área de transferência (no iPhone isso pede permissão a cada vez).
 * O texto colado não vai para a medição de uso nem para o registro de erros, e o campo é limpo depois do uso.
 */
export function ColarLink({ className }: { className?: string }) {
  const { mode } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelId = useId();
  const fieldId = useId();
  const hintId = useId();
  const errId = useId();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) area.current?.focus();
  }, [open]);

  // Com conta na nuvem, ficha e treinos já aparecem sozinhos: não há link para colar.
  if (mode === "supabase") return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pasted = text;
    setText("");
    setErr(null);
    const packed = packedFromText(pasted);
    if (!packed) return setErr(BAD_LINK);
    setBusy(true);
    try {
      const packet = parsePacket(await unpackData(packed));
      if (!packet) return setErr(BAD_LINK);
      router.push(pastedLinkHref(packet.kind, packed));
    } catch {
      // Sem reportError: o erro só diria que o texto colado não é um link válido.
      setErr(BAD_LINK);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          setErr(null);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-ficha)] text-left text-sm text-steel hover:text-iron"
      >
        <ClipboardPaste className="size-4 shrink-0" aria-hidden />
        <span>
          Recebeu um link do WhatsApp? <span className="font-semibold text-plate-blue-ink underline underline-offset-2">Colar aqui</span>
        </span>
      </button>
      {open ? (
        <form id={panelId} onSubmit={submit} className="mt-2 space-y-3" noValidate>
          <div>
            <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold text-iron">
              Cole o link que chegou no WhatsApp
            </label>
            <textarea
              id={fieldId}
              ref={area}
              rows={3}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (err) setErr(null);
              }}
              aria-describedby={err ? `${hintId} ${errId}` : hintId}
              aria-invalid={Boolean(err) || undefined}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              className={cx(
                "block min-h-24 w-full rounded-[var(--radius-ficha)] border bg-paper px-3 py-2.5 text-[0.9375rem] leading-relaxed text-iron placeholder:text-pencil focus:border-iron focus:outline-none focus-visible:outline-2 focus-visible:outline-plate-blue",
                err ? "border-plate-red/60" : "border-rule-strong",
              )}
            />
            <p id={hintId} className="mt-1 text-[0.8125rem] text-steel">
              Pode colar a mensagem inteira.
            </p>
            {err ? (
              <p id={errId} role="alert" className="mt-1 text-sm text-plate-red-ink">
                {err}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" loading={busy} disabled={!text.trim()}>
            Abrir link
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Card do topo de /abrir e /receber no Safari do iPhone sem perfil: quem usa o app da tela de início
 * precisa colar o link lá dentro (os dados do app não aparecem no Safari, e vice-versa).
 */
export function ColarNoAppCard({ onSaveHere, saving, className }: { onSaveHere?: () => void; saving?: boolean; className?: string }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cx("rounded-[var(--radius-ficha)] border border-plate-blue/30 bg-plate-blue/5 p-4", className)}>
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-plate-blue-ink" aria-hidden />
        <div className="min-w-0">
          <h2 id={titleId} className="font-bold">
            Usa o Shape Real pela tela de início?
          </h2>
          <p className="mt-1 text-[0.9375rem]">
            No WhatsApp, toque e segure o link e copie. Depois, abra o app e toque em <strong>Colar aqui</strong>.
          </p>
        </div>
      </div>
      {onSaveHere ? (
        <Button variant="secondary" className="mt-3 w-full" loading={saving} onClick={onSaveHere}>
          Salvar aqui mesmo
        </Button>
      ) : null}
    </section>
  );
}
