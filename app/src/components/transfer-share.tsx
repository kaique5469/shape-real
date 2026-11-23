"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Send, Smartphone } from "lucide-react";
import { StatusRegion } from "@/components/delivery-status";
import { Alert, Button, Dialog, Skeleton } from "@/components/ui";
import { reportError, track, type TreinosLinkWhere } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { prepStatusText, resendCounts, resendEntry, resendNote, sessionDelivery, type PrepEntry, type PrepVia, type SessionDelivery } from "@/lib/domain/delivery";
import { firstName, waLink, waPhone } from "@/lib/domain/format";
import { buildFichaPacket, buildTreinosPacket, MAX_SESSIONS_PER_LINK, treinosMessage } from "@/lib/domain/transfer";
import { coachSignature } from "@/lib/domain/cref";
import type { Profile, Session } from "@/lib/domain/types";
import { packData } from "@/lib/share-link";
import { markSessionsPrepared, prepLog, sentSessionIds } from "@/lib/transfer-client";

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

function CopyButton({ text, label = "Copiar mensagem", onCopied }: { text: string; label?: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="flex-1 whitespace-nowrap"
      icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* sem área de transferência: o botão do WhatsApp continua */
        }
      }}
    >
      {copied ? "Copiado" : label}
    </Button>
  );
}

/**
 * Personal → celular do aluno. Monta um link com a ficha ativa e a dieta; o aluno abre e passa a treinar
 * pelo app no próprio celular, sem cadastro.
 */
export function SendToStudent({ student, className, variant = "secondary" }: { student: Profile; className?: string; variant?: "primary" | "secondary" }) {
  const { user, repo } = useApp();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ link: string; text: string; programName: string | null; dietName: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const first = firstName(student.name);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    setState(null);
    setErr(null);
    (async () => {
      const [programs, diet, exercises, foods] = await Promise.all([repo.listPrograms(student.id), repo.getDiet(student.id), repo.listCustomExercises(user.id), repo.listCustomFoods(user.id)]);
      const program = programs.find((p) => p.active) ?? null;
      const usableDiet = diet && diet.meals.some((m) => m.items.length) ? diet : null;
      const packet = buildFichaPacket({ coach: user, student, program, diet: usableDiet, customExercises: exercises, customFoods: foods });
      const link = `${origin()}/abrir#d=${await packData(packet)}`;
      // Assinatura única do personal ("Nome · CREF …"), a mesma da ficha impressa, da dieta e do relatório.
      const coachName = (user.name.trim() && user.name !== "Personal" ? coachSignature({ name: user.name, cref: user.cref }) : undefined) ?? "seu personal";
      const what = program && usableDiet ? "sua ficha e sua dieta" : program ? "sua ficha" : "sua dieta";
      const text = `Oi, ${first}! ${what[0]!.toUpperCase()}${what.slice(1)} ${program && usableDiet ? "estão" : "está"} no Shape Real. Abra este link no seu celular para treinar, registrar as cargas e me mandar cada treino (não precisa cadastro):\n${link}\n\n— ${coachName}`;
      if (alive) setState({ link, text, programName: program?.name ?? null, dietName: usableDiet?.name ?? null });
    })().catch((e) => {
      reportError(e, "link:montar-ficha");
      if (alive) setErr("Não foi possível montar o link. Tente de novo.");
    });
    return () => {
      alive = false;
    };
  }, [open, user, repo, student, first]);

  const sent = (via: "whatsapp" | "copy") => track("ficha_link_sent", { via, has_program: Boolean(state?.programName), has_diet: Boolean(state?.dietName), direct: Boolean(waPhone(student.phone)) });
  const empty = state && !state.programName && !state.dietName;

  return (
    <>
      <Button variant={variant} className={className} icon={<Smartphone className="size-4" />} onClick={() => setOpen(true)}>
        Enviar para o celular de {first}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Enviar para o celular de ${first}`}>
        <div className="space-y-4">
          <p className="text-[0.9375rem] text-steel">
            {first} abre o link no celular {student.sex === "F" ? "dela" : "dele"} e passa a treinar pelo app, sem cadastro. Depois de cada treino, {student.sex === "F" ? "ela" : "ele"} manda o resultado de volta e você registra no painel com um toque.
          </p>
          {err ? <Alert tone="error">{err}</Alert> : null}
          {!state && !err ? <Skeleton className="h-24" /> : null}
          {state ? (
            <>
              <ul className="ruled rounded-[var(--radius-ficha)] border border-rule bg-chalk text-[0.9375rem]">
                <li className="flex justify-between gap-3 px-3 py-2">
                  <span className="text-steel">Ficha</span>
                  <span className="min-w-0 truncate text-right font-semibold">{state.programName ?? "nenhuma ativa"}</span>
                </li>
                <li className="flex justify-between gap-3 px-3 py-2">
                  <span className="text-steel">Dieta</span>
                  <span className="min-w-0 truncate text-right font-semibold">{state.dietName ?? "não enviada"}</span>
                </li>
              </ul>
              {empty ? (
                <Alert tone="warn">Monte a ficha ou a dieta de {first} antes de enviar.</Alert>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={waLink(state.text, student.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => sent("whatsapp")}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] bg-plate-green px-4 font-semibold text-white hover:bg-plate-green-ink"
                    >
                      <MessageCircle className="size-4" aria-hidden /> Enviar no WhatsApp
                    </a>
                    <CopyButton text={state.text} onCopied={() => sent("copy")} />
                  </div>
                  <p className="text-sm text-steel">Mudou a ficha ou a dieta? Envie de novo: o celular de {first} atualiza e mantém os treinos dele.</p>
                </>
              )}
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

/** Treinos ainda não enviados ao personal (aparelho do aluno que recebeu a ficha por link). Sem mudança de comportamento. */
export function usePendingWorkouts(sessions: Session[] | undefined, version = 0): Session[] {
  const { user } = useApp();
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (user) setSent(sentSessionIds(user.id));
  }, [user, sessions, version]);
  if (!user?.remoteCoach || !sessions) return [];
  return sessions.filter((s) => !sent.has(s.id));
}

/** Lê do aparelho o estado de envio de cada treino (lista antiga + log de toques), na hora em que é chamada. */
function readDelivery(userId: string): (id: string) => SessionDelivery {
  const legacySent = sentSessionIds(userId);
  const log = prepLog(userId);
  return (id) => sessionDelivery({ id, legacySent, log });
}

/**
 * Estado do envio de cada treino no aparelho do aluno (U2 §3.2). Só existe com personal remoto no modo local
 * (T5); `sessions` undefined (ex.: "Ver como aluno") desliga. `version` relê o aparelho depois de um toque.
 */
export function useSessionDelivery(sessions: Session[] | undefined, version = 0): { enabled: boolean; stateOf: (id: string) => SessionDelivery | null } {
  const { user, mode } = useApp();
  const on = Boolean(user?.remoteCoach && mode === "local" && sessions);
  const [read, setRead] = useState<((id: string) => SessionDelivery) | null>(null);
  useEffect(() => {
    setRead(() => (on && user ? readDelivery(user.id) : null));
  }, [on, user, sessions, version]);
  const stateOf = useCallback((id: string) => (on && read ? read(id) : null), [on, read]);
  return { enabled: on && read !== null, stateOf };
}

/**
 * Aluno → personal. Manda os treinos pelo WhatsApp: o texto mostra o que foi feito e o link registra
 * tudo no painel do personal. O toque grava canal e hora por treino (`markSessionsPrepared`): o app registra
 * o que viu (o toque, a cópia), nunca que a mensagem saiu ou chegou.
 */
export function SendToCoach({
  sessions,
  where,
  label,
  className,
  variant = "primary",
  size,
  onSent,
}: {
  sessions: Session[];
  /** Medição (`treinos_link_sent.where`). */
  where?: TreinosLinkWhere;
  label?: string;
  className?: string;
  /** "ghost": ação secundária com cara de link (ex.: "Enviar de novo" no fim do treino, depois do envio). */
  variant?: "primary" | "secondary" | "inverse" | "ghost";
  size?: "sm" | "md" | "lg";
  /** Depois do toque: canal e a hora gravada (a mesma do registro, para o texto "Envio iniciado às 18:40"). */
  onSent?: (via: PrepVia, at: string) => void;
}) {
  const { user, repo } = useApp();
  const [open, setOpen] = useState(false);
  // Os treinos do link ficam fixos enquanto o diálogo está aberto: o toque marca exatamente os que foram na mensagem,
  // mesmo que a lista de quem chamou mude (ex.: os pendentes somem depois da cópia).
  const [shown, setShown] = useState<Session[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<{ via: PrepVia; at: string } | null>(null);
  const coach = user?.remoteCoach;
  const coachFirst = coach ? firstName(coach.name) : "seu personal";

  useEffect(() => {
    if (!open || !user || !coach) return;
    let alive = true;
    setMsg(null);
    setErr(null);
    setStatus(null);
    // Nota de reenvio: o toque mais recente entre os treinos desta mensagem (lida ao abrir).
    const stateOf = readDelivery(user.id);
    setNote(
      resendNote(
        shown.map((s) => resendEntry(stateOf(s.id))).filter((e): e is PrepEntry | "antigo" => e !== null),
        coachFirst,
      ),
    );
    (async () => {
      // Medidas registradas pelo aluno vão junto (o personal acompanha peso e circunferências).
      const metrics = await repo.listMetrics(user.id).catch(() => []);
      const packet = buildTreinosPacket({ student: user, coachId: coach.id, studentRef: coach.studentRef, sessions: shown, metrics: metrics.slice(-12) });
      const link = `${origin()}/receber#d=${await packData(packet)}`;
      if (alive) setMsg(treinosMessage(shown, link, coachFirst));
    })().catch((e) => {
      reportError(e, "link:montar-treinos");
      if (alive) setErr("Não foi possível montar a mensagem. Tente de novo.");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!coach || (!sessions.length && !open)) return null;

  function start() {
    setShown([...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_SESSIONS_PER_LINK));
    setOpen(true);
  }

  function sent(via: PrepVia) {
    if (!user || !shown.length) return;
    const at = new Date().toISOString();
    const stateOf = readDelivery(user.id);
    const { resend, novos } = resendCounts(shown.map((s) => stateOf(s.id)));
    markSessionsPrepared(
      user.id,
      shown.map((s) => s.id),
      via,
      at,
    );
    track("treinos_link_sent", { via, sessions: shown.length, where, resend, novos });
    setStatus({ via, at });
    onSent?.(via, at);
  }

  return (
    <>
      {sessions.length ? (
        <Button variant={variant} size={size} className={className} icon={<Send className="size-4" />} onClick={start}>
          {label ?? (sessions.length === 1 ? `Enviar treino para ${coachFirst}` : `Enviar ${sessions.length} treinos para ${coachFirst}`)}
        </Button>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Enviar para ${coachFirst}`}>
        <div className="space-y-4">
          <p className="text-[0.9375rem] text-steel">
            A mensagem mostra o que você fez. O link dentro dela registra {shown.length === 1 ? "o treino" : `os ${shown.length} treinos`} no painel de {coachFirst}, com cargas e repetições.
          </p>
          {err ? <Alert tone="error">{err}</Alert> : null}
          {!msg && !err ? <Skeleton className="h-28" /> : null}
          {msg ? (
            <>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-ficha)] border border-rule bg-chalk px-3 py-2 font-sans text-sm">{msg.split("\n\nPara registrar")[0]}</pre>
              <div className="flex flex-wrap gap-2">
                <a
                  href={waLink(msg, coach.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    sent("whatsapp");
                    setOpen(false);
                  }}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] bg-plate-green px-4 font-semibold text-white hover:bg-plate-green-ink"
                >
                  <MessageCircle className="size-4" aria-hidden /> Enviar no WhatsApp
                </a>
                <CopyButton text={msg} onCopied={() => sent("copy")} />
              </div>
            </>
          ) : null}
        </div>
        {/* Sempre montada (mesmo antes da mensagem existir) e fora do space-y: vazia, não abre espaço. Só o texto muda. */}
        <StatusRegion className="mt-3" text={status ? prepStatusText(status.via, status.at, coachFirst, "aluno") : null} icon={status?.via === "copy" ? "copia" : "whatsapp"} />
        {msg && note ? <p className="mt-3 text-sm text-steel">{note}</p> : null}
      </Dialog>
    </>
  );
}
