"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Trophy } from "lucide-react";
import { Logo } from "@/components/brand";
import { ColarNoAppCard } from "@/components/colar-link";
import { isIosBrowser } from "@/components/pwa";
import { Alert, Button, LinkButton, Select, Skeleton } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { localRepo, useApp } from "@/lib/app-context";
import { receivePreview, receiveResult, seriesText } from "@/lib/domain/delivery";
import { firstName } from "@/lib/domain/format";
import { completedSets } from "@/lib/domain/progression";
import { parsePacket, type TreinosPacket } from "@/lib/domain/transfer";
import type { StudentSummary } from "@/lib/domain/types";
import { cameFromPaste, packedFromHash, unpackData } from "@/lib/share-link";
import { importTreinos, receivedFichaVersao } from "@/lib/transfer-client";

/**
 * Link que o aluno manda ao personal: leva os treinos feitos para o painel do personal. Antes de registrar, diz quais
 * treinos já estão no painel (pelo id); depois, separa novo, atualizado (mudou) e "já estava no painel" (U2d).
 * O eco da versão da ficha que veio no link é gravado ao registrar (U2c, `importTreinos` com `coachId`).
 */
export default function ReceberPage() {
  const { ready, user, repo, mode, returnTo, returnToOwner } = useApp();
  const [packet, setPacket] = useState<TreinosPacket | null>(null);
  const [state, setState] = useState<"lendo" | "pronto" | "invalido">("lendo");
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; updated: number; same: number; mirrored: number; studentId: string } | null>(null);
  /** Ids dos treinos que o aluno escolhido já tem no painel (U2d: "No painel", "já estão no painel"). */
  const [present, setPresent] = useState<{ studentId: string; ids: Set<string> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Veio pelo campo "Colar link" (dentro do app) e não pelo toque no link do WhatsApp. */
  const [viaPaste, setViaPaste] = useState(false);
  /** Safari do iPhone, fora do app instalado. */
  const [iosBrowser, setIosBrowser] = useState(false);
  /** null enquanto não conferiu. */
  const [noProfile, setNoProfile] = useState<boolean | null>(null);
  const read = useRef(false);
  const deadEnd = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    setViaPaste(cameFromPaste(window.location.hash));
    setIosBrowser(isIosBrowser());
    const packed = packedFromHash(window.location.hash);
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!packed) return setState("invalido");
    unpackData(packed)
      .then((raw) => {
        const p = parsePacket(raw);
        if (p?.kind !== "treinos") return setState("invalido");
        setPacket(p);
        setState("pronto");
      })
      .catch(() => setState("invalido"));
  }, []);

  // Nenhum perfil neste navegador: no iPhone, quase sempre é o personal que usa o app da tela de início.
  useEffect(() => {
    if (ready) setNoProfile(mode === "local" && localRepo.listLocalProfiles().length === 0);
  }, [ready, mode]);

  const showAppCard = ready && state === "pronto" && !done && iosBrowser && noProfile === true;

  // Beco sem saída: link que não abre, Safari do iPhone sem perfil, aparelho sem painel de personal ou sem alunos.
  useEffect(() => {
    if (deadEnd.current || !ready || state === "lendo" || done || noProfile === null) return;
    const motivo =
      state === "invalido"
        ? "invalido"
        : mode !== "local" || returnTo
          ? null
          : showAppCard
            ? "iphone"
            : user?.role !== "coach"
              ? "nao_personal"
              : students && !students.length
                ? "sem_alunos"
                : null;
    if (!motivo) return;
    deadEnd.current = true;
    track("link_dead_end_shown", { tela: "receber", motivo, via_paste: viaPaste });
  }, [ready, state, done, noProfile, mode, returnTo, showAppCard, user, students, viaPaste]);

  // Acha o aluno no painel: pelo cadastro de onde a ficha saiu ou, se não achar, pela escolha do personal.
  useEffect(() => {
    if (!packet || !user || user.role !== "coach" || returnTo) return;
    (async () => {
      const list = await repo.listStudents(user.id).catch(() => [] as StudentSummary[]);
      setStudents(list);
      const own = list.find((s) => s.profile.id === packet.studentRef);
      setTarget(own ? own.profile.id : (list.find((s) => s.profile.name.trim().toLowerCase() === packet.studentName.trim().toLowerCase())?.profile.id ?? ""));
    })();
  }, [packet, user, repo, returnTo]);

  // Quais treinos do link o aluno escolhido já tem no painel (pelo id), para não chamar de novo o que não é.
  useEffect(() => {
    if (!target || mode !== "local" || done) return;
    let alive = true;
    repo
      .listSessions(target)
      .then((list) => {
        if (alive) setPresent({ studentId: target, ids: new Set(list.map((s) => s.id)) });
      })
      .catch(() => {
        if (alive) setPresent(null);
      });
    return () => {
      alive = false;
    };
  }, [target, repo, mode, done]);

  async function register() {
    if (!packet || !target) return;
    setBusy(true);
    setErr(null);
    try {
      // O eco da versão da ficha (U2c) só é gravado com o personal deste aparelho.
      const r = await importTreinos(packet, target, { coachId: user?.id });
      const fichaVersao = await receivedFichaVersao(packet, target, user?.id).catch(() => "sem_info" as const);
      track("treinos_link_received", {
        sessions: packet.sessions.length,
        added: r.added,
        same: r.same,
        matched: target === packet.studentRef,
        mirrored: r.mirrored,
        ficha_versao: fichaVersao,
        via_paste: viaPaste,
        ios_browser: iosBrowser,
      });
      setDone({ ...r, studentId: target });
    } catch (e) {
      reportError(e, "link:receber-treinos");
      setErr(e instanceof Error ? e.message : "Não foi possível registrar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const sessions = packet ? [...packet.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) : [];
  const first = packet ? firstName(packet.studentName) : "";
  const known = students?.some((s) => s.profile.id === packet?.studentRef);
  // Nome do aluno como está no painel deste personal (o do link pode estar escrito de outro jeito).
  const nameOf = (id: string) => firstName(students?.find((s) => s.profile.id === id)?.profile.name ?? packet?.studentName ?? "");
  const inPanel = present && present.studentId === target ? present.ids : null;
  const preview = receivePreview(sessions.length, inPanel ? sessions.filter((s) => inPanel.has(s.id)).length : null, nameOf(target));
  const result = done ? receiveResult(done, nameOf(done.studentId)) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Link href="/" aria-label="Shape Real" className="inline-flex min-h-11 items-center">
        <Logo />
      </Link>
      <main className="flex flex-1 flex-col justify-center py-8">
        {state === "lendo" || !ready ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-40" />
          </div>
        ) : state === "invalido" || !packet ? (
          <div className="space-y-4">
            <h1 className="plate-type text-[1.9rem] leading-tight">Este link não abriu</h1>
            <p className="text-steel">Ele pode ter sido cortado ao copiar. Peça ao aluno para enviar de novo pelo Histórico do app.</p>
            <LinkButton href="/alunos" variant="secondary">
              Ir para o painel
            </LinkButton>
          </div>
        ) : done && result ? (
          <div className="space-y-5">
            <div className="grid size-12 place-items-center rounded-full bg-plate-green text-white">
              <Check className="size-6" aria-hidden />
            </div>
            <h1 className="plate-type text-[2rem] leading-[1.05]">{result.title}</h1>
            <p className="text-steel">
              {result.body}
              {done.mirrored ? ` A ficha já mostra as cargas que ${nameOf(done.studentId)} fez, e o próximo envio leva essas cargas.` : ""}
            </p>
            <div className="flex flex-col gap-2">
              <LinkButton href={`/alunos/${done.studentId}?aba=historico`} size="lg" className="w-full">
                Ver o histórico de {nameOf(done.studentId)}
              </LinkButton>
              <LinkButton href="/alunos" variant="ghost" className="w-full">
                Voltar aos alunos
              </LinkButton>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {showAppCard ? <ColarNoAppCard /> : null}
            <div>
              <p className="text-sm font-semibold text-steel">Enviado por {packet.studentName}</p>
              <h1 className="plate-type mt-1 text-[2rem] leading-[1.05]">{preview.title}</h1>
              {preview.line ? <p className="mt-1.5 text-steel">{preview.line}</p> : null}
            </div>
            <ul className="ruled rounded-[var(--radius-ficha)] border border-rule bg-paper text-[0.9375rem]">
              {sessions.slice(-8).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="plate-type grid h-9 min-w-9 place-items-center rounded bg-iron px-1.5 text-chalk">{s.dayKey ?? "L"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.dayTitle || (s.dayKey ? `Treino ${s.dayKey}` : "Treino livre")}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm text-steel">
                      <span className="num">
                        {new Date(s.startedAt).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} · {seriesText(s.exercises.reduce((a, e) => a + completedSets(e).length, 0))}
                      </span>
                      {inPanel?.has(s.id) ? (
                        <span className="inline-flex items-center gap-1" data-no-painel>
                          <CheckCheck className="size-[1.05em] shrink-0" aria-hidden />
                          No painel
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {s.prs.length ? <Trophy className="size-4 shrink-0 text-plate-red" aria-label="recorde" /> : null}
                </li>
              ))}
            </ul>
            {sessions.length > 8 ? <p className="text-sm text-steel">E mais {sessions.length - 8} anteriores.</p> : null}

            {mode === "supabase" ? (
              <Alert tone="info">Com conta no Shape Real, os treinos do aluno já aparecem no seu painel.</Alert>
            ) : returnTo ? (
              <div className="space-y-3">
                <Alert tone="info">Você está vendo o app como aluno. Volte ao painel para registrar estes treinos.</Alert>
                <Button className="w-full" onClick={() => void returnToOwner()}>
                  Voltar ao painel
                </Button>
              </div>
            ) : showAppCard ? null : user?.role !== "coach" ? (
              <Alert tone="warn">Este link é para o personal: abra no celular de quem acompanha {first}.</Alert>
            ) : students === null ? (
              <Skeleton className="h-11" />
            ) : !students.length ? (
              <Alert tone="warn">Você ainda não tem alunos cadastrados neste aparelho. Cadastre {first} em Alunos e abra o link de novo.</Alert>
            ) : (
              <div className="space-y-3">
                {!known ? (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold">De qual aluno são estes treinos?</span>
                    <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="">Escolha o aluno</option>
                      {students.map((s) => (
                        <option key={s.profile.id} value={s.profile.id}>
                          {s.profile.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}
                {err ? <Alert tone="error">{err}</Alert> : null}
                <Button size="lg" className="w-full" loading={busy} disabled={!target} onClick={register}>
                  {preview.allPresent ? "Registrar de novo" : `Registrar no painel${known ? ` de ${first}` : ""}`}
                </Button>
                <p className="text-sm text-steel">Treinos que já estavam registrados são atualizados, não duplicados.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
