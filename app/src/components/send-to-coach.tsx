"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { StatusRegion } from "@/components/delivery-status";
import { Alert, Button, Dialog, Skeleton } from "@/components/ui";
import { reportError, track, type TreinosLinkWhere } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { pendenciaDeEnvio, prepStatusText, resendCounts, resendEntry, resendNote, rotuloDoEnvio, sessionDelivery, textoDoLote, TEXTO_REGISTRO_FALHOU, type PrepEntry, type PrepVia, type SessionDelivery } from "@/lib/domain/delivery";
import { firstName, waLink } from "@/lib/domain/format";
import { avisoDoLink, oQueVaiNosTreinos } from "@/lib/domain/link-aviso";
import { buildTreinosPacket, echoFor, MAX_SESSIONS_PER_LINK, treinosMessage } from "@/lib/domain/transfer";
import type { Session } from "@/lib/domain/types";
import { packData } from "@/lib/share-link";
import { declaracoesDeEnvio, declareSessionsSent, dismissSessionsReminder, markSessionsPrepared, prepLog, sentSessionIds } from "@/lib/link-client";

/**
 * Aluno → personal: os treinos para enviar e o envio pelo WhatsApp (aparelho do aluno que recebeu a ficha por link).
 * Separado de transfer-share.tsx na rodada 3 (Fundação; pedido do spec-m §5), que reexporta tudo daqui: nenhum
 * importador mudou. Os estados novos do envio (R3-3) são da trilha L, neste arquivo.
 */

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

/** Canal do toque de envio. "share" (menu de compartilhar do aparelho) fica reservado (nenhum toque grava "share" hoje). */
export type EnvioVia = PrepVia | "share";

/** Treino com toque de envio (copiado ou envio iniciado), sem "Já enviei" e sem o lembrete dispensado depois do toque. */
export interface TreinoPreparado {
  session: Session;
  via: EnvioVia;
  at: string;
}

/**
 * Pendência de envio no aparelho do aluno (rodada 3, R3-3; Hoje e Histórico consomem):
 *  - `toSend`: "para enviar" (nenhum toque nem declaração): o banner forte do Hoje e o botão do Histórico;
 *  - `prepared`: "preparado sem confirmação" (copiado ou envio iniciado, com canal e hora), sem "Já enviei" e sem o
 *    lembrete dispensado depois do toque. O Hoje só cobra os copiados (`lembreteDeCopia` em domain/delivery.ts); o
 *    envio iniciado no WhatsApp não cobra no Hoje (o Histórico mostra o estado de cada treino);
 *  - `declareSent(ids)`: "Já enviei", declaração da pessoa (nunca "recebido"). false = não gravou;
 *  - `dismiss(ids)`: dispensar o lembrete; nunca vira confirmação (o treino continua "preparado" no Histórico).
 * Toque antigo (de uma versão anterior, sem canal nem hora) não entra em nenhuma das duas listas.
 */
export interface PendingWorkouts {
  toSend: Session[];
  prepared: TreinoPreparado[];
  declareSent(ids: string[]): boolean;
  dismiss(ids: string[]): boolean;
}

/** Lê do aparelho o estado de envio de cada treino (lista antiga, log de toques e declarações), na hora em que é chamada. */
function readDelivery(userId: string): (id: string) => SessionDelivery {
  const legacySent = sentSessionIds(userId);
  const log = prepLog(userId);
  const decl = declaracoesDeEnvio(userId);
  return (id) => sessionDelivery({ id, legacySent, log, decl });
}

/** As duas listas da pendência, lidas agora do aparelho (`pendenciaDeEnvio`, puro, em domain/delivery.ts). */
function readPending(userId: string, sessions: readonly Session[]): { toSend: Session[]; prepared: TreinoPreparado[] } {
  return pendenciaDeEnvio(sessions, { legacySent: sentSessionIds(userId), log: prepLog(userId), decl: declaracoesDeEnvio(userId) });
}

const NADA: { toSend: Session[]; prepared: TreinoPreparado[] } = { toSend: [], prepared: [] };

/**
 * Pendência de envio (R3-3). Só existe com personal remoto e com `sessions` (undefined desliga, ex.: "Ver como aluno").
 * `version` relê o aparelho depois de um toque feito em outro componente; "Já enviei" e dispensar releem sozinhos.
 */
export function usePendingWorkouts(sessions: Session[] | undefined, version = 0): PendingWorkouts {
  const { user } = useApp();
  const [own, setOwn] = useState(0);
  const [lists, setLists] = useState(NADA);
  const userId = user?.id;
  const on = Boolean(user?.remoteCoach && sessions);
  useEffect(() => {
    setLists(on && userId && sessions ? readPending(userId, sessions) : NADA);
  }, [on, userId, sessions, version, own]);
  const declareSent = useCallback(
    (ids: string[]) => {
      if (!userId || !ids.length) return false;
      const ok = declareSessionsSent(userId, ids);
      setOwn((n) => n + 1);
      return ok;
    },
    [userId],
  );
  const dismiss = useCallback(
    (ids: string[]) => {
      if (!userId || !ids.length) return false;
      const ok = dismissSessionsReminder(userId, ids);
      setOwn((n) => n + 1);
      return ok;
    },
    [userId],
  );
  return useMemo(() => ({ toSend: lists.toSend, prepared: lists.prepared, declareSent, dismiss }), [lists, declareSent, dismiss]);
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
 * o que viu (o toque, a cópia), nunca que a mensagem saiu ou chegou. O link leva também a versão da ficha e da
 * dieta que este celular recebeu (`remoteCoach.recebido`, U2c).
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
  where: TreinosLinkWhere;
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
  /** R3-3: o toque não ficou registrado neste aparelho (o treino continua "para enviar"). */
  const [falhou, setFalhou] = useState(false);
  /** R3-17: o que vai no link (montado junto com a mensagem). */
  const [aviso, setAviso] = useState<string | null>(null);
  /** Quantos estavam para enviar quando o diálogo abriu (o lote mostra "20 de 23"). */
  const [total, setTotal] = useState(0);
  const coach = user?.remoteCoach;
  const coachFirst = coach ? firstName(coach.name) : "seu personal";

  useEffect(() => {
    if (!open || !user || !coach) return;
    let alive = true;
    setMsg(null);
    setErr(null);
    setStatus(null);
    setFalhou(false);
    setAviso(null);
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
      const [metrics, programs, diet] = await Promise.all([
        repo.listMetrics(user.id).catch(() => []),
        repo.listPrograms(user.id).catch(() => []),
        repo.getDiet(user.id).catch(() => null),
      ]);
      // A versão da ficha e da dieta que este celular recebeu volta junto (U2c), só do que continua igual ao que
      // chegou (sem ajuste feito aqui): o eco nunca diz ao personal que o aluno está com o conteúdo dele quando não está.
      const ficha = echoFor(coach.recebido, coach.id, programs.find((p) => p.active), diet);
      const packet = buildTreinosPacket({ student: user, coachId: coach.id, studentRef: coach.studentRef, sessions: shown, metrics: metrics.slice(-12), ficha });
      const link = `${origin()}/receber#d=${await packData(packet)}`;
      if (alive) {
        setMsg(treinosMessage(shown, link, coachFirst));
        setAviso(avisoDoLink({ ...oQueVaiNosTreinos(packet), aluno: null, para: coachFirst }));
      }
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
    setTotal(sessions.length);
    setShown([...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_SESSIONS_PER_LINK));
    setOpen(true);
  }

  function sent(via: PrepVia) {
    if (!user || !shown.length) return;
    const at = new Date().toISOString();
    const stateOf = readDelivery(user.id);
    const { resend, novos } = resendCounts(shown.map((s) => stateOf(s.id)));
    // R3-3: só os treinos desta mensagem (os que não couberam no link continuam "para enviar").
    const ok = markSessionsPrepared(
      user.id,
      shown.map((s) => s.id),
      via,
      at,
    );
    track("treinos_link_sent", { via, sessions: shown.length, where, resend, novos });
    setFalhou(!ok);
    setStatus(ok ? { via, at } : null);
    onSent?.(via, at);
  }
  const lote = textoDoLote(total, MAX_SESSIONS_PER_LINK);

  return (
    <>
      {sessions.length ? (
        <Button variant={variant} size={size} className={className} icon={<Send className="size-4" />} onClick={start}>
          {label ?? rotuloDoEnvio(sessions.length, MAX_SESSIONS_PER_LINK, coachFirst)}
        </Button>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Enviar para ${coachFirst}`}>
        <div className="space-y-4">
          <p className="text-[0.9375rem] text-steel">
            A mensagem mostra o que você fez. O link dentro dela registra {shown.length === 1 ? "o treino" : `os ${shown.length} treinos`} no painel de {coachFirst}, com cargas e repetições.
          </p>
          {lote ? <p className="text-[0.9375rem] font-semibold">{lote}</p> : null}
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
              {aviso ? <p className="text-sm text-steel">{aviso}</p> : null}
            </>
          ) : null}
        </div>
        {/* Sempre montada (mesmo antes da mensagem existir) e fora do space-y: vazia, não abre espaço. Só o texto muda. */}
        <StatusRegion
          className="mt-3"
          text={falhou ? TEXTO_REGISTRO_FALHOU : status ? prepStatusText(status.via, status.at, coachFirst, "aluno") : null}
          icon={falhou ? "pendente" : status?.via === "copy" ? "copia" : "whatsapp"}
        />
        {msg && note ? <p className="mt-3 text-sm text-steel">{note}</p> : null}
      </Dialog>
    </>
  );
}
