"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ClipboardList, Salad } from "lucide-react";
import { Logo } from "@/components/brand";
import { ColarNoAppCard } from "@/components/colar-link";
import { isIosBrowser } from "@/components/pwa";
import { Alert, Button, LinkButton, Skeleton } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp, localRepo } from "@/lib/app-context";
import { dietLinkSummary, dietReplaceNotice, dietReplaceText } from "@/lib/domain/diet-plan";
import { fichaReplaceNotice } from "@/lib/domain/ficha-context";
import { firstName, fmtDayMonth } from "@/lib/domain/format";
import { parsePacket, type FichaPacket } from "@/lib/domain/transfer";
import type { DietPlan, Program } from "@/lib/domain/types";
import { cameFromPaste, packedFromHash, unpackData } from "@/lib/share-link";
import { importFicha } from "@/lib/transfer-client";

/**
 * Link que o personal manda ao aluno: abre a ficha e a dieta no celular do aluno, sem cadastro.
 * Os dados vêm depois do "#" do endereço (nunca passam pelo servidor).
 */
export default function AbrirPage() {
  const { ready, user, mode, returnTo, enterLocalProfile, actAs } = useApp();
  const router = useRouter();
  const [packet, setPacket] = useState<FichaPacket | null>(null);
  const [state, setState] = useState<"lendo" | "pronto" | "invalido">("lendo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ownStudent, setOwnStudent] = useState(false);
  /** Veio pelo campo "Colar link" (dentro do app) e não pelo toque no link do WhatsApp. */
  const [viaPaste, setViaPaste] = useState(false);
  /** Safari do iPhone, fora do app instalado. */
  const [iosBrowser, setIosBrowser] = useState(false);
  const [noProfile, setNoProfile] = useState(false);
  /** O que este celular tem hoje e o link vai substituir (aviso antes de atualizar: U3b R7 e U5a R4). */
  const [localDiet, setLocalDiet] = useState<DietPlan | null>(null);
  const [localProgram, setLocalProgram] = useState<Program | null>(null);
  const read = useRef(false);
  const deadEnd = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    setViaPaste(cameFromPaste(window.location.hash));
    setIosBrowser(isIosBrowser());
    const packed = packedFromHash(window.location.hash);
    // O conteúdo sai da barra de endereço assim que é lido.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!packed) return setState("invalido");
    unpackData(packed)
      .then((raw) => {
        const p = parsePacket(raw);
        if (p?.kind !== "ficha") return setState("invalido");
        setPacket(p);
        setState("pronto");
      })
      .catch(() => setState("invalido"));
  }, []);

  // Nenhum perfil neste navegador: no iPhone, pode ser alguém que usa o app da tela de início.
  useEffect(() => {
    if (ready) setNoProfile(mode === "local" && localRepo.listLocalProfiles().length === 0);
  }, [ready, mode]);

  const showAppCard = ready && state === "pronto" && iosBrowser && noProfile;

  // Beco sem saída: link que não abre ou Safari do iPhone sem perfil (o app instalado não vê estes dados).
  useEffect(() => {
    if (deadEnd.current || !ready || state === "lendo") return;
    const motivo = state === "invalido" ? "invalido" : showAppCard ? "iphone" : null;
    if (!motivo) return;
    deadEnd.current = true;
    track("link_dead_end_shown", { tela: "abrir", motivo, via_paste: viaPaste });
  }, [ready, state, showAppCard, viaPaste]);

  useEffect(() => {
    if (!packet || !user || user.role !== "coach") return;
    localRepo.getProfile(packet.student.ref).then((p) => setOwnStudent(Boolean(p && p.managedBy === user.id)));
  }, [packet, user]);

  // Só quem atualiza a própria ficha (aluno, fora do "Ver como aluno") vê o aviso de substituição.
  useEffect(() => {
    if (!packet || !user || user.role !== "athlete" || returnTo) return;
    let alive = true;
    localRepo
      .getDiet(user.id)
      .then((d) => alive && setLocalDiet(d))
      .catch(() => undefined);
    if (packet.program)
      localRepo
        .getProgram(packet.program.id)
        .then((p) => alive && setLocalProgram(p && p.ownerId === user.id ? p : null))
        .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [packet, user, returnTo]);

  async function save() {
    if (!packet) return;
    setBusy(true);
    setErr(null);
    try {
      // O toque no botão, com o texto de autorização logo acima, registra a autorização de dados de saúde.
      const profile = await importFicha(packet, user && user.role === "athlete" && !returnTo ? user : null, { consent: true });
      enterLocalProfile(profile);
      track("ficha_link_opened", { had_profile: Boolean(user), has_program: Boolean(packet.program), has_diet: Boolean(packet.diet), via_paste: viaPaste, ios_browser: iosBrowser, aviso_dieta: dietNotice ?? "nenhum" });
      // Link só com dieta (U3c): o Hoje diz que a dieta foi salva, nunca "Ficha salva".
      router.replace(packet.program ? "/hoje?ficha=1" : "/hoje?dieta=1");
    } catch (e) {
      reportError(e, "link:abrir-ficha");
      setErr(e instanceof Error ? e.message : "Não foi possível salvar neste aparelho. Tente de novo.");
      setBusy(false);
    }
  }

  const coachFirst = packet ? firstName(packet.coach.name) : "";
  const studentFirst = packet ? firstName(packet.student.name) : "";
  const days = packet?.program?.days.length ?? 0;
  const updating = user?.role === "athlete" && !returnTo;
  // Ajustes feitos neste celular que o link vai apagar: ficha (mesmo id, com adjustedAt) e dieta (ajustada ou própria).
  const fichaNotice = updating ? fichaReplaceNotice(localProgram, packet?.program?.id ?? null, coachFirst || null, fmtDayMonth) : null;
  const dietNotice = updating && user ? dietReplaceNotice(localDiet, user.id, Boolean(packet?.diet)) : null;
  const dietNoticeText = dietNotice && packet ? dietReplaceText(dietNotice, coachFirst || null, localDiet?.adjustedAt, fmtDayMonth) : null;
  // Reenvio: só o que veio no link é trocado (sem dieta no link, a dieta atual fica).
  const replaced = packet?.program && packet.diet ? `A ficha e a dieta passam a ser as novas de ${coachFirst}.` : packet?.program ? `A ficha passa a ser a nova de ${coachFirst}.` : packet?.diet ? `A dieta passa a ser a nova de ${coachFirst}.` : "";
  // LGPD: dados de saúde só ficam guardados com autorização; ela é dada pelo toque no botão logo abaixo deste texto.
  const consentLine = packet ? `Ao ${updating ? "atualizar" : "salvar"}, você autoriza guardar neste celular seus dados de treino e saúde enviados por ${packet.coach.name}.` : "";

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
            <p className="text-steel">Ele pode ter sido cortado ao copiar. Peça ao seu personal para enviar de novo pelo botão “Enviar para o celular do aluno”.</p>
            <LinkButton href="/" variant="secondary">
              Conhecer o Shape Real
            </LinkButton>
          </div>
        ) : (
          <div className="space-y-5">
            {/* iPhone sem perfil: o card só orienta quem já tem o app instalado (lá, "Colar aqui"). O caminho principal continua
                embaixo, igual ao do Android: texto de autorização logo acima de "Salvar no meu celular". */}
            {showAppCard ? <ColarNoAppCard /> : null}
            <div>
              <p className="text-sm font-semibold text-steel">Enviado por {packet.coach.name}</p>
              <h1 className="plate-type mt-1 text-[2rem] leading-[1.05]">
                {studentFirst}, {packet.program ? "sua ficha chegou." : "sua dieta chegou."}
              </h1>
            </div>
            <ul className="ruled rounded-[var(--radius-ficha)] border border-rule bg-paper">
              {packet.program ? (
                <li className="flex items-start gap-3 px-4 py-3">
                  <ClipboardList className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-bold">{packet.program.name}</span>
                    <span className="block text-sm text-steel">
                      {days} {days === 1 ? "treino" : "treinos"}: {packet.program.days.map((d) => d.key).join(", ")}
                    </span>
                  </span>
                </li>
              ) : null}
              {packet.diet ? (
                <li className="flex items-start gap-3 px-4 py-3">
                  <Salad className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-bold">{packet.diet.name}</span>
                    <span className="block text-sm text-steel">{dietLinkSummary(packet.diet)}</span>
                  </span>
                </li>
              ) : null}
              <li className="flex items-start gap-3 px-4 py-3">
                <CalendarCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span className="min-w-0 text-sm">
                  <span className="block font-bold">Registre cada treino</span>
                  <span className="block text-steel">O app lembra a carga da última vez e avisa quando subir. No fim, você manda o treino para {coachFirst} com um toque.</span>
                </span>
              </li>
            </ul>

            {mode === "supabase" ? (
              <Alert tone="info">Com conta no Shape Real, a ficha enviada pelo seu personal já aparece no app. Este link é para quem usa sem conta.</Alert>
            ) : user?.role === "coach" && !returnTo ? (
              <div className="space-y-3">
                <Alert tone="warn">
                  Este aparelho está com o painel de personal. O link é para abrir no celular {ownStudent ? `de ${studentFirst}` : "do aluno"}: envie pelo WhatsApp.
                </Alert>
                {ownStudent ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={async () => {
                      await actAs(packet.student.ref);
                      router.replace("/hoje");
                    }}
                  >
                    Ver como {studentFirst} vê, neste aparelho
                  </Button>
                ) : null}
                <LinkButton href="/alunos" variant="ghost" className="w-full">
                  Voltar ao painel
                </LinkButton>
              </div>
            ) : (
              <div className="space-y-3">
                {err ? <Alert tone="error">{err}</Alert> : null}
                {updating ? <p className="text-[0.9375rem] text-steel">Seus treinos, recordes e histórico continuam. {replaced}</p> : null}
                {/* Um aviso só quando os dois valem, a ficha antes da dieta. */}
                {fichaNotice || dietNoticeText ? (
                  <Alert tone="warn">
                    {fichaNotice ? <p>{fichaNotice}</p> : null}
                    {dietNoticeText ? <p className={fichaNotice ? "mt-2" : undefined}>{dietNoticeText}</p> : null}
                  </Alert>
                ) : null}
                <p id="abrir-autorizacao" className="text-sm text-iron">
                  {consentLine}
                </p>
                <Button size="lg" className="w-full" loading={busy} onClick={save} aria-describedby="abrir-autorizacao">
                  {updating ? (packet.program ? "Atualizar minha ficha" : "Atualizar minha dieta") : "Salvar no meu celular"}
                </Button>
                {updating ? null : <p className="text-sm text-steel">Sem cadastro: a ficha, a dieta e os seus treinos ficam guardados neste celular. Na próxima vez, é só abrir o app.</p>}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
