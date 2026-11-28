"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CheckCheck, Info, TriangleAlert } from "lucide-react";
import { ConferirDiferencas } from "@/components/anamnese/conferir-diferencas";
import { Logo } from "@/components/brand";
import { ColarNoAppCard } from "@/components/colar-link";
import { isIosBrowser } from "@/components/pwa";
import { RecordMark } from "@/components/record-mark";
import { Alert, Button, LinkButton, Select, Skeleton, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { evAnamneseLinkOpened, evAnamneseReceived, evStudentCreatedExtra } from "@/lib/anamnese-events";
import { localRepo, useApp } from "@/lib/app-context";
import { applyAnamnese, conflicts, diffLimitacoes, limitacoesPedemConferencia } from "@/lib/domain/anamnese-ficha";
import { ehExemplo, type Escolhas } from "@/lib/domain/anamnese-types";
import { receivePreview, receiveResult, seriesText } from "@/lib/domain/delivery";
import { firstName } from "@/lib/domain/format";
import { alvoInicialDoRetorno, retornoPedeConfirmacao, TEXTO_RETORNO_SEM_ALUNO, textoConfirmarOutroAluno, textoOutroPersonal } from "@/lib/domain/link-identity";
import { completedSets } from "@/lib/domain/progression";
import { packetProblem, parseRespostas, PROBLEMA_TEXTO } from "@/lib/domain/questionario-link";
import { parsePacket, type TreinosPacket } from "@/lib/domain/transfer";
import type { Profile, StudentSummary } from "@/lib/domain/types";
import { apagadoEm } from "@/lib/questionario-client";
import {
  CONFERIR_TEXTO,
  escolhasIniciais,
  estadoRecepcao,
  etapaRecepcao,
  guardaReceber,
  motivoDaGuarda,
  motivoDoProblema,
  pontosParaVer,
  RECEBER_TEXTO,
  textoProblemaReceber,
  type DecisoesRecepcao,
} from "@/lib/questionario-receber";
import { cameFromPaste, limparEndereco, packedFromHash, unpackData } from "@/lib/share-link";
import { importTreinos, receivedFichaVersao } from "@/lib/link-client";

/** Botão com nome no rótulo: a altura fixa (h-11/h-14) do Button vira mínima e o texto quebra sem vazar. */
const ALTURA_LIVRE = { height: "auto" } as const;

type Leitura = { t: "lendo" } | { t: "invalido" } | { t: "cortado" } | { t: "atualize" } | { t: "treinos"; packet: TreinosPacket } | { t: "anamnese"; raw: unknown };

/**
 * Links que chegam ao personal: os treinos que o aluno fez (ramo de sempre) e, desde a Entrega 1, as respostas do
 * questionário inicial (`kind: "anamnese"`, spec §5.5), testadas antes dos treinos. Lê o "#d=" uma vez e limpa o
 * endereço. Um tipo que este app não conhece pede para atualizar a página (spec §10.2).
 */
export default function ReceberPage() {
  const [leitura, setLeitura] = useState<Leitura>({ t: "lendo" });
  /** Veio pelo campo "Colar link" (dentro do app) e não pelo toque no link do WhatsApp. */
  const [viaPaste, setViaPaste] = useState(false);
  /** Safari do iPhone, fora do app instalado. */
  const [iosBrowser, setIosBrowser] = useState(false);
  const read = useRef(false);

  // Outro link aberto na mesma aba (app instalado que reaproveita a janela, link colado na barra): o navegador só troca
  // o "#". Lê de novo do zero, como /questionario: o efeito de leitura limpa a barra e as respostas novas aparecem.
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
    if (window.location.hash) limparEndereco(window.location.pathname);
    if (!packed) return setLeitura({ t: "cortado" });
    unpackData(packed)
      .then((raw) => {
        if ((raw as { kind?: unknown } | null)?.kind === "anamnese") return setLeitura({ t: "anamnese", raw });
        // Tipo desconhecido ou versão mais nova do protocolo (spec §10.2): "Atualize", nunca "link cortado".
        const prob = packetProblem(raw);
        if (prob === "tipo_desconhecido" || prob === "versao_nova") return setLeitura({ t: "atualize" });
        const p = parsePacket(raw);
        if (p?.kind !== "treinos") return setLeitura({ t: "invalido" });
        setLeitura({ t: "treinos", packet: p });
      })
      // Não deu nem para abrir o pacote: não se sabe o tipo (treinos ou respostas), e os dois vêm do aluno.
      .catch(() => setLeitura({ t: "cortado" }));
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Link href="/" aria-label="Shape Real" className="inline-flex min-h-11 items-center">
        <Logo />
      </Link>
      <main className="flex flex-1 flex-col justify-center py-8">
        {leitura.t === "anamnese" ? (
          <ReceberRespostas raw={leitura.raw} viaPaste={viaPaste} iosBrowser={iosBrowser} />
        ) : leitura.t === "atualize" ? (
          <LinkDeVersaoNova viaPaste={viaPaste} />
        ) : (
          <ReceberTreinos
            state={leitura.t === "lendo" ? "lendo" : leitura.t === "treinos" ? "pronto" : "invalido"}
            cortado={leitura.t === "cortado"}
            packet={leitura.t === "treinos" ? leitura.packet : null}
            viaPaste={viaPaste}
            iosBrowser={iosBrowser}
          />
        )}
      </main>
    </div>
  );
}

/** Beco sem saída: título, texto e, quando faz sentido, um caminho. */
function Beco({ texto, children }: { texto: ReactNode; children?: ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="plate-type text-[1.9rem] leading-tight">Este link não abriu</h1>
      <p className="text-steel">{texto}</p>
      {children}
    </div>
  );
}

/** Tipo de link que este app ainda não conhece: é de uma versão mais nova (spec §10.2). Nada é importado. */
function LinkDeVersaoNova({ viaPaste }: { viaPaste: boolean }) {
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    track("link_dead_end_shown", { tela: "receber", motivo: "versao_nova", via_paste: viaPaste });
  }, [viaPaste]);
  return <Beco texto={PROBLEMA_TEXTO.tipo_desconhecido} />;
}

// ---- respostas do questionário (spec §5.5) -------------------------------------------------------------------------

type Achou = "ref" | "nome" | "escolhido" | "novo";

/**
 * "Respostas de {aluno}": confere o pacote (versão nova e link cortado não importam nada), as guardas do aparelho
 * (nuvem, "Ver como aluno", aparelho do aluno, aparelho sem perfil, aparelho que não é de personal) e, no painel do
 * personal, a pergunta da vez (`etapaRecepcao`): já registradas (nada é gravado), apagadas antes, de qual aluno são,
 * confirmação de nome, reenvio e "Conferir antes de salvar". [Registrar respostas] → `applyAnamnese` → resumo do aluno.
 * Medição sem nenhuma resposta (só as funções de anamnese-events.ts) e sem `reportError` com conteúdo. `ph-no-capture`.
 */
function ReceberRespostas({ raw, viaPaste, iosBrowser }: { raw: unknown; viaPaste: boolean; iosBrowser: boolean }) {
  const { ready, user, repo, mode, returnTo, returnToOwner } = useApp();
  const router = useRouter();
  const problema = useMemo(() => packetProblem(raw), [raw]);
  const p = useMemo(() => (problema ? null : parseRespostas(raw)), [raw, problema]);
  /** null enquanto não conferiu. */
  const [noProfile, setNoProfile] = useState<boolean | null>(null);
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  /** Data em que estas respostas foram apagadas neste aparelho; undefined enquanto não leu. */
  const [apagado, setApagado] = useState<string | null | undefined>(undefined);
  const [decisoes, setDecisoes] = useState<DecisoesRecepcao>({});
  const [escolhas, setEscolhas] = useState<{ id: string; v: Escolhas } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const aberto = useRef(false);
  const deadEnd = useRef(false);
  const gravando = useRef(false);
  /** Aluno cadastrado aqui quando a gravação das respostas falhou: tentar de novo não cadastra outro. */
  const criado = useRef<Profile | null>(null);
  const tituloEtapa = useRef<HTMLHeadingElement>(null);
  const decidiu = useRef(false);
  const hoje = useMemo(() => new Date(), []);

  // Denominador dos becos sem saída: dispara antes das guardas (o efeito vem antes do de link_dead_end_shown).
  useEffect(() => {
    if (aberto.current) return;
    aberto.current = true;
    track("anamnese_link_opened", evAnamneseLinkOpened(viaPaste));
  }, [viaPaste]);

  useEffect(() => {
    if (ready) setNoProfile(mode === "local" && localRepo.listLocalProfiles().length === 0);
  }, [ready, mode]);

  const guarda = p && ready && noProfile !== null ? guardaReceber({ modo: mode, verComoAluno: Boolean(returnTo), user, temPerfil: !noProfile, coachId: p.coachId }) : undefined;
  const podeRegistrar = guarda === null && p !== null && user !== null;

  useEffect(() => {
    if (deadEnd.current) return;
    const motivo = problema ? motivoDoProblema(problema) : !p ? "invalido" : guarda ? motivoDaGuarda(guarda) : null;
    if (!motivo) return;
    deadEnd.current = true;
    track("link_dead_end_shown", { tela: "receber", motivo, via_paste: viaPaste });
  }, [problema, p, guarda, viaPaste]);

  const coachId = podeRegistrar ? user.id : null;
  useEffect(() => {
    if (!coachId || !p) return;
    let vivo = true;
    setApagado(apagadoEm(p.anamnese.id));
    repo
      .listStudents(coachId)
      .catch(() => [] as StudentSummary[])
      .then((list) => {
        if (vivo) setStudents(list);
      });
    return () => {
      vivo = false;
    };
  }, [coachId, p, repo]);

  const alunos = useMemo(() => students?.map((s) => s.profile) ?? [], [students]);
  const etapa = p && students && apagado !== undefined ? etapaRecepcao({ alunos, p, apagadoEm: apagado, decisoes }) : null;
  const chaveEtapa = etapa ? `${etapa.t}:${"aluno" in etapa ? etapa.aluno.id : ""}` : "";

  // Depois de uma decisão, o foco vai para a pergunta nova (na abertura, não: a página começa do topo).
  useEffect(() => {
    if (decidiu.current) tituloEtapa.current?.focus();
  }, [chaveEtapa]);

  if (problema || !p) {
    return (
      <div className="ph-no-capture">
        <Beco texto={textoProblemaReceber(problema ?? "invalido", (raw as { studentName?: unknown } | null)?.studentName)} />
      </div>
    );
  }

  const an = p.anamnese;
  const aluno = p.studentName;

  /** Há algo para escolher em "Conferir antes de salvar"? (só com diferenças; campo vazio é preenchido sem perguntar, §8.2) */
  function conferencia(alvo: Profile) {
    const diferencas = conflicts(alvo, an, hoje);
    const lim = diffLimitacoes(alvo, an, hoje);
    const temLim = limitacoesPedemConferencia(alvo, lim);
    return { diferencas, lim: temLim ? lim : undefined, tem: diferencas.length > 0 || temLim };
  }

  async function registrar(alvo: Profile | null, achou: Achou, escolhasAlvo: Escolhas) {
    if (!p || !user || gravando.current) return;
    gravando.current = true;
    setBusy(true);
    setErr(null);
    try {
      const agora = new Date().toISOString();
      let atual: Profile;
      const base = alvo ?? criado.current;
      if (base) {
        atual = (await repo.getProfile(base.id).catch(() => null)) ?? base;
      } else {
        atual = await repo.createStudent(user.id, { name: p.studentName.trim().replace(/\s+/g, " ") });
        criado.current = atual;
        // Na criação o cadastro só tem o nome: nenhum dado de saúde, como no cadastro rápido.
        track("student_created", { has_phone: false, consent: "sem_dados_saude", ...evStudentCreatedExtra("receber") });
      }
      // Toque duplo, ou registradas em outra aba enquanto esta estava aberta: nada a gravar.
      const estado = estadoRecepcao(atual, p);
      if (estado.tipo === "ja_registrado") {
        router.replace(`/alunos/${encodeURIComponent(atual.id)}?aba=resumo`);
        return;
      }
      const diferencas = conflicts(atual, an, new Date(agora));
      await repo.saveProfile(applyAnamnese(atual, an, escolhasAlvo, agora));
      if (!ehExemplo(atual)) {
        track(
          "anamnese_received",
          evAnamneseReceived({
            achou,
            diferencas,
            reenvio: estado.tipo === "substituir",
            ...(atual.anamnesePedido?.id === an.id ? { pedidoAt: atual.anamnesePedido.at } : {}),
            agora,
            ...(an.reavaliacao ? { reavaliacao: an.reavaliacao } : {}),
          }),
        );
      }
      // replace: o link já consumido sai do histórico; o voltar leva para onde o personal estava antes do link.
      router.replace(`/alunos/${encodeURIComponent(atual.id)}?aba=resumo&questionario=novo&recebido=1`);
    } catch (e) {
      // Só o tipo do erro: nada das respostas nem do perfil sai daqui.
      reportError(new Error(e instanceof Error ? e.name : "Error"), "link:receber-respostas");
      setErr("Não foi possível registrar. Tente de novo.");
      gravando.current = false;
      setBusy(false);
    }
  }

  /**
   * Um botão que responde à pergunta da vez. Se a próxima etapa já é registrar e não há nada para conferir, registra
   * direto (os botões dizem "registrar"); senão, mostra a próxima pergunta.
   */
  function decidir(mais: Partial<DecisoesRecepcao>) {
    if (!p) return;
    decidiu.current = true;
    const novas = { ...decisoes, ...mais };
    const prox = etapaRecepcao({ alunos, p, apagadoEm: apagado ?? null, decisoes: novas });
    if (prox.t === "registrar" && !conferencia(prox.aluno).tem) return void registrar(prox.aluno, prox.achou, {});
    setDecisoes(novas);
  }
  const verAluno = (id: string) => router.replace(`/alunos/${encodeURIComponent(id)}?aba=resumo`);
  const agoraNao = () => router.replace("/alunos");
  const cadastrarNovo = () => void registrar(null, "novo", {});
  const trocar = () => {
    decidiu.current = true;
    setDecisoes((d) => ({ ...d, trocar: true }));
  };

  const cabecalho = (
    <div>
      <h1 className="plate-type text-[2rem] leading-[1.05] break-words">{RECEBER_TEXTO.titulo(aluno)}</h1>
      <p className="mt-1.5 text-steel">{RECEBER_TEXTO.respondidoEm(an.answeredAt)}</p>
      {podeRegistrar ? <p className="text-steel">{RECEBER_TEXTO.autorizacao(aluno, an)}</p> : null}
    </div>
  );

  // Guardas do aparelho (spec §5.5, nesta ordem).
  if (!ready || noProfile === null || guarda === undefined) {
    return (
      <div className="ph-no-capture space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (guarda !== null) {
    return (
      <div className="ph-no-capture space-y-5">
        {cabecalho}
        {guarda === "nuvem" ? (
          <Alert tone="info">{RECEBER_TEXTO.nuvem}</Alert>
        ) : guarda === "ver_como_aluno" ? (
          <div className="space-y-3">
            <Alert tone="info">{RECEBER_TEXTO.verComoAluno}</Alert>
            <Button className="w-full" onClick={() => void returnToOwner()}>
              {RECEBER_TEXTO.voltarAoPainel}
            </Button>
          </div>
        ) : guarda === "respostas_no_aluno" ? (
          <Alert tone="info">{RECEBER_TEXTO.respostasNoAluno(user?.remoteCoach?.name ?? "")}</Alert>
        ) : guarda === "sem_perfil" ? (
          <>
            {/* Antes do card do iPhone: quem abre pode ser o aluno, que não tem o app. */}
            <p className="text-[0.9375rem] text-iron">{RECEBER_TEXTO.semPerfil("", aluno)}</p>
            {iosBrowser ? <ColarNoAppCard /> : null}
          </>
        ) : (
          <Alert tone="warn">{RECEBER_TEXTO.naoPersonal}</Alert>
        )}
      </div>
    );
  }

  if (!etapa) {
    return (
      <div className="ph-no-capture space-y-5" aria-busy="true">
        {cabecalho}
        <Skeleton className="h-28" />
      </div>
    );
  }

  const alvo = "aluno" in etapa ? etapa.aluno : null;
  const pontos = etapa.t === "ja_registrado" || etapa.t === "apagadas" ? null : RECEBER_TEXTO.pontos(pontosParaVer(an, alvo?.liberacoes ?? [], hoje));
  const titulo = "plate-type text-[1.35rem] leading-tight break-words outline-none";
  const vaiPara = alvo ? (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--radius-ficha)] border border-rule bg-paper py-1 pr-1 pl-4">
      <p className="min-w-0 break-words">
        {RECEBER_TEXTO.vaiPara} <strong>{alvo.name}</strong>
      </p>
      <Button variant="ghost" onClick={trocar} disabled={busy}>
        {RECEBER_TEXTO.trocar}
      </Button>
    </div>
  ) : null;

  let corpo: ReactNode;
  switch (etapa.t) {
    case "ja_registrado":
      corpo = (
        <section className="space-y-3">
          <h2 ref={tituloEtapa} tabIndex={-1} className={titulo}>
            {RECEBER_TEXTO.jaRegistrado(etapa.em)}
          </h2>
          <LinkButton href={`/alunos/${encodeURIComponent(etapa.aluno.id)}?aba=resumo`} size="lg" className="w-full">
            {RECEBER_TEXTO.verResumo}
          </LinkButton>
        </section>
      );
      break;
    case "apagadas":
      corpo = (
        <section className="space-y-3">
          <h2 ref={tituloEtapa} tabIndex={-1} className={titulo}>
            {RECEBER_TEXTO.apagadas(etapa.em, aluno)}
          </h2>
          <div className="grid gap-2">
            <Button variant="secondary" className="w-full" loading={busy} onClick={() => decidir({ apagadasOk: true })}>
              {RECEBER_TEXTO.registrarMesmoAssim}
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy} onClick={agoraNao}>
              {RECEBER_TEXTO.agoraNao}
            </Button>
          </div>
        </section>
      );
      break;
    case "escolher":
      corpo = (
        <section className="space-y-3">
          <h2 ref={tituloEtapa} tabIndex={-1} id="receber-escolher" className={titulo}>
            {RECEBER_TEXTO.escolherAluno}
          </h2>
          {alunos.length ? (
            <Select
              aria-labelledby="receber-escolher"
              value=""
              disabled={busy}
              onChange={(e) => {
                if (!e.target.value) return;
                decidiu.current = true;
                setDecisoes((d) => ({ ...d, escolhido: e.target.value, trocar: false, estadoOk: false }));
              }}
            >
              <option value="">Escolha o aluno</option>
              {alunos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="grid gap-2">
            <Button
              variant={alunos.length ? "secondary" : "primary"}
              size={alunos.length ? "md" : "lg"}
              className={cx("w-full text-center leading-snug", alunos.length ? "min-h-11 py-2.5" : "min-h-14 py-3")}
              style={ALTURA_LIVRE}
              loading={busy}
              onClick={cadastrarNovo}
            >
              {RECEBER_TEXTO.cadastrar(aluno)}
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy} onClick={agoraNao}>
              {RECEBER_TEXTO.agoraNao}
            </Button>
          </div>
        </section>
      );
      break;
    case "confirmar_nome":
      corpo = (
        <section className="space-y-3">
          <h2 ref={tituloEtapa} tabIndex={-1} className={titulo}>
            {RECEBER_TEXTO.confirmarNome(etapa.aluno.name)}
          </h2>
          <div className="grid gap-2">
            <Button size="lg" className="w-full" loading={busy} onClick={() => decidir({ identidadeOk: true })}>
              {RECEBER_TEXTO.simRegistrar}
            </Button>
            <Button variant="secondary" className="w-full" disabled={busy} onClick={trocar}>
              {RECEBER_TEXTO.escolherOutro}
            </Button>
            <Button variant="secondary" className="w-full" disabled={busy} onClick={cadastrarNovo}>
              {RECEBER_TEXTO.cadastrarComoNovo}
            </Button>
          </div>
        </section>
      );
      break;
    case "nome_diferente":
      corpo = (
        <section className="space-y-3">
          <h2 ref={tituloEtapa} tabIndex={-1} className="sr-only outline-none">
            {RECEBER_TEXTO.vaiPara} {etapa.aluno.name}
          </h2>
          <Alert tone="warn">{RECEBER_TEXTO.nomeDiferente(p.studentName, etapa.aluno.name)}</Alert>
          <div className="grid gap-2">
            {/* Rótulos com nome: a altura cresce com o texto (nome longo quebra em duas ou três linhas a 360 px). */}
            <Button size="lg" className="min-h-14 w-full py-3 text-center leading-snug" style={ALTURA_LIVRE} loading={busy} onClick={() => decidir({ identidadeOk: true })}>
              {RECEBER_TEXTO.eCadastro(etapa.aluno.name)}
            </Button>
            <Button variant="secondary" className="min-h-11 w-full py-2.5 text-center leading-snug" style={ALTURA_LIVRE} disabled={busy} onClick={cadastrarNovo}>
              {RECEBER_TEXTO.cadastrarNome(p.studentName)}
            </Button>
          </div>
        </section>
      );
      break;
    case "substituir":
      corpo = (
        <section className="space-y-3">
          {vaiPara}
          <h2 ref={tituloEtapa} tabIndex={-1} className={titulo}>
            {RECEBER_TEXTO.substituir(aluno, etapa.anterior)}
          </h2>
          <div className="grid gap-2">
            <Button size="lg" className="w-full" loading={busy} onClick={() => decidir({ estadoOk: true })}>
              {RECEBER_TEXTO.botaoSubstituir}
            </Button>
            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => verAluno(etapa.aluno.id)}>
              {RECEBER_TEXTO.manterAnteriores}
            </Button>
          </div>
        </section>
      );
      break;
    case "mais_antigas":
      corpo = (
        <section className="space-y-3">
          {vaiPara}
          <h2 ref={tituloEtapa} tabIndex={-1} className={titulo}>
            {RECEBER_TEXTO.maisAntigas(aluno, etapa.atual, an.answeredAt)}
          </h2>
          <div className="grid gap-2">
            <Button size="lg" className="w-full" disabled={busy} onClick={() => verAluno(etapa.aluno.id)}>
              {RECEBER_TEXTO.manterMaisNovas}
            </Button>
            <Button variant="secondary" className="w-full" loading={busy} onClick={() => decidir({ estadoOk: true })}>
              {RECEBER_TEXTO.usarEstas}
            </Button>
          </div>
        </section>
      );
      break;
    case "junto_antes":
      corpo = (
        <section className="space-y-3">
          {vaiPara}
          <h2 ref={tituloEtapa} tabIndex={-1} className={titulo}>
            {RECEBER_TEXTO.juntoAntes(etapa.data)}
          </h2>
          <div className="grid gap-2">
            <Button size="lg" className="w-full" loading={busy} onClick={() => decidir({ estadoOk: true })}>
              {RECEBER_TEXTO.usarDoLink}
            </Button>
            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => verAluno(etapa.aluno.id)}>
              {RECEBER_TEXTO.manterJunto(etapa.data)}
            </Button>
          </div>
        </section>
      );
      break;
    case "registrar": {
      const c = conferencia(etapa.aluno);
      const valor = escolhas?.id === etapa.aluno.id ? escolhas.v : escolhasIniciais(c.diferencas, c.lim);
      const registro = etapa;
      corpo = (
        <section className="space-y-4">
          {vaiPara}
          {c.tem ? (
            <div className="space-y-3">
              <h2 ref={tituloEtapa} tabIndex={-1} className={titulo}>
                {CONFERIR_TEXTO.titulo}
              </h2>
              <ConferirDiferencas diferencas={c.diferencas} limitacoes={c.lim} value={valor} onChange={(v) => setEscolhas({ id: registro.aluno.id, v })} aluno={registro.aluno.name} />
            </div>
          ) : (
            <h2 ref={tituloEtapa} tabIndex={-1} className="sr-only outline-none">
              {RECEBER_TEXTO.registrar}
            </h2>
          )}
          <div className="grid gap-2">
            <Button size="lg" className="w-full" loading={busy} onClick={() => void registrar(registro.aluno, registro.achou, valor)}>
              {RECEBER_TEXTO.registrar}
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy} onClick={agoraNao}>
              {RECEBER_TEXTO.agoraNao}
            </Button>
          </div>
        </section>
      );
      break;
    }
  }

  return (
    <div className="ph-no-capture space-y-5">
      {cabecalho}
      {etapa.t !== "ja_registrado" && p.coachId !== user?.id ? <Alert tone="info">{RECEBER_TEXTO.outroAparelho}</Alert> : null}
      {pontos ? (
        <p className="flex items-start gap-2 font-semibold text-iron">
          <TriangleAlert className="mt-[0.2em] size-[1.05em] shrink-0 text-warn-ink" aria-hidden />
          <span className="min-w-0">{pontos}</span>
        </p>
      ) : null}
      {corpo}
      {/* Erro ao gravar: aviso imediato (role="alert" no tom de erro). */}
      {err ? <Alert tone="error">{err}</Alert> : null}
    </div>
  );
}

// ---- treinos (sem mudança de comportamento) ------------------------------------------------------------------------

/**
 * Link que o aluno manda ao personal: leva os treinos feitos para o painel do personal. Antes de registrar, diz quais
 * treinos já estão no painel (pelo id); depois, separa novo, atualizado (mudou) e "já estava no painel" (U2d).
 * O eco da versão da ficha que veio no link é gravado ao registrar (U2c, `importTreinos` com `coachId`).
 */
function ReceberTreinos({
  state,
  cortado,
  packet,
  viaPaste,
  iosBrowser,
}: {
  state: "lendo" | "pronto" | "invalido";
  /** O pacote nem abriu (link cortado ao copiar): o texto vale para treinos e para respostas do questionário. */
  cortado: boolean;
  packet: TreinosPacket | null;
  viaPaste: boolean;
  iosBrowser: boolean;
}) {
  const { ready, user, repo, mode, returnTo, returnToOwner } = useApp();
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; updated: number; same: number; mirrored: number; studentId: string } | null>(null);
  /** Ids dos treinos que o aluno escolhido já tem no painel (U2d: "No painel", "já estão no painel"). */
  const [present, setPresent] = useState<{ studentId: string; ids: Set<string> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** null enquanto não conferiu. */
  const [noProfile, setNoProfile] = useState<boolean | null>(null);
  const deadEnd = useRef(false);
  const confirmacaoId = useId();

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

  // Acha o aluno no painel pelo cadastro de onde a ficha saiu (`studentRef`). Sem ele, nada é pré-escolhido: nome não é
  // identidade (R3-1; dois alunos podem ter o mesmo nome) e o personal escolhe e confirma.
  useEffect(() => {
    if (!packet || !user || user.role !== "coach" || returnTo) return;
    (async () => {
      const list = await repo.listStudents(user.id).catch(() => [] as StudentSummary[]);
      setStudents(list);
      setTarget(alvoInicialDoRetorno(packet, list) ?? "");
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
      // O eco da versão da ficha (U2c) só é gravado com o personal deste aparelho. Aluno escolhido à mão ou link de outro
      // personal: só com a confirmação explícita mostrada acima do botão (R3-1).
      const r = await importTreinos(packet, target, { coachId: user?.id, confirmedOther: pedeConfirmacao });
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
  const pede = packet && target ? retornoPedeConfirmacao(packet, target, user?.id) : { outroAluno: false, outroPersonal: false };
  const pedeConfirmacao = pede.outroAluno || pede.outroPersonal;
  /** Link de outro personal: o aviso aparece antes de escolher (o pacote já diz isso), sem esperar o aluno. */
  const deOutroPersonal = Boolean(packet?.coachId && user?.id && packet.coachId !== user.id);
  // Nome do aluno como está no painel deste personal (o do link pode estar escrito de outro jeito).
  const nameOf = (id: string) => firstName(students?.find((s) => s.profile.id === id)?.profile.name ?? packet?.studentName ?? "");
  /** Nome inteiro do aluno escolhido (na confirmação, dois alunos podem ter o mesmo primeiro nome). */
  const nomeEscolhido = (students?.find((s) => s.profile.id === target)?.profile.name ?? "").trim().replace(/\s+/g, " ");
  const inPanel = present && present.studentId === target ? present.ids : null;
  const preview = receivePreview(sessions.length, inPanel ? sessions.filter((s) => inPanel.has(s.id)).length : null, nameOf(target));
  const result = done ? receiveResult(done, nameOf(done.studentId)) : null;

  return state === "lendo" || !ready ? (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-40" />
    </div>
  ) : state === "invalido" || !packet ? (
    <Beco texto={cortado ? textoProblemaReceber("invalido", null) : "Ele pode ter sido cortado ao copiar. Peça ao aluno para enviar de novo pelo Histórico do app."}>
      <LinkButton href="/alunos" variant="secondary">
        Ir para o painel
      </LinkButton>
    </Beco>
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
              {/* Dor marcada pelo aluno (R3-7): o nome de cada exercício, como na página do aluno e na mensagem. */}
              {s.exercises.some((e) => e.pain === true) ? (
                <span data-dor className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-iron">
                  <Info className="mt-0.5 size-4 shrink-0 text-info-ink" aria-hidden />
                  <span className="min-w-0">
                    Dor marcada:{" "}
                    {s.exercises
                      .filter((e) => e.pain === true)
                      .map((e) => e.name)
                      .join(", ")}
                  </span>
                </span>
              ) : null}
            </span>
            {s.prs.length ? <RecordMark variant="icon" /> : null}
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
          {/* R3-1: sem o aluno do link no painel, nada é escolhido pelo nome; o personal escolhe e confirma. */}
          {!known ? <p className="text-[0.9375rem] text-iron">{TEXTO_RETORNO_SEM_ALUNO}</p> : null}
          {deOutroPersonal ? <Alert tone="warn">{textoOutroPersonal(packet.studentName)}</Alert> : null}
          {!known ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">De qual aluno são estes treinos?</span>
              <Select value={target} disabled={busy} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Escolha o aluno</option>
                {students.map((s) => (
                  <option key={s.profile.id} value={s.profile.id}>
                    {s.profile.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {/* A pergunta muda com a escolha: região viva (o leitor de tela ouve a confirmação nova). */}
          <p id={confirmacaoId} aria-live="polite" className={cx("text-[0.9375rem] font-semibold break-words", !(target && pedeConfirmacao) && "sr-only")}>
            {target && pedeConfirmacao ? textoConfirmarOutroAluno(packet.studentName, nomeEscolhido) : ""}
          </p>
          {err ? <Alert tone="error">{err}</Alert> : null}
          <div className="grid gap-2">
            <Button
              size="lg"
              className="min-h-14 w-full py-3 text-center leading-snug"
              style={ALTURA_LIVRE}
              loading={busy}
              disabled={!target}
              onClick={register}
              aria-describedby={target && pedeConfirmacao ? confirmacaoId : undefined}
            >
              {target && pedeConfirmacao ? `Sim, registrar em ${nomeEscolhido}` : preview.allPresent ? "Registrar de novo" : `Registrar no painel${known ? ` de ${first}` : ""}`}
            </Button>
            {/* Voltar sem registrar: nenhuma gravação. */}
            <LinkButton href="/alunos" variant="ghost" className="w-full">
              Agora não
            </LinkButton>
          </div>
          <p className="text-sm text-steel">Treinos que já estavam registrados são atualizados, não duplicados.</p>
        </div>
      )}
    </div>
  );
}
