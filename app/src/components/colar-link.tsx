"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, ClipboardPaste, Smartphone } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { parsePacket } from "@/lib/domain/transfer";
import { packedFromText, pastedLinkHref, unpackData } from "@/lib/share-link";

const BAD_LINK = "Esse link não é do Shape Real ou veio cortado. Peça para reenviar.";

/** "Colar aqui" com os tipos novos (questionario-receber.ts), carregado só quando o pacote não é ficha nem treinos. */
async function destinoDoColado(raw: unknown, packed: string) {
  const { destinoColado } = await import("@/lib/questionario-receber");
  return destinoColado(raw, packed);
}

/**
 * "Recebeu um link do WhatsApp? Colar aqui": abre a ficha (/abrir), os treinos e as respostas do questionário
 * (/receber) ou o pedido do questionário (/questionario) a partir do texto colado (a mensagem inteira serve). Um tipo
 * que este app não conhece pede para atualizar a página, em vez de "não é do Shape Real". No iPhone, o app da tela de início não divide os dados com o
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
      const raw = await unpackData(packed);
      const kind = (raw as { kind?: unknown } | null)?.kind;
      // Ficha e treinos: como sempre (sem carregar nada a mais).
      if (kind === "ficha" || kind === "treinos" || typeof kind !== "string") {
        const packet = parsePacket(raw);
        if (!packet) return setErr(BAD_LINK);
        return router.push(pastedLinkHref(packet.kind, packed));
      }
      // Questionário (pedido e respostas) ou um tipo que este app não conhece: a validação vem sob demanda, para não
      // pesar as telas que mostram o "Colar aqui".
      let destino: Awaited<ReturnType<typeof destinoDoColado>>;
      try {
        destino = await destinoDoColado(raw, packed);
      } catch {
        // Sem rede e sem a validação guardada: a tela de destino valida de novo e mostra o aviso certo.
        if (kind === "anamnese" || kind === "pedido_anamnese") return router.push(pastedLinkHref(kind, packed));
        return setErr(BAD_LINK);
      }
      if ("href" in destino) router.push(destino.href);
      else setErr(destino.erro);
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
                // 16 px (abaixo disso o iPhone amplia a tela ao tocar); borda `field`, `danger` com erro (U7 R9, U8 3.4).
                "block min-h-24 w-full rounded-[var(--radius-ficha)] border bg-paper px-3 py-2.5 text-base leading-relaxed text-iron placeholder:text-suggest focus:border-iron focus:outline-none focus-visible:outline-2 focus-visible:outline-plate-blue",
                err ? "border-danger" : "border-field",
              )}
            />
            <p id={hintId} className="mt-1 text-[0.8125rem] text-steel">
              Pode colar a mensagem inteira.
            </p>
            {err ? (
              <p id={errId} role="alert" data-field-error className="mt-1 flex items-start gap-1.5 text-sm text-danger">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">{err}</span>
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
