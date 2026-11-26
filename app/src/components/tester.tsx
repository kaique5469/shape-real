"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { Button, Dialog, Field, Textarea } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { waLink } from "@/lib/domain/format";
import { track } from "@/lib/analytics";
import { SOLO_TESTER_ID } from "@/lib/domain/ficha-context";

const TOPICS = ["Montar ficha", "IA", "Treino do aluno", "Dieta", "Evolução", "Visual", "Outro"] as const;

/** Faixa fina do modo teste: avisa onde ficam os dados e abre o feedback. */
export function TesterStrip() {
  const [open, setOpen] = useState(false);
  return (
    <div data-surface="dark" className="no-print flex items-center justify-between gap-3 bg-iron px-4 py-1.5 text-chalk">
      <p className="min-w-0 truncate text-[0.8125rem]">
        <span className="font-bold text-plate-yellow">Versão de teste</span>
        <span className="text-chalk/70"> · dados salvos só neste aparelho</span>
      </p>
      <button onClick={() => setOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[6px] bg-chalk px-3 pointer-coarse:h-11 text-[0.8125rem] font-bold text-iron hover:bg-white">
        <MessageSquareText className="size-4" aria-hidden /> Dar feedback
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useApp();
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("Montar ficha");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const message = `Feedback do Shape Real (${topic})${user && user.name !== "Personal" ? ` — ${user.name}` : ""}:\n${text.trim()}`;

  return (
    <Dialog
      open={open}
      onClose={() => {
        setSent(false);
        onClose();
      }}
      title="Seu feedback"
    >
      {sent ? (
        <div className="space-y-4">
          <p className="text-[0.9375rem]">Obrigado! É exatamente isso que ajuda a deixar o app redondo. Pode mandar quantos quiser.</p>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSent(false);
                setText("");
                onClose();
              }}
            >
              Fechar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[0.9375rem] text-steel">O que travou, o que faltou, o que você mudaria? Vale tudo: exercício que não achou, tela confusa, ficha que o app montou errado.</p>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Sobre o quê</legend>
            <div className="flex flex-wrap gap-1.5">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={topic === t}
                  onClick={() => setTopic(t)}
                  className={`h-10 rounded-full border px-3.5 text-sm font-semibold pointer-coarse:min-h-11 ${topic === t ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Conte o que aconteceu">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={1500} autoFocus placeholder="Ex.: fui montar a ficha da minha aluna e não achei “cadeira adutora”…" />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <a
              href={waLink(message, process.env.NEXT_PUBLIC_FEEDBACK_WHATSAPP)}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={text.trim().length < 3}
              onClick={(e) => {
                if (text.trim().length < 3) return e.preventDefault();
                track("feedback_sent", { topic, length: text.trim().length });
                setSent(true);
              }}
              className={`inline-flex h-11 items-center justify-center rounded-[6px] bg-plate-green px-4 font-semibold text-white hover:bg-plate-green-ink ${text.trim().length < 3 ? "pointer-events-none opacity-50" : ""}`}
            >
              Enviar pelo WhatsApp
            </a>
          </div>
          <p className="text-xs text-steel">Abre o WhatsApp com a mensagem pronta — é só escolher quem te mandou o link.</p>
        </div>
      )}
    </Dialog>
  );
}

/** Quando o personal está vendo o app como um aluno: caminho de volta sempre visível. */
export function ActingStrip() {
  const { user, returnTo, returnToOwner } = useApp();
  const router = useRouter();
  if (!returnTo || !user) return null;
  const viewingId = user.id;
  const solo = user.id === SOLO_TESTER_ID;
  return (
    <div className="no-print flex items-center justify-between gap-3 bg-plate-yellow px-4 py-1.5 text-iron">
      <p className="min-w-0 truncate text-[0.8125rem] font-semibold">{solo ? "Modo aluno sem personal" : `Vendo como ${user.name.trim().split(/\s+/)[0]}`}</p>
      <button
        onClick={async () => {
          const back = await returnToOwner();
          router.push(back?.role === "coach" && !solo ? `/alunos/${viewingId}` : "/alunos");
        }}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[6px] bg-iron px-3 pointer-coarse:h-11 text-[0.8125rem] font-bold text-chalk hover:bg-iron-2"
      >
        <ArrowLeft className="size-4" aria-hidden /> Voltar ao painel
      </button>
    </div>
  );
}
