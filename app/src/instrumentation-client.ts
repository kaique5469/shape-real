import posthog from "posthog-js";
import { ehPaginaQuestionario, limparEventoPosthog, perfisDoAparelho, persistenciaPosthog, type LocalPagina } from "@/lib/questionario-base";

/**
 * Analytics e captura de erros no navegador (PostHog), ligado antes de o app ficar interativo.
 * Privacidade: nenhum texto da tela é enviado (nomes de alunos, medidas e dieta ficam no aparelho),
 * a gravação de sessão fica desligada e o código do link de teste é removido das URLs.
 * Sem a variável de ambiente, nada é enviado.
 */
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;

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
 * Página da abertura (o init roda antes de /questionario limpar o `#d=` da barra). Os perfis do aparelho só são lidos em
 * /questionario: lá o aluno do link fica com o PostHog em memória e sem IP (spec §11.3, DECISIONS entrada 14).
 */
function paginaDaAbertura(): LocalPagina {
  const { pathname, hash } = window.location;
  let temPerfilPersonal = false;
  if (ehPaginaQuestionario(pathname)) {
    try {
      temPerfilPersonal = perfisDoAparelho(localStorage).temPerfilPersonal;
    } catch {}
  }
  return { pathname, hash, temPerfilPersonal };
}

if (token) {
  const abertura = paginaDaAbertura();
  const persistence = persistenciaPosthog(abertura);
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
} else if (process.env.NODE_ENV !== "production") {
  console.error(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
  );
}
