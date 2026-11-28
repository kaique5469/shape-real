"use client";

import { localRepo } from "@/lib/app-context";
import { track } from "@/lib/analytics";
import { comFotoDoArmazenamento, lastBackupAt, markBackupDone, TEXTO_COTA_LOCAL } from "@/lib/data/local";
import { DataError, type Repository } from "@/lib/data/repository";
import { addDeclaracoes, addPrepEntries, fichaDelivery, fichaEchoOf, fichaVersao, isIsoDate, mesclarChaveDeEnvio, nextAck, parseDeclaracoes, parseFichaAck, parseFichaSendRecord, parsePrepLog, sameSession, type DeclaracaoEnvio, type FichaAck, type FichaDelivery, type FichaSendRecord, type FichaVersao, type PrepEntry, type PrepVia, type VersionPair } from "@/lib/domain/delivery";
import { uid } from "@/lib/domain/ids";
import {
  backupAgeBucket,
  backupFileName,
  buildBackup,
  chaveDoRegistro,
  copiaDeVersaoNova,
  CopiaRecusada,
  downloadText,
  lerCopia as lerCopiaFile,
  mesclarRestauracao,
  parseBackup as parseBackupFile,
  planoRestauracao,
  rodadasQueNaoVoltaram,
  SENT_KEY_RE,
  SENT_SINCE_KEY,
  SENT_SUFFIXES,
  sentKeyOf,
  type AparelhoParaRestaurar,
  type Backup,
  type BackupBundle,
  type PlanoRestauracao,
} from "@/lib/domain/export";
import {
  ConfirmacaoNecessaria,
  contatoDoPersonal,
  criadoresDeConteudo,
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
import type { BodyMetric, DietPlan, Profile, Program, Session } from "@/lib/domain/types";
import { APAGADO_PREFIXO, apagadoEm, idsDasRodadas, marcarApagado } from "@/lib/questionario-client";

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
  const contato = contatoDoPersonal(packet.coach.id, perfis, await criadoresNesteAparelho(perfis));
  const coachAqui = contato === "atualizar" ? perfis.find((p) => p.id === packet.coach.id) ?? null : null;
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
/**
 * Quem criou fichas e dietas dos alunos deste aparelho sem `managedBy` (`criadoresDeConteudo`): só esses alunos são
 * lidos (no aparelho do personal, quase nenhum; no do aluno, um ou dois).
 */
export async function criadoresNesteAparelho(perfis: readonly Profile[]): Promise<Set<string>> {
  const conteudo: { ownerId: string; createdBy: string }[] = [];
  for (const p of perfis) {
    if (p.role !== "athlete" || p.managedBy) continue;
    for (const f of await localRepo.listPrograms(p.id).catch(() => [] as Program[])) conteudo.push(f);
    const d = await localRepo.getDiet(p.id).catch(() => null);
    if (d) conteudo.push(d);
  }
  return criadoresDeConteudo(perfis, conteudo);
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

/** Chaves "sr:sent:*" destes perfis, para a cópia de segurança (`@desde` fica de fora). */
function readSentKeys(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const id of ids) {
      for (const suffix of SENT_SUFFIXES) {
        const k = sentKeyOf(id, suffix);
        const v = localStorage.getItem(k);
        if (v !== null && SENT_KEY_RE.test(k)) out[k] = v;
      }
    }
  } catch {}
  return out;
}

/** Marcas `sr:v1:qapagado:{id}` deste aparelho (id da rodada → data), para a cópia de segurança. Só ids e datas. */
function readApagadas(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(APAGADO_PREFIXO)) continue;
      const id = k.slice(APAGADO_PREFIXO.length);
      const at = apagadoEm(id);
      if (id && at) out[id] = at;
    }
  } catch {}
  return out;
}

/**
 * Grava as marcas de rodadas apagadas da cópia, sem trocar uma marca mais nova que já esteja no aparelho. Dentro da foto
 * da restauração: `marcarApagado` não avisa quando falha, então a marca é conferida e a falta dela vira erro de cota
 * (volta tudo ao que era, em vez de terminar "ok" sem as marcas).
 */
function restoreApagadas(apagadas: Record<string, string> | undefined): void {
  for (const [id, at] of Object.entries(apagadas ?? {})) {
    const ja = apagadoEm(id);
    if (!ja || Date.parse(at) > Date.parse(ja)) {
      marcarApagado(id, at);
      if (apagadoEm(id) !== at) throw new DataError(TEXTO_COTA_LOCAL, "limit");
    }
  }
}

/**
 * Rodadas deste perfil na cópia que foram apagadas (ou tiveram a saúde revogada) neste aparelho DEPOIS da cópia:
 * restaurar não traz essas respostas de volta (`mesclarRestauracao`). Sem a data do arquivo, qualquer marca conta.
 */
function apagadasDepoisDaCopia(profile: Profile, exportedAt: string | undefined): Map<string, string> {
  const desde = exportedAt ? Date.parse(exportedAt) : Number.NaN;
  const out = new Map<string, string>();
  for (const id of idsDasRodadas(profile)) {
    const em = apagadoEm(id);
    if (em && (!Number.isFinite(desde) || Date.parse(em) > desde)) out.set(id, em);
  }
  return out;
}

// ---- cópia de segurança ------------------------------------------------------------
/** Lê do armazenamento tudo o que entra na cópia deste perfil (fotos ficam de fora). */
export async function collectBackup(repo: Repository, user: Profile, now = new Date()): Promise<Backup> {
  const bundle = async (p: Profile): Promise<BackupBundle> => {
    const [programs, sessions, metrics, diet, customExercises, customFoods] = await Promise.all([
      repo.listPrograms(p.id),
      repo.listSessions(p.id),
      repo.listMetrics(p.id),
      repo.getDiet(p.id),
      repo.listCustomExercises(p.id).catch(() => []),
      repo.listCustomFoods(p.id).catch(() => []),
    ]);
    return { profile: p, programs, sessions, metrics, diet, customExercises, customFoods };
  };
  const main = await bundle(user);
  // Personal: os alunos vão junto, cada um com fichas, treinos, medidas, dieta e o que for próprio dele.
  const students = user.role === "coach" ? await Promise.all((await repo.listStudents(user.id)).map(({ profile }) => bundle(profile))) : undefined;
  // Aluno que recebe a ficha por link: o personal guardado aqui e os exercícios/alimentos dele (a ficha aponta para eles).
  let remoteCoach: BackupBundle | undefined;
  if (repo.mode === "local" && user.remoteCoach) {
    const coach = await localRepo.getProfile(user.remoteCoach.id);
    if (coach) {
      const [customExercises, customFoods] = await Promise.all([localRepo.listCustomExercises(coach.id), localRepo.listCustomFoods(coach.id)]);
      remoteCoach = { profile: coach, customExercises, customFoods };
    }
  }
  const sent = readSentKeys([user.id, ...(students ?? []).map((s) => s.profile.id)]);
  const apagadas = repo.mode === "local" ? readApagadas() : {};
  return buildBackup({ ...main, students, remoteCoach, sent, apagadas }, now);
}

/**
 * Entrega o arquivo: compartilhar nativo quando o aparelho aceita arquivos (iPhone: "Salvar em Arquivos");
 * senão, download (o Chrome do Android recusa compartilhar .json). null quando a pessoa fecha o compartilhar.
 */
export async function deliverBackup(backup: Backup, now = new Date()): Promise<{ via: "share" | "download"; fileName: string } | null> {
  const fileName = backupFileName(now);
  const json = JSON.stringify(backup);
  if (typeof File !== "undefined" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const file = new File([json], fileName, { type: "application/json" });
    let shareable = false;
    try {
      shareable = navigator.canShare?.({ files: [file] }) ?? false;
    } catch {}
    if (shareable) {
      try {
        await navigator.share({ files: [file] });
        return { via: "share", fileName };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        // Sem permissão (o toque expirou) ou erro do aparelho: cai para o download.
      }
    }
  }
  downloadText(fileName, json, "application/json");
  return { via: "download", fileName };
}

/**
 * Botão "Fazer cópia de segurança" / "Fazer agora": monta, entrega e guarda a data da cópia.
 * A medição leva só a faixa de dias desde a cópia anterior e o caminho (nunca dados do arquivo).
 */
export async function makeBackup(repo: Repository, user: Profile, where: "conta" | "hoje" | "alunos" | "instalar"): Promise<{ via: "share" | "download"; fileName: string; students: number } | null> {
  const now = new Date();
  const previous = lastBackupAt();
  const backup = await collectBackup(repo, user, now);
  const done = await deliverBackup(backup, now);
  if (!done) return null;
  markBackupDone(now.toISOString());
  track("backup_shared", { dias_desde_ultima: backupAgeBucket(previous, now), via: done.via, onde: where, alunos: backup.students?.length ?? 0 });
  return { ...done, students: backup.students?.length ?? 0 };
}

/** Lê o arquivo da cópia (v1 "shape-real-backup.json" ou v2). null se não for uma cópia do app. */
export const parseBackup = parseBackupFile;
/** Lê o arquivo da cópia e diz o motivo quando não serve ("invalido" ou "versao_nova", R3-6 A). */
export const lerCopia = lerCopiaFile;

/**
 * Coleção do repositório local lida direto (mesmo formato de data/local.ts: `sr:v1:{nome}`, JSON), UMA vez por
 * restauração. O repositório não tem leitura por id de treinos e medidas de todos os perfis, e ler perfil por perfil
 * (`listSessions` de cada um) relê a coleção inteira a cada chamada. Ilegível = vazia.
 */
function colecaoLocal<T>(nome: string): T[] {
  try {
    const raw = localStorage.getItem(`sr:v1:${nome}`);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** O que o aparelho tem agora, para o plano de restauração (R3-6 A.4). Só leitura. */
function fotoDoAparelho(perfis: readonly Profile[]): AparelhoParaRestaurar {
  const porId = <T extends { id: string }>(rows: T[]) => new Map(rows.filter((r) => r && typeof r.id === "string").map((r) => [r.id, r] as const));
  return {
    fichas: porId(colecaoLocal<Program>("programs")),
    dietas: new Map(colecaoLocal<DietPlan>("diets").filter((d) => d && typeof d.ownerId === "string").map((d) => [d.ownerId, d] as const)),
    treinos: porId(colecaoLocal<Session>("sessions")),
    medidas: porId(colecaoLocal<BodyMetric>("metrics")),
    perfis: new Set(perfis.map((p) => p.id)),
  };
}

/**
 * Plano da restauração para o diálogo, ANTES de confirmar (R3-6 A.4): quantos registros deste aparelho ficam (mais
 * novos que a cópia, ou de outro perfil) e quantos entram. Só leitura (`textoDoPlano` em domain/export.ts monta o texto).
 */
export function planejarRestauracao(b: Backup): PlanoRestauracao {
  return planoRestauracao(b, fotoDoAparelho(localRepo.listLocalProfiles()), sameSession);
}

/** Aluno cujas respostas de saúde não voltaram com a cópia (R3-13): o diálogo avisa depois de restaurar. */
export interface RodadaOmitida {
  alunoId: string;
  nome: string;
  /** Data da marca de apagado neste aparelho (a mais nova). */
  em: string;
}

export interface ResultadoDaRestauracao {
  profile: Profile;
  students: number;
  /** O plano aplicado (mesmas contagens do diálogo, recalculadas na hora de gravar). */
  plano: PlanoRestauracao;
  rodadasOmitidas: RodadaOmitida[];
}

async function restoreBundle(b: BackupBundle, exportedAt: string | undefined, plano: PlanoRestauracao, omitidas: RodadaOmitida[], ownerOverride?: Partial<Profile>) {
  const dono = b.profile.id;
  const decisao = (tipo: Parameters<typeof chaveDoRegistro>[0], id: string) => plano.decisoes.get(chaveDoRegistro(tipo, id)) ?? "entra";
  // Exercícios e alimentos próprios antes das fichas e dietas que apontam para eles.
  for (const e of b.customExercises ?? []) await localRepo.saveCustomExercise(dono, { ...e, custom: true });
  for (const f of b.customFoods ?? []) await localRepo.saveCustomFood(dono, f);
  // Perfil que já existe no aparelho: as respostas do questionário mais novas e as liberações dos dois lados ficam
  // (D-32), e o que foi revogado ou apagado aqui depois da cópia não volta. O resto vem da cópia, como antes. Perfil que
  // não está aqui (ex.: removido depois da cópia): vem da cópia sem as rodadas apagadas aqui depois dela (R3-13).
  const atual = await localRepo.getProfile(dono).catch(() => null);
  const apagadas = apagadasDepoisDaCopia(b.profile, exportedAt);
  const daCopia = { ...b.profile, ...ownerOverride };
  const restaurado = mesclarRestauracao(atual, daCopia, apagadas);
  await localRepo.saveProfile(restaurado);
  const em = rodadasQueNaoVoltaram(daCopia, restaurado, apagadas);
  if (em) omitidas.push({ alunoId: dono, nome: restaurado.name, em });

  // Plano (R3-6 A.4): só entra o que não deixa para trás uma edição mais nova deste aparelho nem muda o dono de nada.
  // A ficha ativa fica a do aparelho quando ele tem uma para este perfil.
  const ativa = plano.ativas.get(dono);
  for (const p of b.programs ?? []) {
    if (decisao("ficha", p.id) !== "entra") continue;
    await localRepo.saveProgram({ ...p, ownerId: dono, active: ativa !== undefined ? ativa === p.id : p.active }, { keepUpdatedAt: true });
  }
  const sessions = (b.sessions ?? []).filter((s) => decisao("treino", s.id) === "entra");
  if (sessions.length) localRepo.saveSessionsBulk(sessions.map((s) => ({ ...s, userId: dono })));
  const metrics = (b.metrics ?? []).filter((m) => decisao("medida", m.id) === "entra");
  if (metrics.length) localRepo.saveMetricsBulk(metrics.map((m) => ({ ...m, userId: dono })));
  // A data da dieta é a da edição, não a da restauração (senão o registro de envio diria que ela "mudou").
  if (b.diet && decisao("dieta", dono) === "entra") await localRepo.saveDiet({ ...b.diet, ownerId: dono }, { keepUpdatedAt: true });
}

/**
 * Restaura a cópia neste aparelho (fotos não vão no arquivo). Devolve o perfil a abrir, o plano aplicado e os alunos
 * cujas respostas de saúde não voltaram. R3-6 A:
 *  - cópia de versão mais nova: `CopiaRecusada`, antes de qualquer gravação (a leitura do arquivo já recusa);
 *  - tudo é lido antes da primeira gravação (o plano, o contato do personal, as marcas de apagado);
 *  - todas as gravações rodam com a foto do armazenamento: cota no meio volta tudo ao que era e a mensagem é a de cota
 *    ("Nada foi alterado"); se a volta também falhar, `ArmazenamentoIncompleto` ("Restaure de novo o mesmo arquivo").
 *    Nada de erro engolido lá dentro: treinos enviados (`sent`), marcas de apagado e a data da cópia entram na foto;
 *  - R3-1: o personal da cópia de um aluno só é criado como contato quando não existe aqui; quando ele é perfil de
 *    entrada (a cópia do aluno restaurada no aparelho do próprio personal), nada dele é regravado e o aluno restaurado
 *    não entra no painel dele.
 */
export async function restoreBackup(b: Backup): Promise<ResultadoDaRestauracao> {
  if (copiaDeVersaoNova(b)) throw new CopiaRecusada("versao_nova");
  const now = new Date().toISOString();
  // ---- leituras, antes da primeira gravação ----
  const perfis = localRepo.listLocalProfiles();
  const plano = planoRestauracao(b, fotoDoAparelho(perfis), sameSession);
  // Personal de quem recebe a ficha por link.
  const rc = b.remoteCoach && b.remoteCoach.profile.id !== b.profile.id ? b.remoteCoach : undefined;
  const contato = rc ? contatoDoPersonal(rc.profile.id, perfis, await criadoresNesteAparelho(perfis)) : null;
  const exercicosDoContato = rc && contato === "atualizar" ? new Set((await localRepo.listCustomExercises(rc.profile.id)).map((e) => e.id)) : new Set<string>();
  const alimentosDoContato = rc && contato === "atualizar" ? new Set((await localRepo.listCustomFoods(rc.profile.id)).map((f) => f.id)) : new Set<string>();
  // As rodadas comparadas são as deste aparelho antes de gravar as marcas do arquivo (que são de antes da cópia).
  const exportedAt = b.exportedAt;

  return comFotoDoArmazenamento(async () => {
    if (rc && contato === "criar") {
      // Contato que não existe: exercícios e alimentos dele primeiro (as fichas apontam para eles), depois o perfil.
      for (const e of rc.customExercises ?? []) await localRepo.saveCustomExercise(rc.profile.id, { ...e, custom: true });
      for (const f of rc.customFoods ?? []) await localRepo.saveCustomFood(rc.profile.id, f);
      await localRepo.saveProfile({ ...rc.profile, role: "coach" });
    } else if (rc && contato === "atualizar") {
      // Contato que já existe: o perfil dele fica como está (pode ser mais novo que a cópia); só entra o exercício ou
      // alimento que falta aqui, para as fichas restauradas acharem o nome.
      for (const e of rc.customExercises ?? []) if (!exercicosDoContato.has(e.id)) await localRepo.saveCustomExercise(rc.profile.id, { ...e, custom: true });
      for (const f of rc.customFoods ?? []) if (!alimentosDoContato.has(f.id)) await localRepo.saveCustomFood(rc.profile.id, f);
    }
    const rodadasOmitidas: RodadaOmitida[] = [];
    // O perfil principal primeiro: as fichas dos alunos usam os exercícios próprios do personal.
    await restoreBundle(b, exportedAt, plano, rodadasOmitidas);
    for (const s of b.students ?? []) {
      await restoreBundle(s, exportedAt, plano, rodadasOmitidas, { managedBy: b.profile.id });
      localRepo.linkDirect(b.profile.id, s.profile.id, now);
    }
    if (rc && contato !== "manter" && b.profile.remoteCoach?.id === rc.profile.id) localRepo.linkDirect(rc.profile.id, b.profile.id, now);
    // Mescla com o registro de envio do aparelho (`mesclarChaveDeEnvio`): uma cópia mais antiga nunca desfaz um "Já enviei",
    // um toque de envio ou o envio da ficha feitos aqui depois dela (o plano diz que o aparelho "fica como está").
    for (const [k, v] of Object.entries(b.sent ?? {})) if (SENT_KEY_RE.test(k)) localStorage.setItem(k, mesclarChaveDeEnvio(k, localStorage.getItem(k), v));
    // Rodadas apagadas no aparelho de onde a cópia saiu: o link antigo do WhatsApp avisa também aqui.
    restoreApagadas(b.apagadas);
    // O conteúdo restaurado já tem cópia: o lembrete conta a partir da data do arquivo (conferido: só avança).
    if (b.exportedAt && Number.isFinite(Date.parse(b.exportedAt))) {
      const alvo = new Date(Math.min(Date.parse(b.exportedAt), Date.now())).toISOString();
      markBackupDone(alvo);
      const gravada = lastBackupAt();
      if (!gravada || Date.parse(gravada) < Date.parse(alvo)) throw new DataError(TEXTO_COTA_LOCAL, "limit");
    }
    return { profile: b.profile, students: b.students?.length ?? 0, plano, rodadasOmitidas };
  });
}
