"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ClipboardList, Salad } from "lucide-react";
import { Logo } from "@/components/brand";
import { ColarNoAppCard } from "@/components/colar-link";
import { isIosBrowser } from "@/components/pwa";
import { Alert, Button, LinkButton, Skeleton, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp, localRepo } from "@/lib/app-context";
import { dietLinkSummary, dietReplaceNotice, dietReplaceText } from "@/lib/domain/diet-plan";
import { fichaReplaceNotice } from "@/lib/domain/ficha-context";
import { firstName, fmtDayMonth } from "@/lib/domain/format";
import { fichaLinkMatch, perfilDoLinkNoAparelho, telaDoLink, telaDoLinkDeOutroPerfil, textoPerfilDoLink, textoTrocarDePersonal, textoVerComo, type AcaoDoLink, type TelaDoLink } from "@/lib/domain/link-identity";
import { LINK_VERSAO_NOVA_TEXTO, ehLinkDeVersaoNova, parsePacket, type FichaPacket } from "@/lib/domain/transfer";
import type { DietPlan, Program } from "@/lib/domain/types";
import { cameFromPaste, limparEndereco, packedFromHash, unpackData } from "@/lib/share-link";
import { importFicha, type ImportFichaOpts } from "@/lib/link-client";

/** Botão com nome no rótulo: a altura fixa (h-11/h-14) do Button vira mínima e o texto quebra sem vazar a 360 px. */
const ALTURA_LIVRE = { height: "auto" } as const;

/** O toque que salva: "padrao" = o botão de sempre (novo cria, mesmo atualiza); os outros vêm da tela de escolha. */
type Salvar = "padrao" | Exclude<AcaoDoLink, "voltar">;

/**
 * Link que o personal manda ao aluno: abre a ficha e a dieta no celular do aluno, sem cadastro.
 * Os dados vêm depois do "#" do endereço (nunca passam pelo servidor).
 * Rodada 3 (R3-1): a identidade do link decide a tela (`fichaLinkMatch`). Perfil do link = perfil aberto ("mesmo") ou
 * nenhum perfil de aluno aberto ("novo"): como antes. Link de outra pessoa, de outro personal, de um vínculo antigo ou
 * para um aluno sem personal: a pessoa escolhe (atualizar, criar outro perfil, trocar de personal) e "Voltar" não grava
 * nada. "Ver como aluno" (`returnTo`): sem botão de salvar. O perfil do link que já existe neste celular (pelos ids) é
 * atualizado, nunca duplicado.
 */
export default function AbrirPage() {
  const { ready, user, mode, returnTo, enterLocalProfile, actAs, returnToOwner } = useApp();
  const router = useRouter();
  const [packet, setPacket] = useState<FichaPacket | null>(null);
  /** "atualize": link de tipo desconhecido ou de versão mais nova (spec §10.2), não um link cortado. */
  const [state, setState] = useState<"lendo" | "pronto" | "invalido" | "atualize">("lendo");
  /** Qual toque está gravando (só ele mostra o carregando; os outros ficam desligados). */
  const [busy, setBusy] = useState<Salvar | null>(null);
  const [voltando, setVoltando] = useState(false);
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
  const consentId = useId();
  const trocarId = useId();
  const escolhaId = useId();

  // Outro link aberto na mesma aba (app instalado que reaproveita a janela): o navegador só troca o "#". Lê de novo.
  useEffect(() => {
    const onHash = () => {
      if (packedFromHash(window.location.hash)) window.location.reload();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    setViaPaste(cameFromPaste(window.location.hash));
    setIosBrowser(isIosBrowser());
    const packed = packedFromHash(window.location.hash);
    // O conteúdo sai da barra de endereço assim que é lido.
    if (window.location.hash) limparEndereco(window.location.pathname);
    if (!packed) return setState("invalido");
    unpackData(packed)
      .then((raw) => {
        if (ehLinkDeVersaoNova(raw)) return setState("atualize");
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

  // O perfil do link já está neste celular? (só no modo local, fora do "Ver como aluno"; lido do aparelho pelos ids, nunca
  // pelo nome). Na mesma renderização em que o pacote aparece: o botão nunca chega a oferecer "Salvar" (perfil novo)
  // para quem já tem o perfil aqui. `ready` só existe no navegador (o servidor nunca lê o armazenamento).
  const dono = useMemo(
    () => (ready && packet && mode === "local" && !returnTo ? perfilDoLinkNoAparelho(packet, localRepo.listLocalProfiles()) : null),
    // `user` relê depois de entrar ou sair de um perfil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, packet, mode, returnTo, user],
  );

  const showAppCard = ready && state === "pronto" && iosBrowser && noProfile;

  // Beco sem saída: link que não abre ou Safari do iPhone sem perfil (o app instalado não vê estes dados).
  useEffect(() => {
    if (deadEnd.current || !ready || state === "lendo") return;
    const motivo = state === "invalido" ? "invalido" : state === "atualize" ? "versao_nova" : showAppCard ? "iphone" : null;
    if (!motivo) return;
    deadEnd.current = true;
    track("link_dead_end_shown", { tela: "abrir", motivo, via_paste: viaPaste });
  }, [ready, state, showAppCard, viaPaste]);

  useEffect(() => {
    if (!packet || !user || user.role !== "coach") return;
    localRepo.getProfile(packet.student.ref).then((p) => setOwnStudent(Boolean(p && p.managedBy === user.id)));
  }, [packet, user]);

  // Perfil aberto (aluno, fora do "Ver como aluno") e o perfil do link que já está neste celular.
  const aberto = user && user.role === "athlete" && !returnTo ? user : null;
  /** O perfil do link existe aqui, mas o aberto é outro: a escolha é atualizar esse perfil (nunca criar outro igual). */
  const outroPerfilDoLink = aberto && dono && dono.id !== aberto.id ? dono : null;
  /** Sem perfil aberto (depois de "Sair"), o perfil do link que já está aqui é atualizado ("mesmo"). */
  const atleta = aberto ?? (user ? null : dono);
  const match = packet ? fichaLinkMatch(packet, atleta) : "novo";
  const tela: TelaDoLink | null =
    packet && outroPerfilDoLink && aberto
      ? telaDoLinkDeOutroPerfil({ perfil: aberto, dono: outroPerfilDoLink, personal: packet.coach.name })
      : packet && atleta
        ? telaDoLink(match, { perfil: atleta, aluno: packet.student.name, personal: packet.coach.name })
        : null;
  /** Perfil que "atualizar" grava: o do link que já está aqui (outro perfil aberto) ou o aberto. */
  const alvoAtualizar = outroPerfilDoLink ?? atleta;
  const updating = !tela && match === "mesmo";
  /** Estados em que "atualizar" troca a ficha e a dieta de um perfil daqui (o aviso de substituição vale para eles). */
  const podeAtualizar = Boolean(outroPerfilDoLink) || match === "mesmo" || match === "legado" || match === "solo";
  const alvoId = alvoAtualizar?.id ?? null;

  // Quem atualiza a própria ficha vê o aviso de substituição (o que o link troca neste celular).
  useEffect(() => {
    if (!packet || !alvoId) return;
    let alive = true;
    localRepo
      .getDiet(alvoId)
      .then((d) => alive && setLocalDiet(d))
      .catch(() => undefined);
    if (packet.program)
      localRepo
        .getProgram(packet.program.id)
        .then((p) => alive && setLocalProgram(p && p.ownerId === alvoId ? p : null))
        .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [packet, alvoId]);

  async function save(acao: Salvar) {
    if (!packet || busy) return;
    setBusy(acao);
    setErr(null);
    // "atualizar" e "trocar" gravam no perfil escolhido (mantém treinos e recordes); "criar" faz um perfil separado e
    // deixa o aberto intacto; o botão de sempre segue o padrão do estado (novo cria, mesmo atualiza).
    const opts: ImportFichaOpts = acao === "atualizar" ? { target: "update" } : acao === "criar" ? { target: "new" } : acao === "trocar" ? { target: "update", allowRelink: true } : {};
    const atual = acao === "atualizar" ? alvoAtualizar : atleta;
    try {
      // O toque no botão, com o texto de autorização logo acima, registra a autorização de dados de saúde.
      const profile = await importFicha(packet, atual, { consent: true, ...opts });
      enterLocalProfile(profile);
      track("ficha_link_opened", { had_profile: Boolean(user), has_program: Boolean(packet.program), has_diet: Boolean(packet.diet), via_paste: viaPaste, ios_browser: iosBrowser, aviso_dieta: dietNotice ?? "nenhum" });
      // Link só com dieta (U3c): o Hoje diz que a dieta foi salva, nunca "Ficha salva".
      router.replace(packet.program ? "/hoje?ficha=1" : "/hoje?dieta=1");
    } catch (e) {
      // Erro de identidade (nada gravado) ou de armazenamento (a foto volta o aparelho ao que era): a mensagem diz isso.
      reportError(e, "link:abrir-ficha");
      setErr(e instanceof Error && e.message ? e.message : "Não foi possível salvar neste aparelho. Tente de novo.");
      setBusy(null);
    }
  }

  /** "Voltar" da tela de escolha: nenhuma gravação; o perfil aberto continua como estava. */
  function voltar() {
    router.replace(user?.role === "coach" ? "/alunos" : user ? "/hoje" : "/");
  }

  const coachFirst = packet ? firstName(packet.coach.name) : "";
  const studentFirst = packet ? firstName(packet.student.name) : "";
  const days = packet?.program?.days.length ?? 0;
  // Ajustes feitos neste celular que o link vai apagar: ficha (mesmo id, com adjustedAt) e dieta (ajustada ou própria).
  const fichaNotice = podeAtualizar ? fichaReplaceNotice(localProgram, packet?.program?.id ?? null, coachFirst || null, fmtDayMonth) : null;
  const dietNotice = podeAtualizar && alvoId ? dietReplaceNotice(localDiet, alvoId, Boolean(packet?.diet)) : null;
  const dietNoticeText = dietNotice && packet ? dietReplaceText(dietNotice, coachFirst || null, localDiet?.adjustedAt, fmtDayMonth) : null;
  // Reenvio: só o que veio no link é trocado (sem dieta no link, a dieta atual fica).
  const replaced = packet?.program && packet.diet ? `A ficha e a dieta passam a ser as novas de ${coachFirst}.` : packet?.program ? `A ficha passa a ser a nova de ${coachFirst}.` : packet?.diet ? `A dieta passa a ser a nova de ${coachFirst}.` : "";
  // LGPD: dados de saúde só ficam guardados com autorização; ela é dada pelo toque no botão logo abaixo deste texto.
  const consentLine = packet
    ? tela
      ? `Ao atualizar ou criar o perfil, você autoriza guardar neste celular os dados de treino e saúde deste link, enviados por ${packet.coach.name}.`
      : `Ao ${updating ? "atualizar" : "salvar"}, você autoriza guardar neste celular seus dados de treino e saúde enviados por ${packet.coach.name}.`
    : "";
  /** Telas novas da rodada 3 (escolha, "Ver como"): começam do topo, sem pular quando o texto cresce. */
  const topo = Boolean(packet && mode === "local" && ((returnTo && user) || tela));

  const avisos =
    fichaNotice || dietNoticeText ? (
      <Alert tone="warn">
        {fichaNotice ? <p>{fichaNotice}</p> : null}
        {dietNoticeText ? <p className={fichaNotice ? "mt-2" : undefined}>{dietNoticeText}</p> : null}
      </Alert>
    ) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Link href="/" aria-label="Shape Real" className="inline-flex min-h-11 items-center">
        <Logo />
      </Link>
      <main className={cx("flex flex-1 flex-col py-8", topo ? "justify-start" : "justify-center")}>
        {state === "lendo" || !ready ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-40" />
          </div>
        ) : state === "invalido" || state === "atualize" || !packet ? (
          <div className="space-y-4">
            <h1 className="plate-type text-[1.9rem] leading-tight">Este link não abriu</h1>
            <p className="text-steel">
              {state === "atualize" ? LINK_VERSAO_NOVA_TEXTO : "Ele pode ter sido cortado ao copiar. Peça ao seu personal para enviar de novo pelo botão “Enviar para o celular do aluno”."}
            </p>
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
              <h1 className="plate-type mt-1 text-[2rem] leading-[1.05] break-words">
                {studentFirst}, {packet.program ? "sua ficha chegou." : "sua dieta chegou."}
              </h1>
            </div>
            <ul className="ruled rounded-[var(--radius-ficha)] border border-rule bg-paper">
              {packet.program ? (
                <li className="flex items-start gap-3 px-4 py-3">
                  <ClipboardList className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-bold break-words">{packet.program.name}</span>
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
                    <span className="block font-bold break-words">{packet.diet.name}</span>
                    <span className="block text-sm text-steel">{dietLinkSummary(packet.diet)}</span>
                  </span>
                </li>
              ) : null}
              {/* Nas telas de escolha, só o conteúdo do link (o "como usar" vem depois de salvar). */}
              {topo ? null : (
                <li className="flex items-start gap-3 px-4 py-3">
                  <CalendarCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 text-sm">
                    <span className="block font-bold">Registre cada treino</span>
                    <span className="block text-steel">O app lembra a carga da última vez e avisa quando subir. No fim, você manda o treino para {coachFirst} com um toque.</span>
                  </span>
                </li>
              )}
            </ul>

            {mode === "supabase" ? (
              <Alert tone="info">Com conta no Shape Real, a ficha enviada pelo seu personal já aparece no app. Este link é para quem usa sem conta.</Alert>
            ) : returnTo && user ? (
              // "Ver como aluno" (R3-1): é o aparelho do personal. Nada é salvo aqui; o link é para o celular do aluno.
              <div className="space-y-3">
                <Alert tone="info">{textoVerComo(user.name)}</Alert>
                <Button
                  className="w-full"
                  loading={voltando}
                  onClick={async () => {
                    // O link é para o celular do aluno: de volta ao painel, ele não serve para mais nada aqui.
                    setVoltando(true);
                    const voltou = await returnToOwner().catch(() => null);
                    if (voltou) return router.replace(voltou.role === "coach" ? "/alunos" : "/hoje");
                    setVoltando(false);
                  }}
                >
                  Voltar ao painel
                </Button>
              </div>
            ) : user?.role === "coach" ? (
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
            ) : tela ? (
              // R3-1: o link não é (só) do perfil aberto. A pessoa escolhe; "Voltar" não grava nada.
              <section aria-labelledby={escolhaId} className="space-y-3">
                <h2 id={escolhaId} className="plate-type text-[1.35rem] leading-tight break-words">
                  {tela.titulo}
                </h2>
                {tela.linhas.map((linha) => (
                  <p key={linha} className="text-[0.9375rem] break-words text-iron">
                    {linha}
                  </p>
                ))}
                {outroPerfilDoLink ? (
                  <p className="text-[0.9375rem] text-steel">
                    Os treinos, recordes e histórico de {firstName(outroPerfilDoLink.name)} continuam. {replaced}
                  </p>
                ) : match === "legado" || match === "solo" ? (
                  <p className="text-[0.9375rem] text-steel">Se atualizar, seus treinos, recordes e histórico continuam. {replaced}</p>
                ) : null}
                {avisos}
                <p id={consentId} className="text-sm text-iron">
                  {consentLine}
                </p>
                {err ? <Alert tone="error">{err}</Alert> : null}
                <div className="grid gap-2 pt-1">
                  {tela.acoes.map((a, i) =>
                    a.acao === "voltar" ? (
                      <Button key={a.acao} variant="ghost" className="w-full" disabled={busy !== null} onClick={voltar}>
                        {a.rotulo}
                      </Button>
                    ) : (
                      <div key={a.acao}>
                        <Button
                          variant={i === 0 ? "primary" : "secondary"}
                          size={i === 0 ? "lg" : "md"}
                          className={cx("w-full text-center leading-snug", i === 0 ? "min-h-14 py-3" : "min-h-11 py-2.5")}
                          style={ALTURA_LIVRE}
                          loading={busy === a.acao}
                          disabled={busy !== null && busy !== a.acao}
                          onClick={() => void save(a.acao as Salvar)}
                          aria-describedby={a.acao === "trocar" ? `${consentId} ${trocarId}` : consentId}
                        >
                          {a.rotulo}
                        </Button>
                        {a.acao === "trocar" ? (
                          <p id={trocarId} className="mt-1.5 text-sm text-steel">
                            {textoTrocarDePersonal(packet.coach.name)}
                          </p>
                        ) : null}
                      </div>
                    ),
                  )}
                </div>
              </section>
            ) : (
              <div className="space-y-3">
                {err ? <Alert tone="error">{err}</Alert> : null}
                {/* Sem perfil aberto, o perfil do link que já está aqui é atualizado (nunca um segundo perfil igual). */}
                {updating && !user && dono ? <p className="text-[0.9375rem] font-semibold text-iron">{textoPerfilDoLink(dono)}</p> : null}
                {updating ? <p className="text-[0.9375rem] text-steel">Seus treinos, recordes e histórico continuam. {replaced}</p> : null}
                {/* Um aviso só quando os dois valem, a ficha antes da dieta. */}
                {avisos}
                <p id={consentId} className="text-sm text-iron">
                  {consentLine}
                </p>
                <Button size="lg" className="w-full" loading={busy === "padrao"} onClick={() => void save("padrao")} aria-describedby={consentId}>
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
