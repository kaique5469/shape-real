"use client";

import { localRepo } from "@/lib/app-context";
import { comFotoDoArmazenamento } from "@/lib/data/local";
import { addDeclaracoes, addPrepEntries, fichaDelivery, fichaEchoOf, fichaVersao, isIsoDate, nextAck, parseDeclaracoes, parseFichaAck, parseFichaSendRecord, parsePrepLog, sameSession, type DeclaracaoEnvio, type FichaAck, type FichaDelivery, type FichaSendRecord, type FichaVersao, type PrepEntry, type PrepVia, type VersionPair } from "@/lib/domain/delivery";
import { uid } from "@/lib/domain/ids";
import { SENT_SINCE_KEY, sentKeyOf } from "@/lib/domain/export";
import { comContatos, CONTATOS_KEY, criadoresEContatos, parseContatos } from "@/lib/domain/perfis-de-entrada";
import {
  ConfirmacaoNecessaria,
  contatoDoPersonal,
  destinoPadrao,
  fichaLinkMatch,
  LinkDeOutraPessoa,
  MATCH_BLOQUEIA_ATUALIZAR,
  ObjetoDeOutroPerfil,
  ordenarPorUso,
  perfisDeEntrada,
  RetornoPedeConfirmacao,
  retornoPedeConfirmacao,
  rotuloDoPerfil,
  SemPerfilParaAtualizar,
  ultimoUso,
} from "@/lib/domain/link-identity";
import { fichaLinkItems, mergeMetric, mirrorLoads, receivedVersions, studentFieldsOf, type FichaPacket, type TreinosPacket } from "@/lib/domain/transfer";
import type { Profile, Program, Session } from "@/lib/domain/types";

/**
 * O que os links gravam e leem no aparelho: abrir a ficha (/abrir), registrar os treinos (/receber), "Perfis neste
 * aparelho" (/entrar) e o registro de envio (envio dos treinos e da ficha). Correção da revisão da rodada 3: saiu de
 * transfer-client.ts, que ficou só com a cópia de segurança e a restauração e reexporta tudo daqui (nenhum teste muda de
 * import). As rotas de link importam daqui e deixam de levar o plano de restauração e a validação da cópia.
 */

/**
 * Grava no aparelho o que chegou por link. Só existe no modo sem conta: com conta na nuvem,
 * personal e aluno já veem os mesmos dados.
 */

/** A volta da foto falhou no meio de abrir o link (nunca mostrar "salvo"). */
export const TEXTO_FICHA_INCOMPLETA = "A ficha não foi salva por inteiro neste celular. Abra o mesmo link de novo.";
/** A volta da foto falhou no meio de registrar os treinos recebidos. */
export const TEXTO_TREINOS_INCOMPLETOS = "Os treinos não foram registrados por inteiro. Abra o mesmo link de novo e registre outra vez.";

export interface ImportFichaOpts {
  /**
   * A pessoa tocou em "Salvar no meu celular" com o texto de autorização logo acima do botão; só então a autorização
   * de dados de saúde é gravada (origem "aluno_link"). Sem isso, nada é carimbado sozinho.
   */
  consent?: boolean;
  /**
   * "update": grava no perfil aberto (`current`), que mantém treinos e recordes; "new": cria um perfil separado e
   * deixa `current` intacto. Sem `target`, vale o padrão do estado (`destinoPadrao`: "novo" → new, "mesmo" → update);
   * nos estados que pedem escolha (legado, solo, outro_aluno, outro_personal), sem `target` nada é gravado.
   */
  target?: "update" | "new";
  /** Com "update" em outro_aluno ou outro_personal: a pessoa escolheu trocar o vínculo deste perfil. */
  allowRelink?: boolean;
}

/** Dono (perfil) da dieta com este id neste aparelho; null se não houver. A dieta é guardada por dono. */
async function donoDaDieta(dietId: string, perfis: readonly Profile[]): Promise<string | null> {
  for (const p of perfis) {
    const d = await localRepo.getDiet(p.id).catch(() => null);
    if (d && d.id === dietId) return p.id;
  }
  return null;
}

/**
 * O aluno recebe ficha e dieta do personal (R3-1: a identidade do link decide o que pode ser gravado). Devolve o perfil
 * que deve ficar aberto.
 *  - `fichaLinkMatch` + `opts.target` (ver `ImportFichaOpts`): atualizar um perfil de outro aluno ou de outro personal
 *    exige `allowRelink`; sem a escolha da tela, lança um erro tipado de link-identity.ts e não grava nada;
 *  - ficha ou dieta do pacote que já existem aqui com OUTRO dono (ex.: "Ver como aluno", em que o pacote traz a ficha
 *    do aluno do painel): com "new", gravadas com id novo; com "update", erro `ObjetoDeOutroPerfil`, sem gravação;
 *  - o personal do link só vira (ou continua) contato quando `contatoDoPersonal` deixa ("criar"/"atualizar"); quando
 *    ele é perfil de entrada deste aparelho ("manter": o próprio personal), telefone, CREF, exercícios e alimentos dele
 *    ficam como estão e o perfil do link não entra no painel dele;
 *  - todas as gravações rodam com a foto do armazenamento: cota no meio volta tudo ao que era.
 * `remoteCoach.recebido` guarda a versão do personal que chegou (`receivedVersions`); ela volta com os treinos.
 */
export async function importFicha(packet: FichaPacket, current: Profile | null, opts: ImportFichaOpts = {}): Promise<Profile> {
  const match = fichaLinkMatch(packet, current);
  const target = opts.target ?? destinoPadrao(match);
  if (target === null) throw new ConfirmacaoNecessaria(match);
  const atualizar = target === "update";
  if (atualizar && (match === "novo" || !current)) throw new SemPerfilParaAtualizar();
  if (atualizar && MATCH_BLOQUEIA_ATUALIZAR.includes(match) && !opts.allowRelink) throw new LinkDeOutraPessoa(match);

  const now = new Date().toISOString();
  const ref = packet.student.ref;
  // Só os campos de cadastro: o que mais vier no link (versões novas, link adulterado) não entra no perfil.
  const fields = studentFieldsOf(packet.student);
  // Quem atualiza o próprio perfil continua com o próprio histórico.
  const base: Profile = atualizar && current ? current : { id: uid(), name: fields.name, role: "athlete", plan: "free", onboarded: true, createdAt: now };

  // ---- leituras, todas antes da primeira gravação (gravar o aluno muda a resposta de `contatoDoPersonal`) ----
  const perfis = localRepo.listLocalProfiles();
  const criadores = await criadoresNesteAparelho(perfis);
  const contato = contatoDoPersonal(packet.coach.id, perfis, criadores);
  const coachAqui = contato === "atualizar" ? perfis.find((p) => p.id === packet.coach.id) ?? null : null;
  // Trocar de personal neste perfil: o personal anterior, se é contato aqui, continua contato (`sr:v1:contatos`), mesmo
  // depois de a ficha e a dieta dele saírem do perfil.
  const anterior = atualizar ? current?.remoteCoach?.id : undefined;
  const contatoAnterior = anterior && anterior !== packet.coach.id && contatoDoPersonal(anterior, perfis, criadores) === "atualizar" ? anterior : null;
  const novosContatos = [...(contato !== "manter" ? [packet.coach.id] : []), ...(contatoAnterior ? [contatoAnterior] : [])];
  let programId = packet.program?.id ?? null;
  if (packet.program) {
    const existente = await localRepo.getProgram(packet.program.id);
    if (existente && existente.ownerId !== base.id) {
      if (atualizar) throw new ObjetoDeOutroPerfil(match);
      programId = uid();
    }
  }
  let dietId = packet.diet?.id ?? null;
  if (packet.diet) {
    const dono = await donoDaDieta(packet.diet.id, perfis);
    if (dono && dono !== base.id) {
      if (atualizar) throw new ObjetoDeOutroPerfil(match);
      dietId = uid();
    }
  }
  const historico = atualizar ? await localRepo.listSessions(base.id) : [];

  const recebido = receivedVersions(packet, atualizar && current ? current.remoteCoach : undefined);
  const remoteCoach = { id: packet.coach.id, name: packet.coach.name, phone: packet.coach.phone, cref: packet.coach.cref, studentRef: ref, ...(recebido ? { recebido } : {}) };
  const profile: Profile = {
    ...fields,
    ...base,
    // O cadastro feito pelo personal completa o que a pessoa ainda não informou.
    ...Object.fromEntries(Object.entries(fields).filter(([k]) => base[k as keyof Profile] === undefined || base[k as keyof Profile] === "")),
    onboarded: true,
    remoteCoach,
    ...(opts.consent ? { consentHealthAt: now, consentSource: "aluno_link" as const } : {}),
  };

  return comFotoDoArmazenamento(async () => {
    await localRepo.saveProfile(profile);
    // O personal vira um contato local: "Acompanhado por", ficha "do seu personal" e os exercícios próprios dele.
    if (contato !== "manter") {
      await localRepo.saveProfile({ ...(coachAqui ?? { role: "coach", plan: "coach", onboarded: true, createdAt: now }), id: packet.coach.id, name: packet.coach.name, phone: packet.coach.phone, cref: packet.coach.cref, role: "coach" } as Profile);
      localRepo.linkDirect(packet.coach.id, profile.id, now);
      for (const e of packet.exercises) await localRepo.saveCustomExercise(packet.coach.id, { ...e, custom: true });
      for (const f of packet.foods) await localRepo.saveCustomFood(packet.coach.id, f);
    }
    gravarContatos(novosContatos);

    if (packet.program && programId) {
      let program: Program = { ...packet.program, id: programId, ownerId: profile.id, createdBy: packet.coach.id, active: true };
      // Reenvio: treinos feitos aqui depois da última alteração do personal (e ainda não devolvidos)
      // continuam valendo na ficha nova; a carga não volta para trás. Uma redução feita pelo personal
      // depois do treino é mantida.
      if (atualizar) program = mirrorLoads(program, historico) ?? program;
      // Mesmo id da ficha no aparelho do personal: reenviar atualiza a ficha em vez de duplicar.
      await localRepo.saveProgram({ ...program, updatedAt: now });
      await localRepo.setActiveProgram(profile.id, programId);
    }
    if (packet.diet && dietId) await localRepo.saveDiet({ ...packet.diet, id: dietId, ownerId: profile.id, createdBy: packet.coach.id });
    return profile;
  }, TEXTO_FICHA_INCOMPLETA);
}

// ---- perfis neste aparelho (R3-1) -----------------------------------------------------------------------------
/** Contatos de personal gravados neste aparelho (`sr:v1:contatos`, só ids). Ilegível = nenhum. */
export function contatosNesteAparelho(): string[] {
  try {
    return parseContatos(localStorage.getItem(CONTATOS_KEY));
  } catch {
    return [];
  }
}

/**
 * Acrescenta contatos à lista, SEM engolir erro: chamada dentro da foto do armazenamento (cota aqui volta tudo).
 * Nada a acrescentar = nenhuma gravação.
 */
export function gravarContatos(ids: readonly string[]): void {
  const lista = contatosNesteAparelho();
  const novos = ids.filter((id) => !lista.includes(id));
  if (!novos.length) return;
  localStorage.setItem(CONTATOS_KEY, JSON.stringify(comContatos(lista, novos)));
}

/**
 * Quem criou fichas e dietas dos alunos deste aparelho sem `managedBy` (`criadoresDeConteudo`): só esses alunos são
 * lidos (no aparelho do personal, quase nenhum; no do aluno, um ou dois). Mais os contatos gravados pelo link ou pela
 * cópia (`sr:v1:contatos`): o personal anterior continua contato depois de a ficha antiga ser excluída.
 */
export async function criadoresNesteAparelho(perfis: readonly Profile[]): Promise<Set<string>> {
  const conteudo: { ownerId: string; createdBy: string }[] = [];
  for (const p of perfis) {
    if (p.role !== "athlete" || p.managedBy) continue;
    for (const f of await localRepo.listPrograms(p.id).catch(() => [] as Program[])) conteudo.push(f);
    const d = await localRepo.getDiet(p.id).catch(() => null);
    if (d) conteudo.push(d);
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CONTATOS_KEY);
  } catch {}
  return criadoresEContatos(perfis, conteudo, raw);
}

/** Um perfil da lista "Perfis neste aparelho" (/entrar, modo local): nome, papel e último uso, nenhum dado de saúde. */
export interface PerfilDeEntrada {
  profile: Profile;
  rotulo: "Personal" | "Aluno";
  /** Data mais recente de uso conhecida (treino, ficha, criação); null sem data legível. */
  ultimoUso: string | null;
}

/**
 * "Perfis neste aparelho" (/entrar, modo local): só os perfis de entrada (`perfisDeEntrada`: sem perfil de teste ou de
 * exemplo, sem aluno do personal, sem o contato do personal), do uso mais recente para o mais antigo. Só lê; chamar
 * depois de montar (lê o localStorage). Entrar num deles: `continueAsLocal` (app-context), que confere de novo.
 * Aqui e não no app-context para a lista não pesar em todas as telas (/entrar já carrega este arquivo).
 */
export async function perfisNesteAparelho(): Promise<PerfilDeEntrada[]> {
  if (typeof window === "undefined") return [];
  const todos = localRepo.listLocalProfiles();
  const perfis = perfisDeEntrada(todos, await criadoresNesteAparelho(todos));
  const itens = await Promise.all(
    perfis.map(async (p) => {
      const datas: (string | null | undefined)[] = [p.createdAt];
      const [ultimo] = await localRepo.listSessions(p.id, { limit: 1 }).catch(() => [] as Session[]);
      datas.push(ultimo?.startedAt);
      for (const f of await localRepo.listPrograms(p.id).catch(() => [] as Program[])) datas.push(f.updatedAt);
      // Personal: o último treino registrado de um aluno dele e a última ficha mexida contam como uso do painel.
      if (p.role === "coach") for (const a of await localRepo.listStudents(p.id).catch(() => [])) datas.push(a.lastSessionAt, a.activeProgram?.updatedAt);
      return { profile: p, rotulo: rotuloDoPerfil(p), ultimoUso: ultimoUso(datas) };
    }),
  );
  return ordenarPorUso(itens);
}

/**
 * O personal recebe os treinos do aluno. Devolve quantos eram novos (`added`), quantos já existiam e mudaram
 * (`updated`), quantos já estavam iguais no painel (`same`, nada é regravado) e quantos exercícios da ficha
 * passaram a mostrar a carga que o aluno fez (`mirrored`).
 * `opts.coachId` (o personal deste aparelho): com ele, o eco da versão (`packet.ficha`) é gravado em `:ack`, só se o
 * pacote for deste personal e deste aluno (`fichaEchoOf`) e mais novo que o eco atual (`nextAck`). Link antigo
 * (sem `ficha`) não grava nada.
 * R3-1: registrar num aluno que não é o do link (escolha manual em /receber) ou com um link de outro personal exige
 * `opts.confirmedOther` (a confirmação explícita da tela); sem ela, `RetornoPedeConfirmacao` e nada é gravado.
 * As gravações rodam com a foto do armazenamento: cota no meio volta tudo ao que era.
 */
export async function importTreinos(packet: TreinosPacket, studentId: string, opts: { coachId?: string; confirmedOther?: boolean } = {}): Promise<{ added: number; updated: number; same: number; mirrored: number }> {
  const pede = retornoPedeConfirmacao(packet, studentId, opts.coachId);
  if ((pede.outroAluno || pede.outroPersonal) && !opts.confirmedOther) throw new RetornoPedeConfirmacao(pede.outroAluno, pede.outroPersonal);

  const existing = new Map((await localRepo.listSessions(studentId)).map((s) => [s.id, s] as const));
  const active = (await localRepo.listPrograms(studentId)).find((p) => p.active);
  const metrics = await localRepo.listMetrics(studentId);
  const echo = fichaEchoOf(packet, studentId, opts.coachId);

  return comFotoDoArmazenamento(async () => {
    let added = 0;
    let updated = 0;
    let same = 0;
    const incoming: Session[] = [];
    for (const s of packet.sessions) {
      const session: Session = { ...s, userId: studentId };
      const prev = existing.get(s.id);
      incoming.push(session);
      if (prev && sameSession(prev, session)) {
        same += 1;
        continue;
      }
      if (prev) updated += 1;
      else added += 1;
      existing.set(s.id, session);
      await localRepo.saveSession(session);
    }

    // Dentro da foto e sem engolir erro: uma cota aqui volta os treinos gravados acima.
    if (echo) gravarFichaAck(studentId, { ...echo, treinosSentAt: packet.sentAt, registeredAt: new Date().toISOString() });

    // A ficha ativa do aluno passa a mostrar a carga atual: o próximo reenvio não faz a carga regredir.
    let mirrored = 0;
    if (active) {
      const next = mirrorLoads(active, incoming);
      if (next) {
        mirrored = next.days.reduce((n, d, i) => n + d.exercises.filter((e, j) => e.loadKg !== active.days[i]?.exercises[j]?.loadKg).length, 0);
        await localRepo.saveProgram(next, { keepUpdatedAt: true });
      }
    }

    for (const m of packet.metrics) {
      // Mesmo registro chegando de novo: atualiza. Mesma data de uma avaliação do personal: o aluno só completa.
      const same = metrics.find((x) => x.id === m.id) ?? metrics.find((x) => x.date === m.date);
      const merged = { ...mergeMetric(same, { ...m, userId: studentId }), userId: studentId };
      await localRepo.saveMetric(merged);
      if (same) metrics[metrics.indexOf(same)] = merged;
      else metrics.push(merged);
    }
    return { added, updated, same, mirrored };
  }, TEXTO_TREINOS_INCOMPLETOS);
}

// ---- treinos já enviados ao personal (aparelho do aluno) ----------------------------
const sentKey = (userId: string) => sentKeyOf(userId);

export function sentSessionIds(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(sentKey(userId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Só a lista antiga (compatibilidade). Toque novo de envio usa `markSessionsPrepared`, que grava canal e hora. */
export function markSessionsSent(userId: string, ids: string[], at: string = new Date().toISOString()) {
  try {
    const all = sentSessionIds(userId);
    for (const id of ids) all.add(id);
    localStorage.setItem(sentKey(userId), JSON.stringify([...all].slice(-500)));
    localStorage.setItem(sentKeyOf(userId, ":at"), at);
  } catch {}
}

// ---- registro de envio com evidência (U2; tipos e regras em @/lib/domain/delivery) ------
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Último toque de envio por treino neste aparelho (`sr:sent:{id}:log`); entradas ilegíveis ficam de fora. */
export function prepLog(userId: string): Record<string, PrepEntry> {
  return parsePrepLog(readJson(sentKeyOf(userId, ":log")));
}

/**
 * Toque em "Enviar no WhatsApp" ou "Copiar mensagem" do envio de treinos: grava canal e hora por treino no log
 * (no máximo PREP_LOG_MAX, saem os mais antigos), a lista antiga e `:at` (Hoje e cópias antigas continuam iguais).
 * Registra o TOQUE: nunca afirma que a mensagem saiu ou chegou.
 */
export function markSessionsPrepared(userId: string, ids: readonly string[], via: PrepVia, at: string = new Date().toISOString()): boolean {
  // R3-3: false = o toque não ficou registrado (cota, armazenamento bloqueado): a lista antiga também não muda, e o
  // treino continua "para enviar". A tela diz isso (TEXTO_REGISTRO_FALHOU), nunca "copiada às …".
  try {
    const log = addPrepEntries(prepLog(userId), ids, { via, at });
    localStorage.setItem(sentKeyOf(userId, ":log"), JSON.stringify(log));
  } catch {
    return false;
  }
  markSessionsSent(userId, [...ids], at);
  return true;
}

/** O que a pessoa declarou sobre cada treino deste perfil (`sr:sent:{id}:decl`, R3-3); entradas ilegíveis ficam de fora. */
export function declaracoesDeEnvio(userId: string): Record<string, DeclaracaoEnvio> {
  return parseDeclaracoes(readJson(sentKeyOf(userId, ":decl")));
}

function gravarDeclaracao(userId: string, ids: readonly string[], campo: keyof DeclaracaoEnvio, at: string): boolean {
  if (!ids.length) return true;
  try {
    localStorage.setItem(sentKeyOf(userId, ":decl"), JSON.stringify(addDeclaracoes(declaracoesDeEnvio(userId), ids, campo, at)));
    return true;
  } catch {
    return false;
  }
}

/**
 * "Já enviei" (R3-3): declaração da pessoa, rotulada assim na tela; nunca "recebido". Também entra na lista antiga
 * (uma versão anterior do app, num rollback, continua tratando o treino como enviado). false = não gravou.
 */
export function declareSessionsSent(userId: string, ids: readonly string[], at: string = new Date().toISOString()): boolean {
  if (!gravarDeclaracao(userId, ids, "enviei", at)) return false;
  markSessionsSent(userId, [...ids], at);
  return true;
}

/** Dispensar o lembrete "Você copiou…" do Hoje (R3-3). Nunca vira confirmação: o treino continua "preparado". */
export function dismissSessionsReminder(userId: string, ids: readonly string[], at: string = new Date().toISOString()): boolean {
  return gravarDeclaracao(userId, ids, "dispensei", at);
}

/** Aparelho do personal: o registro de envio da ficha e da dieta deste aluno (`sr:sent:{alunoId}:ficha`). */
export function fichaSendRecord(studentId: string): FichaSendRecord | null {
  return parseFichaSendRecord(readJson(sentKeyOf(studentId, ":ficha")));
}

/**
 * Toque de envio da ficha (link no WhatsApp ou mensagem copiada): o ÚNICO registro de envio da ficha, com as
 * versões (`updatedAt`) da ficha e da dieta que foram no pacote. Não grava nada na ficha. Garante o marcador
 * de início do registro (`sr:sent:@desde`).
 */
export function markFichaPrepared(studentId: string, rec: FichaSendRecord) {
  deliveryTrackingSince();
  try {
    const clean: FichaSendRecord = { at: rec.at, via: rec.via, programAt: rec.programAt ?? null, dietAt: rec.dietAt ?? null };
    localStorage.setItem(sentKeyOf(studentId, ":ficha"), JSON.stringify(clean));
  } catch {}
}

/** Aparelho do personal: a versão da ficha e da dieta que o aluno disse ter, vinda com os treinos (`:ack`). */
export function fichaAckOf(studentId: string): FichaAck | null {
  return parseFichaAck(readJson(sentKeyOf(studentId, ":ack")));
}

/** Grava o eco sem engolir erro (dentro da foto de `importTreinos`). */
function gravarFichaAck(studentId: string, ack: FichaAck) {
  const next = nextAck(fichaAckOf(studentId), ack);
  localStorage.setItem(sentKeyOf(studentId, ":ack"), JSON.stringify(next));
}

/** Grava o eco do aluno só se o pacote de treinos for mais novo que o do eco atual (`nextAck`: nunca volta atrás). */
export function recordFichaAck(studentId: string, ack: FichaAck) {
  try {
    gravarFichaAck(studentId, ack);
  } catch {}
}

/**
 * Desde quando este aparelho registra envios de ficha (`sr:sent:@desde`). Grava "agora" na primeira leitura.
 * Fora da cópia de segurança: num aparelho novo recomeça, e o que é mais antigo vira "sem informação".
 */
export function deliveryTrackingSince(now: string = new Date().toISOString()): string {
  try {
    const cur = localStorage.getItem(SENT_SINCE_KEY);
    if (isIsoDate(cur)) return cur;
    localStorage.setItem(SENT_SINCE_KEY, now);
  } catch {}
  return now;
}

/**
 * Situação do envio da ficha e da dieta deste aluno (U2b), lida agora do aparelho: `current` = as versões do que
 * iria no link (`fichaLinkItems`). Garante o marcador `@desde` (gravado na primeira leitura).
 */
export function readFichaDelivery(studentId: string, current: VersionPair): FichaDelivery {
  return fichaDelivery({ current, record: fichaSendRecord(studentId), ack: fichaAckOf(studentId), trackingSince: deliveryTrackingSince() });
}

/** Versões (os `updatedAt`) do que iria no link da ficha deste aluno agora (`fichaLinkItems`), no aparelho. */
export async function fichaVersionsOf(studentId: string): Promise<VersionPair> {
  const [programs, diet] = await Promise.all([localRepo.listPrograms(studentId), localRepo.getDiet(studentId)]);
  const items = fichaLinkItems(programs, diet);
  return { programAt: items.program?.updatedAt ?? null, dietAt: items.diet?.updatedAt ?? null };
}

/**
 * Medição de `/receber` (`treinos_link_received.ficha_versao`): a versão que veio com os treinos comparada com a
 * atual. Só conta o eco que vale (`fichaEchoOf`: mesmo personal e mesmo aluno); sem ele, `sem_info`.
 */
export async function receivedFichaVersao(packet: TreinosPacket, studentId: string, coachId: string | undefined): Promise<FichaVersao> {
  const echo = fichaEchoOf(packet, studentId, coachId);
  return echo ? fichaVersao(echo, await fichaVersionsOf(studentId)) : "sem_info";
}

/** Apaga as chaves de envio de um perfil. Implementada em data/local (o repositório chama ao remover um perfil). */
export { clearDeliveryKeys } from "@/lib/data/local";
