/**
 * Quando pedir ao service worker que guarde as telas principais ("warm") e o que mandar para ele guardar a tela aberta
 * ("guardar-esta"). Rodada M, RM-01 e RM-04.
 *
 * Puro: quem chama passa a hora, a rede, a página e os recursos. Os temporizadores, o `requestIdleCallback` e o
 * `postMessage` ficam no `PwaRegister` (`components/pwa.tsx`). Entra no pacote de todas as telas, como o pwa.tsx: não
 * importa nada em tempo de execução além de `questionario-base.ts`, que também não importa nada.
 *
 * Por que esperar: com o aquecimento no load, as 14 telas (~345 KB) disputavam a banda com o toque seguinte da aluna.
 * Em /abrir, "Começar treino" ficava clicável em 4,70 s; sem o aquecimento, em 1,85 s (MEDIDO, Android médio + SW).
 */
import { deveAquecer, ehPaginaQuestionario } from "./questionario-base";

/** (b) Sem navegação interna, aquece este tempo depois do load. */
export const AQUECER_SEM_NAVEGACAO_MS = 20_000;
/** (a) Depois da primeira navegação interna: espera o navegador ficar ocioso, no máximo este tempo... */
export const OCIOSO_LIMITE_MS = 3_000;
/** ... e mais este tempo, para o toque seguinte (ex.: "Começar treino") não disputar banda com o aquecimento. */
export const AQUECER_DEPOIS_DA_NAVEGACAO_MS = 3_000;
/** Intervalo mínimo entre dois pedidos. O service worker confere só a primeira tela quando todas já estão guardadas. */
export const REAQUECER_A_CADA_MS = 6 * 3_600_000;
/** Teto de arquivos num pedido "guardar-esta" (o cache de arquivos do SW guarda até 320). */
export const GUARDAR_ESTA_MAX_ARQUIVOS = 200;
/**
 * Entrada que o service worker grava em sr-pages no fim de um aquecimento completo (sw.js, `MARCA_DO_AQUECIMENTO`).
 * O app só lê se ela existe: sem ela, o último pedido não terminou (o sistema encerrou o SW no meio) e não trava 6 h.
 */
export const MARCA_DO_AQUECIMENTO = "/hoje?aquecimento";

// ---- Gatilhos ------------------------------------------------------------------------------------------------------

/** O que fez o aquecimento ser pedido. */
export type Gatilho = "navegacao" | "sem-navegacao" | "oculta";

/**
 * - `esperando`: nenhuma navegação interna terminou ainda;
 * - `navegou`: a primeira terminou, e a espera por ocioso + 3 s está correndo;
 * - `pedido`: um gatilho já disparou nesta página (só um por carregamento).
 */
export type FaseAquecimento = "esperando" | "navegou" | "pedido";

export type EventoAquecimento =
  /** A primeira (ou outra) navegação interna terminou: o pathname mudou. */
  | "navegacao-terminada"
  /** Passou o ocioso (requestIdleCallback com limite de 3 s) e mais 3 s, depois da primeira navegação. */
  | "ocioso-depois-da-navegacao"
  /** 20 s depois do load. */
  | "tempo-sem-navegacao"
  /** `visibilitychange` com a página oculta. */
  | "pagina-oculta";

export interface PassoAquecimento {
  fase: FaseAquecimento;
  /** Começar a espera por ocioso + 3 s (só na primeira navegação). */
  esperarOcioso: boolean;
  /** Pedir o aquecimento agora, por este motivo. null = nada a pedir. */
  gatilho: Gatilho | null;
}

/**
 * Vale o que vier primeiro: (a) primeira navegação interna terminada + ocioso + 3 s; (b) 20 s depois do load sem
 * navegação; (c) página oculta. A página oculta pede na hora, sem esperar ocioso: o sistema pode congelar ou descartar
 * a aba logo depois, e a aluna não está tocando em nada. Depois de um pedido, mais nada nesta página.
 */
export function proximoPasso(fase: FaseAquecimento, evento: EventoAquecimento): PassoAquecimento {
  const nada = (f: FaseAquecimento): PassoAquecimento => ({ fase: f, esperarOcioso: false, gatilho: null });
  if (fase === "pedido") return nada("pedido");
  switch (evento) {
    case "pagina-oculta":
      return { fase: "pedido", esperarOcioso: false, gatilho: "oculta" };
    case "navegacao-terminada":
      // Só a primeira navegação conta: as seguintes não reiniciam a espera.
      return fase === "esperando" ? { fase: "navegou", esperarOcioso: true, gatilho: null } : nada(fase);
    case "ocioso-depois-da-navegacao":
      return fase === "navegou" ? { fase: "pedido", esperarOcioso: false, gatilho: "navegacao" } : nada(fase);
    case "tempo-sem-navegacao":
      // Houve navegação: quem decide é a espera de (a), que já está correndo.
      return fase === "esperando" ? { fase: "pedido", esperarOcioso: false, gatilho: "sem-navegacao" } : nada(fase);
  }
}

// ---- Condições -----------------------------------------------------------------------------------------------------

/** `navigator.connection` (Chrome e Android; o Safari não tem). Ausente = sem informação, não bloqueia. */
export interface ConexaoDoAparelho {
  saveData?: boolean;
  effectiveType?: string;
}

export interface SituacaoAquecimento {
  agora: number;
  /** Hora do último pedido (`sr:sw-warm`). 0, NaN ou ilegível = nunca. */
  ultimoAquecimento: number;
  /**
   * A marca do último aquecimento completo está no cache (`MARCA_DO_AQUECIMENTO`)? false = o último pedido não terminou
   * (ou o cache foi apagado), e ele não trava 6 h. null ou ausente = não deu para ler, e vale a trava de sempre.
   */
  aquecimentoCompleto?: boolean | null;
  online: boolean;
  conexao?: ConexaoDoAparelho | null;
  /** Página no momento do gatilho. O `#` fica no contrato de `deveAquecer`, mas não decide nada. */
  pagina: { pathname: string; hash: string };
  /**
   * Página do carregamento (a do load). O gatilho pode disparar em outra tela depois de uma navegação interna (ex.: o
   * aluno do link toca "Saiba mais" no questionário e vai para /privacidade): a regra do questionário vale para as duas.
   */
  paginaDoLoad?: { pathname: string; hash: string } | null;
  /**
   * Perfis do aparelho (`perfisDoAparelho`). Só são lidos quando a página do gatilho ou a do load é /questionario (a
   * lista de perfis do personal pode ser grande); null = não lidos, e aí conta como "sem perfil".
   */
  perfis: { temPerfil: boolean; temPerfilPersonal: boolean } | null;
}

export type BloqueioAquecimento =
  | "aquecido-ha-pouco"
  | "sem-rede"
  | "economia-de-dados"
  | "rede-2g"
  /** Aluno que só abriu o questionário: não baixa o app inteiro no plano de dados dele (spec §11.3). */
  | "questionario-sem-perfil";

/** Os perfis só são lidos onde decidem alguma coisa: na página do gatilho ou na do load, se uma delas for /questionario. */
export function precisaDosPerfis(...pathnames: Array<string | null | undefined>): boolean {
  return pathnames.some((p) => typeof p === "string" && ehPaginaQuestionario(p));
}

/**
 * Por que não aquecer agora; null = pode aquecer. Nunca com economia de dados ligada nem em rede 2g ou slow-2g (3g e
 * 4g aquecem). Relógio que voltou (último pedido no futuro) não trava o aquecimento até o relógio alcançar. Pedido
 * recente sem a marca do aquecimento completo não trava: o SW foi encerrado no meio (o iOS faz isso com o app em segundo
 * plano) e a próxima abertura retoma. O questionário sem perfil vale na página do gatilho e na do load.
 */
export function bloqueioDoAquecimento(s: SituacaoAquecimento): BloqueioAquecimento | null {
  const ultimo = Number.isFinite(s.ultimoAquecimento) ? s.ultimoAquecimento : 0;
  const recente = ultimo > 0 && ultimo <= s.agora && s.agora - ultimo < REAQUECER_A_CADA_MS;
  if (recente && s.aquecimentoCompleto !== false) return "aquecido-ha-pouco";
  if (!s.online) return "sem-rede";
  if (s.conexao?.saveData === true) return "economia-de-dados";
  const tipo = typeof s.conexao?.effectiveType === "string" ? s.conexao.effectiveType.toLowerCase() : "";
  if (tipo === "2g" || tipo === "slow-2g") return "rede-2g";
  const perfis = s.perfis ?? { temPerfil: false, temPerfilPersonal: false };
  for (const pagina of [s.pagina, s.paginaDoLoad]) {
    if (pagina && !deveAquecer({ pathname: pagina.pathname, hash: pagina.hash, ...perfis })) return "questionario-sem-perfil";
  }
  return null;
}

// ---- Guardar a tela aberta (RM-04) ---------------------------------------------------------------------------------

export interface PedidoGuardarEsta {
  tipo: "guardar-esta";
  /** Só o caminho: a busca e o `#` (que traz os dados do link) nunca vão para o service worker. */
  path: string;
  /** Arquivos do build e fontes que a página já baixou, de mesma origem, sem repetição. */
  assets: string[];
}

/**
 * Mensagem para o service worker guardar a tela aberta já no primeiro carregamento, que não passa por ele (o SW é
 * registrado no load). `recursos` são os nomes de `performance.getEntriesByType("resource")`. Ficam só os de mesma
 * origem em `/_next/static/` ou terminados em `.woff2`, sem o `#`. Saem do cache HTTP (immutable), sem rede.
 */
export function pedidoGuardarEsta(pathname: string, recursos: readonly string[], origem: string): PedidoGuardarEsta {
  const assets = new Set<string>();
  for (const nome of recursos) {
    if (assets.size >= GUARDAR_ESTA_MAX_ARQUIVOS) break;
    let u: URL;
    try {
      u = new URL(nome, origem);
    } catch {
      continue;
    }
    if (u.origin !== origem) continue;
    if (!u.pathname.startsWith("/_next/static/") && !u.pathname.endsWith(".woff2")) continue;
    assets.add(u.pathname + u.search);
  }
  return { tipo: "guardar-esta", path: pathname, assets: [...assets] };
}
