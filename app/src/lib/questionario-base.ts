/**
 * Partes do questionário que NÃO dependem do catálogo de perguntas (track D). Entram no pacote de todas as telas
 * (`instrumentation-client.ts`, `pwa.tsx` e, pelo `questionario-client.ts`, `local.ts`), por isso este arquivo não
 * importa nada em tempo de execução: o catálogo (`domain/anamnese.ts`) só pode ir para o pacote de /questionario
 * (spec, track D, item 13). Puro: quem chama passa a página e o armazenamento.
 *
 * Reexportado por `questionario-flow.ts`, que é o endereço destas funções no contrato do track D.
 */
import type { Rascunho } from "./questionario-client";

const DIA = 86_400_000;
/** Rascunho sem edição há mais que isto é apagado (spec §5.7 e §11.2). */
export const RASCUNHO_DIAS_SEM_EDICAO = 30;
/** Rascunho com toque em Enviar e sem "Sim, enviei" há mais que isto é apagado (spec §5.7). */
export const RASCUNHO_DIAS_DEPOIS_DO_ENVIO = 7;

/**
 * O rascunho venceu? 30 dias sem edição ou 7 dias depois do toque em Enviar. `at` ilegível conta como vencido (não
 * dá para saber a idade, e o rascunho pode ter saúde); `enviarTocadoEm` ilegível é ignorado (vale só o prazo de 30 dias).
 */
export function rascunhoVencido(r: Pick<Rascunho, "at" | "enviarTocadoEm">, agora: Date): boolean {
  const t = agora.getTime();
  const editado = typeof r.at === "string" ? Date.parse(r.at) : NaN;
  if (!Number.isFinite(editado) || t - editado > RASCUNHO_DIAS_SEM_EDICAO * DIA) return true;
  const tocado = typeof r.enviarTocadoEm === "string" ? Date.parse(r.enviarTocadoEm) : NaN;
  return Number.isFinite(tocado) && t - tocado > RASCUNHO_DIAS_DEPOIS_DO_ENVIO * DIA;
}

// ---- Página: medição (PostHog) e service worker ----------------------------------------------------------------------

export interface LocalPagina {
  pathname: string;
  /**
   * Fica no contrato, mas não decide nada: /questionario lê o `#d=` uma vez e limpa a barra (`history.replaceState`)
   * antes dos efeitos do layout rodarem, e o aluno que recarrega para continuar o rascunho chega sem `#d=`. O que
   * separa o aluno do personal é o perfil de personal no aparelho (o modo junto exige esse perfil).
   */
  hash: string;
  temPerfilPersonal: boolean;
  /** Persistência escolhida na abertura (o PostHog não troca depois do init). Ausente = calcula pela página. */
  persistencia?: "memory" | "localStorage";
}

/** /questionario (com ou sem a barra final; a busca e o `#` não fazem parte do `pathname`). */
export function ehPaginaQuestionario(pathname: string): boolean {
  return /^\/questionario\/?$/.test(pathname);
}

/** Telas que abrem respostas de questionário: erros não tratados delas saem sem o valor (spec §11.3). */
function ehTelaDeRespostas(pathname: string): boolean {
  return /^\/(?:questionario|receber)\/?$/.test(pathname);
}

/**
 * Onde o PostHog guarda o id anônimo. "memory" em /questionario sem perfil de personal no aparelho: o aluno do link não
 * aceitou os termos do app, então nada da medição fica no celular dele (spec §11.3, D-29, DECISIONS entrada 14). No
 * resto, "localStorage", inclusive o personal no modo junto (mantém o `distinct_id`).
 *
 * A spec pede "/questionario com `#d=`"; aqui o `#d=` não é exigido (ver `LocalPagina.hash`): sem ele, a página é a
 * mesma do aluno recarregada ou um beco sem saída, e a regra nunca fica menos reservada que a da spec.
 */
export function persistenciaPosthog(l: LocalPagina): "memory" | "localStorage" {
  return ehPaginaQuestionario(l.pathname) && !l.temPerfilPersonal ? "memory" : "localStorage";
}

/** Código nosso (`new Error("rascunho_invalido")`): letras minúsculas, números e "_", sem espaço nem valor. */
const CODIGO = /^[a-z][a-z0-9_]{0,39}$/;
const ehCodigo = (v: unknown): v is string => typeof v === "string" && CODIGO.test(v);
/** Nome do tipo do erro ("TypeError", "ZodError"); qualquer outra coisa vira "Error". */
const TIPO = /^[A-Za-z_$][\w$.]{0,60}$/;
const semFragmento = (v: unknown) => (typeof v === "string" ? v.replace(/#.*$/, "") : v);

function limparQuadro(f: unknown): unknown {
  if (!f || typeof f !== "object") return f;
  const q = { ...(f as Record<string, unknown>) };
  for (const k of ["filename", "abs_path", "source"]) if (k in q) q[k] = semFragmento(q[k]);
  return q;
}

/** Um item de `$exception_list`: fica o tipo, o mecanismo e a pilha (sem o `#` dos endereços); o valor só se for código. */
function limparExcecao(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const out = { ...(item as Record<string, unknown>) };
  if (!ehCodigo(out.value)) delete out.value;
  if (typeof out.type !== "string" || !TIPO.test(out.type)) out.type = "Error";
  const pilha = out.stacktrace as { frames?: unknown } | undefined;
  if (pilha && typeof pilha === "object" && Array.isArray(pilha.frames)) out.stacktrace = { ...pilha, frames: pilha.frames.map(limparQuadro) };
  return out;
}

/**
 * Última passada no `before_send` (depois da limpeza de URL e de `href` que já existe em `instrumentation-client.ts`).
 * - Na página do aluno do link (persistência "memory"): tira o IP (`$ip: null`, e `$geoip_disable` para não gravar
 *   cidade). HIPÓTESE sobre o mecanismo: a ingestão do PostHog só preenche `$ip` quando a chave não veio no evento;
 *   conferir na documentação e ligar também "Discard client IP data" no projeto (spec §11.3).
 * - Exceções (`$exception`) em /questionario e /receber: fica só o tipo e o código; sai o valor (mensagem do erro, que
 *   pode trazer trecho do texto lido), os passos registrados antes do erro e o `#` dos endereços da pilha.
 * Nas outras telas e eventos, devolve o próprio evento. Não altera o objeto recebido.
 */
export function limparEventoPosthog<T extends { event: string; properties?: Record<string, unknown> }>(ev: T, l: LocalPagina): T {
  const memoria = (l.persistencia ?? persistenciaPosthog(l)) === "memory";
  const excecao = ev.event === "$exception" && ehTelaDeRespostas(l.pathname);
  if (!memoria && !excecao) return ev;
  const props: Record<string, unknown> = { ...(ev.properties ?? {}) };
  if (memoria) {
    props.$ip = null;
    props.$geoip_disable = true;
  }
  if (excecao) {
    if (Array.isArray(props.$exception_list)) props.$exception_list = props.$exception_list.map(limparExcecao);
    if ("$exception_message" in props && !ehCodigo(props.$exception_message)) delete props.$exception_message;
    if ("$exception_type" in props && (typeof props.$exception_type !== "string" || !TIPO.test(props.$exception_type))) props.$exception_type = "Error";
    if (Array.isArray(props.$exception_values)) props.$exception_values = props.$exception_values.filter(ehCodigo);
    if ("$exception_source" in props) props.$exception_source = semFragmento(props.$exception_source);
    delete props.$exception_steps;
  }
  return { ...ev, properties: props };
}

/**
 * Pedir ao service worker que guarde as telas principais (`warm`)? Não em /questionario sem nenhum perfil local: o aluno
 * que só respondeu não baixa o app inteiro no plano de dados dele (spec §11.3; FATO sw.js:93, pwa.tsx:97). Como em
 * `persistenciaPosthog`, o `#d=` não é exigido: o efeito do `PwaRegister` roda depois de a página limpar a barra.
 */
export function deveAquecer(l: LocalPagina & { temPerfil: boolean }): boolean {
  return !(ehPaginaQuestionario(l.pathname) && !l.temPerfil);
}

type Leitor = Pick<Storage, "getItem">;

function lerJson(ls: Leitor, chave: string): unknown {
  try {
    const raw = ls.getItem(chave);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Perfis guardados neste aparelho, sem ler respostas: `temPerfil` = algum perfil local (ou a cópia da conta na nuvem);
 * `temPerfilPersonal` = a sessão do aparelho é de um personal (`sr:session`, ou `sr:return` no "Ver como aluno", ou a
 * conta da nuvem com papel de personal). Leitura bloqueada ou dado danificado contam como "sem perfil". Ler só em
 * /questionario: a lista de perfis do personal pode ser grande.
 */
export function perfisDoAparelho(ls: Leitor | null): { temPerfil: boolean; temPerfilPersonal: boolean } {
  if (!ls) return { temPerfil: false, temPerfilPersonal: false };
  const lista = lerJson(ls, "sr:v1:profiles");
  const perfis = Array.isArray(lista) ? lista.filter((p): p is { id?: unknown; role?: unknown } => !!p && typeof p === "object") : [];
  const nuvem = lerJson(ls, "sr:cloud:me") as { role?: unknown } | null;
  let sessao: string | null = null;
  let volta: string | null = null;
  try {
    sessao = ls.getItem("sr:session");
    volta = ls.getItem("sr:return");
  } catch {}
  const doAparelho = perfis.some((p) => p.role === "coach" && typeof p.id === "string" && (p.id === sessao || p.id === volta));
  return {
    temPerfil: perfis.length > 0 || (!!nuvem && typeof nuvem === "object"),
    temPerfilPersonal: doAparelho || (!!nuvem && typeof nuvem === "object" && nuvem.role === "coach"),
  };
}
