import posthog, { type PostHog } from "posthog-js";
import { anexarPosthog, type ErroCedo, type InicioDaPagina } from "@/lib/analytics";
import { limparEventoPosthog, type LocalPagina } from "@/lib/questionario-base";

/**
 * Liga o PostHog. Este módulo (e o posthog-js, ~120 KB gzip) não entra no primeiro carregamento:
 * src/instrumentation-client.ts o pede 3 s depois do `load`, quando o navegador fica ocioso (rodada M, RM-03).
 * Privacidade, igual a antes: nenhum texto da tela é enviado (nomes de alunos, medidas e dieta ficam no aparelho), a
 * gravação de sessão fica desligada e o código do link de teste e o `#` saem das URLs. O init abaixo é o mesmo que
 * ficava em instrumentation-client.ts (11de1ab), linha por linha; só a persistência e a página da abertura chegam por
 * parâmetro, decididas lá na abertura.
 */

/** Tira da URL o código do link de teste (`?k=`), que não deve sair do aparelho. */
/**
 * Tira da URL o que não pode ir para a medição: a chave do link de teste (?k=) e tudo depois do "#",
 * onde viajam a ficha, a dieta e os treinos enviados por link entre personal e aluno.
 */
function cleanUrl(value: unknown): unknown {
  if (typeof value !== "string" || !/[?&]k=|#/.test(value)) return value;
  try {
    const url = new URL(value, window.location.origin);
    url.searchParams.delete("k");
    url.hash = "";
    return /^https?:/i.test(value) ? url.toString() : `${url.pathname}${url.search}`;
  } catch {
    return value.replace(/#.*$/, "").replace(/([?&])k=[^&#]*/g, "$1");
  }
}

function cleanBag(bag: Record<string, unknown> | undefined) {
  if (!bag) return;
  for (const key of Object.keys(bag)) if (/url|referrer|href/i.test(key)) bag[key] = cleanUrl(bag[key]);
}

/**
 * Cliques nunca levam o destino do link: os links do WhatsApp (wa.me/<telefone>?text=...) carregam o telefone,
 * o nome do aluno e a ficha inteira codificada (%23d%3D...), que cleanUrl não reconhece. A configuração já não
 * captura href; isto é a segunda trava, caso o SDK mude.
 */
function stripLinkTargets(props: Record<string, unknown> | undefined) {
  if (!props) return;
  delete props.$external_click_url;
  if (typeof props.$elements_chain === "string") props.$elements_chain = props.$elements_chain.replace(/(?:attr__)?href="[^"]*"/g, "");
  if (Array.isArray(props.$elements)) for (const el of props.$elements) if (el && typeof el === "object") delete (el as Record<string, unknown>).attr__href;
}

/**
 * A $pageview da abertura sai por anexarPosthog, com a URL e o horário de quando a página abriu. A do próprio SDK, que
 * ele dispara logo depois do init como `capture("$pageview", { title }, { send_instantly: true })`, levaria a URL e a
 * hora do init (3 s ou mais depois do load, às vezes depois de um redirecionamento): só essa chamada é descartada, uma
 * vez, e o `capture` volta a ser o do SDK. As $pageview de navegação (`navigation_type`) e as nossas passam direto.
 * A trava interna do SDK não serve: o nome dela é encurtado no pacote publicado.
 */
function semPageviewDoInit(ph: PostHog) {
  const original = ph.capture;
  ph.capture = function (this: PostHog, ...args: Parameters<PostHog["capture"]>) {
    const [evento, props, opcoes] = args;
    if (evento === "$pageview" && opcoes?.send_instantly === true && props && Object.keys(props).join() === "title") {
      ph.capture = original;
      return undefined;
    }
    return original.apply(this, args);
  };
}

/**
 * `abertura` e `persistence`: decididas na avaliação de instrumentation-client.ts, antes de /questionario limpar o
 * `#d=` ("memory" para o aluno do link). `inicio` e `cedo`: a página da abertura e os erros de antes do SDK, que
 * analytics.ts manda primeiro, com o horário e a página de quando aconteceram.
 *
 * Devolve como mandar um erro não tratado da página atual enquanto a captura automática do SDK não chega (ela vem num
 * arquivo à parte, depois do init): instrumentation-client.ts usa até ela embrulhar o `window.onerror`.
 */
export function iniciarPosthog(token: string, abertura: LocalPagina, persistence: "memory" | "localStorage", inicio: InicioDaPagina, cedo: readonly ErroCedo[]): (erro: unknown) => void {
  posthog.init(token, {
    // Passa pelo próprio domínio (ver rewrites em next.config.ts) para bloqueadores não derrubarem os eventos.
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? "https://us.posthog.com",
    defaults: "2026-08-30",
    capture_exceptions: true,
    person_profiles: "identified_only",
    // "memory" em /questionario sem perfil de personal (o aluno do link); "localStorage" no resto, inclusive o junto.
    persistence,
    disable_session_recording: true,
    // Cliques entram na análise, mas sem o texto nem os rótulos dos elementos (podem conter nomes de alunos).
    mask_all_text: true,
    // Nenhum atributo de elemento (inclusive href: links do WhatsApp levam telefone, mensagem e a ficha codificada).
    mask_all_element_attributes: true,
    autocapture: { element_attribute_ignorelist: ["href", "aria-label", "title", "placeholder", "alt", "value", "name"] },
    before_send: (event) => {
      if (!event) return event;
      const props = event.properties as Record<string, unknown> | undefined;
      stripLinkTargets(props);
      cleanBag(props);
      cleanBag(props?.$set as Record<string, unknown> | undefined);
      cleanBag(props?.$set_once as Record<string, unknown> | undefined);
      cleanBag(event.$set as Record<string, unknown> | undefined);
      cleanBag(event.$set_once as Record<string, unknown> | undefined);
      // Aluno do link: sem IP. Exceções em /questionario e /receber: só o tipo e o código (spec §11.3).
      const { pathname, hash } = window.location;
      return limparEventoPosthog(event, { pathname, hash, temPerfilPersonal: abertura.temPerfilPersonal, persistencia: persistence });
    },
  });
  semPageviewDoInit(posthog);
  anexarPosthog(posthog, inicio, cedo);
  return (erro) => {
    try {
      posthog.captureException(erro instanceof Error ? erro : new Error(String(erro)), { handled: false });
    } catch {
      /* a medição nunca quebra o app */
    }
  };
}
