/**
 * Próximos passos do aluno (spec §7), pura. Entrega 1: passos 1 a 8 e o 11 (`dieta`, com a regra da D-18 e a
 * decisão do dono: quem encaminha ao nutricionista ou tem parceiro perde só o PASSO, nunca a aba Dieta).
 * Respostas só por `readAnamnese`; com problema de leitura, nenhum passo que dependa das respostas.
 */
import type { AcaoPasso, AlertId, Anamnese, Passo, WorkStyle } from "./anamnese-types";
import { ehExemplo } from "./anamnese-types";
import { algumSimParq, fmtDiaMes, gatilhoNutricionista, idadeDe, primeiroNome } from "./anamnese";
import type { FichaDelivery } from "./delivery";
import { readAnamnese } from "./questionario-link";
import { mensagemAvisar, travaEPorta } from "./triagem";
import type { Profile, Program } from "./types";
import { resolveDefaults } from "./work-style";

export interface PassosInput {
  profile: Profile;
  ws?: WorkStyle;
  activeProgram: Pick<Program, "id" | "durationWeeks" | "createdAt" | "updatedAt"> | null;
  /**
   * Situação do envio da ficha ativa e da dieta (registro único `sr:sent:{aluno}:ficha`, lido por `useFichaDelivery`
   * de src/lib/use-ficha-link.ts). Substitui o `program.sharedAt` da spec (DECISIONS 2026-11-23, "Um registro só do
   * envio da ficha"): o passo `enviar_ficha` fecha com `program.kind` "enviado" ou "confirmado". null = sem leitura
   * (nuvem, aluno de exemplo ou carregando): o passo não afirma que a ficha não foi.
   */
  envioFicha: FichaDelivery | null;
  metricsCount: number;
  hasDiet: boolean;
  mode: "local" | "supabase";
  hoje: Date;
  fichaSugeridaResumo?: string;
  conferirN?: number;
}

/**
 * Laranjas que não pedem liberação médica: têm passo próprio (triagem pessoalmente; completar o questionário).
 * Exportado para o selo da lista (anamnese-perfil.ts) usar a mesma regra do passo `liberacao`.
 */
export const SEM_LIBERACAO_MEDICA: readonly AlertId[] = ["A-SEM-TRIAGEM", "A-PARQ-INCOMPLETO"];

const DIA = 86_400_000;
/** Dias de calendário (no fuso do aparelho) entre duas datas. */
function diasEntre(deIso: string, ate: Date): number {
  const de = new Date(deIso);
  if (Number.isNaN(de.getTime())) return 0;
  const a = Date.UTC(de.getFullYear(), de.getMonth(), de.getDate());
  const b = Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate());
  return Math.round((b - a) / DIA);
}

function leitura(p: Profile): { an: Anamnese | null; problema: "versao_nova" | "invalida" | null } {
  const r = readAnamnese(p);
  if (r === "versao_nova" || r === "invalida") return { an: null, problema: r };
  return { an: r, problema: null };
}

/** Pedido pelo WhatsApp sem resposta mais nova que ele (a regra do passo `questionario`, do selo e do lembrete). */
export function pedidoPendente(p: Profile, an: Anamnese | null): boolean {
  const pedido = p.anamnesePedido;
  if (!pedido) return false;
  if (!an) return true;
  if (an.id === pedido.id) return false;
  const resp = Date.parse(an.answeredAt);
  const ped = Date.parse(pedido.at);
  return !(Number.isFinite(resp) && Number.isFinite(ped) && resp > ped);
}

/** Pedido há ≥ 2 dias sem resposta ("Lembrar {aluno}"). */
export function lembreteDevido(p: Profile, hoje: Date): boolean {
  if (!p.anamnesePedido) return false;
  return pedidoPendente(p, leitura(p).an) && diasEntre(p.anamnesePedido.at, hoje) >= 2;
}

export function nextSteps(i: PassosInput): Passo[] {
  const p = i.profile;
  const id = encodeURIComponent(p.id);
  const aluno = primeiroNome(p.name) || "o aluno";
  const { an, problema } = leitura(p);
  const passos: Passo[] = [];
  const feito = (s: keyof NonNullable<Profile["passosFeitos"]>) => !!p.passosFeitos?.[s];
  const preencher: AcaoPasso = { tipo: "href", rotulo: `Preencher com ${aluno}`, href: `/questionario?aluno=${id}` };

  // 1. Liberação: vermelho ou laranja aberto (laranja também sem "Seguir mesmo assim").
  if (an) {
    const { trava, porta } = travaEPorta(an, { hoje: i.hoje, liberacoes: p.liberacoes ?? [] });
    const abertos = [...trava, ...porta].filter((x) => !SEM_LIBERACAO_MEDICA.includes(x.id));
    if (abertos.length)
      passos.push({
        id: "liberacao",
        titulo: `Pedir liberação médica a ${aluno}`,
        acoes: [
          { tipo: "liberacao", rotulo: "Registrar liberação" },
          { tipo: "avisar", rotulo: `Avisar ${aluno}`, texto: mensagemAvisar(abertos, aluno) },
        ],
        clinico: true,
      });
  }

  // 2. Triagem pessoalmente: enviado sem dados de saúde. ([E2] o href ganha "&re=saude".)
  if (an?.healthOmitted)
    passos.push({
      id: "triagem_presencial",
      titulo: "Fazer a triagem de saúde pessoalmente",
      acoes: [{ tipo: "href", rotulo: `Preencher a saúde com ${aluno}`, href: `/questionario?aluno=${id}` }],
      clinico: true,
    });

  // 3. Questionário: pedido pendente > incompleto > sem questionário (com "versao_nova", nada a pedir: é atualizar o app).
  if (problema !== "versao_nova") {
    if (pedidoPendente(p, an) && p.anamnesePedido) {
      const acoes: AcaoPasso[] = lembreteDevido(p, i.hoje) ? [{ tipo: "pedir", rotulo: `Lembrar ${aluno}`, lembrete: true }, preencher] : [preencher];
      passos.push({ id: "questionario", titulo: `Questionário pedido em ${fmtDiaMes(p.anamnesePedido.at)} · ainda sem resposta`, acoes, clinico: false });
    } else if (an && an.incompleto?.length) {
      passos.push({ id: "questionario", titulo: "Completar o questionário", acoes: [{ tipo: "href", rotulo: "Continuar", href: `/questionario?aluno=${id}` }], clinico: false });
    } else if (!an) {
      const mandar: AcaoPasso = { tipo: "pedir", rotulo: "Mandar pelo WhatsApp" };
      const whatsapp = resolveDefaults(i.ws, { hasPhone: !!p.phone }).modoPadrao === "whatsapp";
      passos.push({ id: "questionario", titulo: "Fazer o questionário inicial", acoes: whatsapp ? [mandar, preencher] : [preencher, mandar], clinico: false });
    }
  }

  // 4. Termo do PAR-Q: algum "Sim", sem termo e idade ≥ 15 (idade desconhecida: pede, por cautela).
  if (an && !an.healthOmitted && algumSimParq(an.a) && !an.termo) {
    const idade = idadeDe(an.a, i.hoje);
    if (idade === null || idade >= 15)
      passos.push({ id: "termo", titulo: "Pegar a assinatura do termo do PAR-Q", acoes: [{ tipo: "termo", rotulo: "Abrir o termo" }], clinico: true });
  }

  // 5. Nutricionista (clínico): gatilho e não tem nutricionista.
  const gatilho = !!an && gatilhoNutricionista(an);
  if (an && gatilho && an.a.nutri !== "sim" && !feito("nutricionista_clinico"))
    passos.push({
      id: "nutricionista_clinico",
      titulo: `Encaminhar ${aluno} para nutricionista`,
      sub: "Plano alimentar para condição de saúde é atividade do nutricionista.",
      acoes: [{ tipo: "feito", rotulo: "Feito" }],
      clinico: true,
    });

  // 6. Gerar ficha: sem ficha ativa.
  if (!i.activeProgram) {
    if (an)
      passos.push({
        id: "gerar_ficha",
        titulo: "Gerar ficha com estas respostas",
        ...(i.fichaSugeridaResumo ? { sub: i.fichaSugeridaResumo } : {}),
        acoes: [{ tipo: "href", rotulo: "Gerar", href: `/alunos/${id}/ficha/nova?auto=1` }],
        clinico: false,
      });
    else
      passos.push({
        id: "gerar_ficha",
        titulo: `Montar a ficha de ${aluno}`,
        sub: "Gere uma base pelo perfil ou monte do zero.",
        acoes: [{ tipo: "href", rotulo: "Montar", href: `/alunos/${id}/ficha/nova` }],
        clinico: false,
      });
  }

  // 7. Enviar a ficha: só com leitura do registro de envio e fato de que esta versão não foi (nunca por suposição).
  const situacao = i.envioFicha?.program.kind;
  if (i.activeProgram && i.mode === "local" && !ehExemplo(p) && (situacao === "nao_enviado" || situacao === "mudou"))
    passos.push({ id: "enviar_ficha", titulo: `Enviar a ficha para o celular de ${aluno}`, acoes: [{ tipo: "enviar_ficha", rotulo: "Enviar" }], clinico: false });

  // 8. Avaliação: sem medidas.
  if (i.metricsCount === 0) {
    const pedirMedidas = i.ws?.atendimento === "online" || i.ws?.atendimento === "turmas";
    const n = i.conferirN ?? 0;
    passos.push({
      id: "avaliacao",
      titulo: pedirMedidas ? `Pedir peso e medidas a ${aluno}` : "Fazer a avaliação presencial",
      ...(n > 0 ? { sub: `Na primeira aula, confira também ${n} ${n === 1 ? "item" : "itens"} do questionário.` } : {}),
      acoes: [{ tipo: "aba", rotulo: "Registrar medidas", aba: "evolucao" }],
      clinico: false,
    });
  }

  // 11. Dieta: sem dieta, sem gatilho clínico e alimentação "orientações" ou sem resposta (D-18).
  const alimentacao = i.ws?.alimentacao;
  if (!i.hasDiet && !problema && !gatilho && (alimentacao === undefined || alimentacao === "orientacoes"))
    passos.push({
      id: "dieta",
      titulo: "Definir metas e orientações de dieta",
      sub: "Calorias, proteína e um cardápio base.",
      acoes: [{ tipo: "aba", rotulo: "Abrir a dieta", aba: "dieta" }],
      clinico: false,
    });

  return passos;
}

/** [E2] Linha fixa "Próxima reavaliação: 21/12 (seu padrão: 6 semanas)". Não implementar na Entrega 1. */
export function proximaReavaliacao(i: PassosInput): string | null {
  return null;
}
