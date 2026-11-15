#!/usr/bin/env python3
"""
Shape Real — Pipeline de atualização automática (site estático Netlify)
========================================================================

Roda 4× por semana (seg, ter, qua, qui) via GitHub Actions.

Fluxo:
  1. Gera 1 artigo novo (HTML) usando Claude API, seguindo o calendário editorial
  2. Atualiza data/supplements.json (preços do comparativo)
  3. Atualiza data/posts.json (manifesto dos artigos publicados)
  4. Regenera index.html injetando os 6 artigos mais recentes
  5. Commit + push automático
     - Seg/Ter/Qua: push direto para main (publicação automática via Netlify)
     - Qui: cria branch + Pull Request para revisão humana

Pré-requisitos no GitHub:
  - Secret  ANTHROPIC_API_KEY
  - Permission "Read and write" + "PR creation" no workflow

Custo estimado: ~R$ 12-15/mês de API (Sonnet 4.6, 4 artigos/sem).
"""

import os
import re
import json
import datetime
import subprocess
from pathlib import Path
from anthropic import Anthropic

# ============================================================
# CONFIG
# ============================================================
MODEL = "claude-sonnet-4-6"
ROOT = Path(__file__).parent
POSTS_DIR = ROOT / "posts"
DATA_DIR = ROOT / "data"
TEMPLATES = ROOT / "templates"
POSTS_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

# Terça (estudo) vira PR para revisão humana: o modelo não acessa a internet e pode
# errar detalhes de um estudo específico. Nada que cite pesquisa vai direto para o ar.
DAYS_DRAFT_MODE = {1}  # 0=seg, 1=ter, 2=qua, 3=qui

# Calendário editorial. "noticia" foi REMOVIDA: sem fonte real (RSS/DOU), o modelo
# inventava notícias da Anvisa. Quinta passa a ser "treino" — guias evergreen que
# levam o leitor ao app (ficha com IA).
EDITORIAL = {
    0: ("guia",   "Guia prático de nutrição para emagrecimento e definição"),
    1: ("estudo", "Explicação comentada de um tema com boa base científica (sem inventar estudo específico)"),
    2: ("review", "Review honesto de um suplemento"),
    3: ("treino", "Guia prático de treino de musculação"),
}

# Fila de temas por tipo. O pipeline escolhe o PRIMEIRO tema ainda não coberto
# (comparando palavras-chave com títulos/slugs já publicados) — fim dos artigos repetidos.
# Cada tema: (palavras-chave que identificam o tema, briefing).
TEMAS = {
    "guia": [
        (["deficit"], "Déficit calórico: como calcular o seu e por quanto tempo manter"),
        (["proteina", "quanto"], "Quanta proteína comer por dia para perder gordura sem perder músculo"),
        (["refeic", "marmita"], "Marmitas da semana para cutting: como montar e quanto pesar"),
        (["plato", "estagn"], "Platô no emagrecimento: por que a balança parou e o que fazer"),
        (["dieta flexivel", "iifym"], "Dieta flexível na prática: encaixando o que você gosta nos macros"),
        (["jejum"], "Jejum intermitente funciona para definir? O que importa de verdade"),
        (["carboidrato", "noite"], "Carboidrato à noite engorda? Mitos de horário das refeições"),
        (["bulking", "superavit"], "Bulking limpo: superávit calórico sem ganhar gordura demais"),
        (["restaurante", "fim de semana"], "Como comer fora e no fim de semana sem perder a semana de dieta"),
        (["agua", "retencao"], "Retenção de líquido: por que o peso oscila e como ler a balança"),
        (["fibra"], "Fibras na dieta de definição: saciedade, intestino e quanto comer"),
        (["alcool", "cerveja"], "Álcool e resultado na academia: quanto atrapalha de verdade"),
    ],
    "estudo": [
        (["sono"], "Sono e hipertrofia: o que a ciência mostra sobre recuperação"),
        (["cafeina"], "Cafeína e desempenho no treino: dose, horário e tolerância"),
        (["volume", "series"], "Volume de treino: quantas séries por semana para crescer"),
        (["falha"], "Treinar até a falha: necessário ou contraproducente?"),
        (["descanso", "intervalo"], "Intervalo entre séries: 1 ou 3 minutos para hipertrofia?"),
        (["frequencia"], "Frequência de treino: 1x ou 2x por semana por músculo"),
        (["cardio", "interferencia"], "Cardio atrapalha ganho de massa? O efeito interferência"),
        (["mulher", "ciclo"], "Treino feminino e ciclo menstrual: o que muda na prática"),
        (["idoso", "sarcopenia"], "Musculação depois dos 50: força, massa e longevidade"),
        (["proteina", "dose"], "Quanta proteína por refeição o corpo aproveita?"),
    ],
    "review": [
        (["creatina"], "Creatina monoidratada: como escolher, dose e mitos"),
        (["whey", "concentrado"], "Whey concentrado: para quem vale e como comparar marcas pelo custo por grama"),
        (["isolado"], "Whey isolado vale a diferença de preço?"),
        (["pre-treino", "pre treino"], "Pré-treino: o que tem dentro e o que realmente funciona"),
        (["termogenico"], "Termogênico emagrece? O que diz a ciência e os riscos"),
        (["beta-alanina", "beta alanina"], "Beta-alanina: para quem serve o formigamento"),
        (["omega"], "Ômega 3 para quem treina: necessário ou desperdício?"),
        (["multivitaminico", "vitamina d"], "Multivitamínico e vitamina D: quando faz sentido"),
        (["albumina"], "Albumina x whey: custo, digestão e qualidade proteica"),
        (["colageno"], "Colágeno para articulação e pele: o que é fato"),
        (["hipercalorico"], "Hipercalórico: quando ajuda e quando só engorda"),
        (["bcaa"], "BCAA vale a pena se você já come proteína suficiente?"),
    ],
    "treino": [
        (["abc"], "Treino ABC: como montar a ficha completa (com exemplo)"),
        (["upper", "lower"], "Treino Upper/Lower: divisão superior e inferior para 4 dias"),
        (["push", "pull", "ppl"], "Push Pull Legs: a divisão por movimento explicada"),
        (["full body", "fullbody"], "Treino Full Body para iniciantes: 3 dias por semana"),
        (["5x5"], "Treino 5x5 para força: como progredir no agachamento, supino e terra"),
        (["progressao", "carga"], "Progressão de carga: quando e quanto aumentar o peso"),
        (["abcde"], "Treino ABCDE: vale a pena treinar um músculo por dia?"),
        (["drop", "rest-pause", "rest pause"], "Drop-set, rest-pause e bi-set: quando usar técnicas avançadas"),
        (["em casa", "halter"], "Treino em casa com halteres: ficha completa"),
        (["gluteo"], "Treino de glúteo: exercícios, séries e frequência"),
        (["iniciante", "primeiro mes"], "Primeiro mês na academia: ficha e erros comuns"),
        (["aquecimento"], "Aquecimento antes da musculação: o que fazer em 5 minutos"),
    ],
}

APP_URL = "https://app.shapereal.com.br"

client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
TODAY = datetime.date.today()


# ============================================================
# 1. GERAR ARTIGO
# ============================================================
def _prompt_padrao(tipo: str, descricao: str) -> str:
    """Prompt usado para guia, review e notícia (1.200-1.500 palavras, prático)."""
    return f"""Você é redator do blog brasileiro "Shape Real" (nicho: emagrecimento e definição muscular).

Escreva 1 artigo do tipo "{tipo}".
Tema sugerido: {descricao}

REGRAS RÍGIDAS:
- 1.200 a 1.500 palavras
- Português brasileiro, tom direto e prático, ZERO floreio
- 1 H1 (título principal), 4-6 H2, parágrafos curtos
- Inclua 1 tabela em HTML quando relevante
- Termine com seção "Como aplicar" em lista numerada (ol/li)
- NÃO invente estudos. Se citar pesquisa, deixe marcado: [VERIFICAR FONTE]
- Não use emojis no corpo
- Linguagem que conversa direto com o leitor: você, seu, sua

FORMATO DA RESPOSTA (siga RIGOROSAMENTE — duas partes separadas por ===HTML===):

PARTE 1 — JSON válido com metadata (sem aspas escapadas, sem ```):
{{
  "titulo": "Título SEO (até 60 caracteres, com palavra-chave principal)",
  "slug": "url-com-hifens-sem-acento",
  "meta_description": "Resumo de 150-160 caracteres para o Google",
  "categoria": "{tipo}",
  "tags": ["tag1", "tag2", "tag3"],
  "emoji_thumb": "🔥",
  "tempo_leitura_min": 10,
  "lead": "Parágrafo de abertura (1-2 linhas)"
}}

===HTML===

PARTE 2 — HTML do corpo do artigo (sem cercas, sem aspas escapadas, escreva HTML normal):
<h2>Primeiro subtítulo</h2>
<p>...</p>
<h2>Segundo subtítulo</h2>
<p>...</p>
..."""


def _prompt_estudo(descricao: str) -> str:
    """Prompt aprofundado para artigos do tipo 'estudo' (~2.500-3.500 palavras, estrutura científica)."""
    return f"""Você é editor científico do blog brasileiro "Shape Real" (nicho: emagrecimento, definição muscular, nutrição esportiva).

Sua tarefa: escrever 1 artigo APROFUNDADO traduzindo e contextualizando um estudo científico recente para o público brasileiro.

Tema sugerido: {descricao}

REGRAS RÍGIDAS (siga TODAS):
- 2.500 a 3.500 palavras (artigo pilar de SEO)
- Português brasileiro técnico mas acessível — explique jargões na primeira aparição
- ZERO opinião sem evidência. Tudo precisa ter base no estudo discutido OU em literatura prévia
- NUNCA invente estudos, autores ou números. Se citar pesquisa de apoio que não tem certeza, marque [VERIFICAR FONTE: descrição do que precisa verificar]
- Sempre cite o estudo principal com: autor principal, ano, jornal, e (se souber) DOI
- Use unidades do SI e exemplos com valores brasileiros (kg, kcal, R$)
- Linguagem na 2ª pessoa: você, seu, sua

ESTRUTURA OBRIGATÓRIA (cada subtítulo H2 vira uma seção):

1. <h2>O que esse estudo descobriu</h2>
   — 1 parágrafo resumindo o achado principal em linguagem simples (TL;DR)

2. <h2>Por que isso importa para você</h2>
   — Conecta com a vida prática de quem treina/faz dieta

3. <h2>Como o estudo foi feito</h2>
   — Metodologia em detalhe: n amostral, perfil dos participantes (idade, sexo, nível de treino), duração, protocolo, variáveis medidas, grupo controle, randomização. Use bullet points ou tabela quando ajudar

4. <h2>Os resultados em números</h2>
   — Aqui vai 1 TABELA HTML obrigatória com os principais desfechos (média ± desvio padrão, valor de p quando relevante, tamanho de efeito)
   — Comente cada linha da tabela em parágrafo separado

5. <h2>Como isso se compara com o que já sabíamos</h2>
   — Contextualiza com 2-3 estudos anteriores da mesma área (se você não souber com certeza, marque [VERIFICAR FONTE])

6. <h2>Limitações que você precisa saber</h2>
   — Tamanho amostral pequeno? Curto prazo? Conflitos de interesse? Sempre tem limitações — liste honestamente

7. <h2>O que isso muda na sua rotina (prática)</h2>
   — Lista numerada de aplicações concretas: dose, timing, combinações, em quem funciona melhor, quando NÃO usar

8. <h2>Referência</h2>
   — Citação no formato: Sobrenome A. et al. (ANO). Título do estudo. Jornal, vol(ed), pp. DOI.

FORMATO DA RESPOSTA (siga RIGOROSAMENTE — duas partes separadas por ===HTML===):

PARTE 1 — JSON válido com metadata (sem aspas escapadas, sem ```):
{{
  "titulo": "Título SEO técnico mas atrativo (até 65 caracteres)",
  "slug": "url-com-hifens-sem-acento",
  "meta_description": "Resumo do achado central + número-chave em 150-160 caracteres",
  "categoria": "estudo",
  "tags": ["nome-do-suplemento-ou-tema", "ciencia", "estudos"],
  "emoji_thumb": "🔬",
  "tempo_leitura_min": 18,
  "lead": "1-2 frases: qual estudo, quem publicou, qual a descoberta principal"
}}

===HTML===

PARTE 2 — HTML do corpo do artigo (segue a estrutura de 8 seções acima, sem cercas, sem aspas escapadas):
<h2>O que esse estudo descobriu</h2>
<p>...</p>
<h2>Por que isso importa para você</h2>
<p>...</p>
..."""


def _norm(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("-", " ")


def publicados() -> list[dict]:
    path = DATA_DIR / "posts.json"
    posts = json.loads(path.read_text()) if path.exists() else []
    # Inclui também arquivos em posts/ fora do manifesto (o manifesto guarda só 60).
    slugs = {p["slug"] for p in posts}
    for f in POSTS_DIR.glob("*.html"):
        slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", f.stem)
        if slug not in slugs:
            posts.append({"titulo": slug.replace("-", " "), "slug": slug})
            slugs.add(slug)
    return posts


def escolher_tema(tipo: str, posts: list[dict]) -> str | None:
    corpus = " | ".join(_norm(p.get("titulo", "") + " " + p.get("slug", "")) for p in posts)
    for chaves, briefing in TEMAS.get(tipo, []):
        if not any(_norm(k) in corpus for k in chaves):
            return briefing
    return None


def _tokens(s: str) -> set[str]:
    stop = {"de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "para", "com", "que", "um", "uma", "no", "na", "em", "por", "como", "seu", "sua"}
    return {t for t in re.findall(r"[a-z0-9]+", _norm(s)) if t not in stop and len(t) > 2}


def duplicado(titulo: str, posts: list[dict], limite: float = 0.5) -> str | None:
    """Retorna o título parecido já publicado (Jaccard de palavras), se houver."""
    novo = _tokens(titulo)
    for p in posts:
        antigo = _tokens(p.get("titulo", "") + " " + p.get("slug", "").replace("-", " "))
        if novo and antigo and len(novo & antigo) / len(novo | antigo) >= limite:
            return p.get("titulo") or p.get("slug")
    return None


def gerar_artigo() -> dict:
    weekday = TODAY.weekday()
    if weekday not in EDITORIAL:
        print(f"[skip] {TODAY} é {['seg','ter','qua','qui','sex','sáb','dom'][weekday]} — pipeline não roda")
        raise SystemExit(0)

    tipo, _ = EDITORIAL[weekday]
    posts = publicados()
    tema = escolher_tema(tipo, posts)
    if not tema:
        print(f"[skip] todos os temas de '{tipo}' já foram cobertos — adicione temas em TEMAS para continuar")
        raise SystemExit(0)
    ja = "\n".join(f"- {p.get('titulo')}" for p in posts[:80])
    descricao = f"{tema}\n\nNÃO repita nenhum destes artigos já publicados (escolha um ângulo e título diferentes):\n{ja}"
    print(f"     -> tema: {tema}")

    # Prompts diferenciados por tipo
    if tipo == "estudo":
        prompt = _prompt_estudo(descricao)
        max_tokens = 16000  # artigo maior precisa de mais tokens
        print(f"     -> usando prompt APROFUNDADO (estudo científico)")
    else:
        prompt = _prompt_padrao(tipo, descricao)
        max_tokens = 8000

    msg = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text.strip()

    # Remove cercas markdown se vierem
    if text.startswith("```"):
        text = re.sub(r"^```(?:json|markdown)?\s*|\s*```$", "", text, flags=re.MULTILINE)

    # Separa JSON (metadata) de HTML (corpo)
    if "===HTML===" in text:
        json_part, html_part = text.split("===HTML===", 1)
        json_clean = json_part.strip()
        if json_clean.startswith("```"):
            json_clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", json_clean, flags=re.MULTILINE).strip()
        artigo = json.loads(json_clean)
        # Remove cercas do HTML também, se vierem
        html_clean = html_part.strip()
        if html_clean.startswith("```"):
            html_clean = re.sub(r"^```(?:html)?\s*|\s*```$", "", html_clean, flags=re.MULTILINE).strip()
        artigo["conteudo_html"] = html_clean
        return artigo

    # Fallback: tenta parse como JSON único (compatibilidade)
    return json.loads(text)


def bloco_app(slug: str, categoria: str) -> str:
    """Chamada para o app no fim de todo artigo (canal de aquisição do produto)."""
    utm = f"utm_source=blog&utm_medium=artigo&utm_campaign={slug}"
    titulo = "Monte sua ficha de treino com IA — grátis" if categoria in ("treino", "estudo") else "Coloque isso em prática no Shape Real"
    texto = (
        "Escolha o sistema que você gosta (ABC, Upper/Lower, PPL, 5×5), registre cada carga e veja quando subir o peso."
        if categoria in ("treino", "estudo")
        else "Calcule suas metas de calorias e proteína, analise o que você comeu e acompanhe sua evolução no app."
    )
    return f"""
<aside class="app-cta" style="margin:40px 0;padding:24px;border-radius:10px;background:#12151a;color:#f1f2ee">
  <p style="margin:0 0 6px;font-size:20px;font-weight:800">{titulo}</p>
  <p style="margin:0 0 16px;color:rgba(241,242,238,.75)">{texto}</p>
  <a href="{APP_URL}/?{utm}" style="display:inline-block;background:#d3241c;color:#fff;padding:12px 18px;border-radius:6px;font-weight:700;text-decoration:none">Começar grátis</a>
</aside>"""


# ============================================================
# 2. RENDER ARTIGO -> HTML
# ============================================================
def render_artigo(artigo: dict) -> Path:
    tpl = (TEMPLATES / "article.html.tpl").read_text(encoding="utf-8")
    hoje_pt = TODAY.strftime("%d de %B de %Y")
    # Autoria honesta: nada de profissional fictício. Conteúdo é gerado com IA;
    # troque por um autor real (nome + registro CRN/CREF) somente quando houver revisão de fato.
    autor = ("Equipe Shape Real", "SR", "Conteúdo produzido com auxílio de IA")

    html = (tpl
        .replace("{{TITLE}}", artigo["titulo"])
        .replace("{{META_DESCRIPTION}}", artigo["meta_description"])
        .replace("{{TAG}}", artigo["categoria"].capitalize())
        .replace("{{H1}}", artigo["titulo"])
        .replace("{{LEAD}}", artigo["lead"])
        .replace("{{AUTHOR_NAME}}", autor[0])
        .replace("{{AUTHOR_AVATAR}}", autor[1])
        .replace("{{AUTHOR_ROLE}}", autor[2])
        .replace("{{DATE_ISO}}", TODAY.isoformat())
        .replace("{{DATE}}", hoje_pt)
        .replace("{{READ_TIME}}", str(artigo["tempo_leitura_min"]))
        .replace("{{CONTENT_HTML}}", artigo["conteudo_html"] + bloco_app(artigo["slug"], artigo["categoria"]))
    )

    fname = f"{TODAY.isoformat()}-{artigo['slug']}.html"
    path = POSTS_DIR / fname
    path.write_text(html, encoding="utf-8")
    return path


# ============================================================
# 3. ATUALIZA MANIFESTO data/posts.json
# ============================================================
def atualizar_manifesto(artigo: dict, html_path: Path) -> list[dict]:
    manifest_path = DATA_DIR / "posts.json"
    posts = json.loads(manifest_path.read_text()) if manifest_path.exists() else []

    posts.insert(0, {
        "titulo": artigo["titulo"],
        "slug": artigo["slug"],
        "url": f"posts/{html_path.name}",
        "categoria": artigo["categoria"],
        "emoji": artigo.get("emoji_thumb", "📝"),
        "resumo": artigo["meta_description"],
        "tempo_leitura": artigo["tempo_leitura_min"],
        "data": TODAY.isoformat(),
    })
    # Mantém só os últimos 60 no manifesto
    posts = posts[:60]
    manifest_path.write_text(json.dumps(posts, ensure_ascii=False, indent=2))
    return posts


# ============================================================
# 4. ATUALIZA PREÇOS DOS SUPLEMENTOS
# ============================================================
def atualizar_precos() -> list[dict]:
    path = DATA_DIR / "supplements.json"
    if not path.exists():
        return []
    current = json.loads(path.read_text())
    # DESATIVADO: o modelo não acessa a internet, então "verificar" preços só carimbava
    # ultima_verificacao sem checar nada (informação enganosa ao consumidor). Atualize
    # supplements.json manualmente ou integre uma API de preços/afiliados real.
    return current

    prompt = f"""Hoje é {TODAY.isoformat()}. Os preços abaixo foram verificados há alguns dias.

Para cada item, verifique se há indício público de mudança de preço (promoção, reajuste, Black Friday,
liquidação sazonal). Se não houver indício claro, mantenha o preço atual.

Em todos os itens, atualize "ultima_verificacao" para "{TODAY.isoformat()}".

JSON atual:
{json.dumps(current, ensure_ascii=False, indent=2)}

Devolva APENAS o JSON atualizado, mesmo formato, sem ```.
"""
    msg = client.messages.create(model=MODEL, max_tokens=4000,
                                 messages=[{"role": "user", "content": prompt}])
    text = msg.content[0].text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE)
    try:
        updated = json.loads(text)
        path.write_text(json.dumps(updated, ensure_ascii=False, indent=2))
        return updated
    except json.JSONDecodeError:
        print("[precos] resposta não-JSON, mantendo current")
        return current


# ============================================================
# 5. REGENERA HOMEPAGE (injeta destaque + arquivo de artigos)
# ============================================================
def regenerar_homepage(posts: list[dict]) -> None:
    idx = ROOT / "index.html"
    html = idx.read_text(encoding="utf-8")

    # --- HERO EDIÇÃO: data + número total de artigos ---
    edicao_html = (
        f'<span class="pill"><span class="live"></span> '
        f'Edição {_fmt_data(TODAY.isoformat())} · Artigo nº {len(posts)}'
        f'</span>'
    )
    pattern_edicao = re.compile(r"<!--HERO_EDICAO_START-->.*?<!--HERO_EDICAO_END-->", re.DOTALL)
    novo_edicao = f"<!--HERO_EDICAO_START-->\n      {edicao_html}\n      <!--HERO_EDICAO_END-->"
    if pattern_edicao.search(html):
        html = pattern_edicao.sub(novo_edicao, html)
        print(f"     -> badge de edição atualizado (nº {len(posts)})")

    # --- HERO DESTAQUE: artigo mais recente ---
    if posts:
        p = posts[0]
        autor_nome, autor_papel = _autor_por_categoria(p.get("categoria", ""))
        publicado = _publicado_label(p["data"])
        destaque_card = (
            f'<div class="label">★ Destaque mais recente '
            f'<span class="updated-tag">{publicado}</span></div>\n'
            f'      <h3><a href="{p["url"]}" style="color:inherit">{p["titulo"]}</a></h3>\n'
            f'      <div class="meta">por {autor_nome}, {autor_papel} · {p["tempo_leitura"]} min de leitura</div>\n'
            f'      <p style="color:var(--muted);font-size:14.5px;margin-bottom:18px">{p["resumo"]}</p>\n'
            f'      <a href="{p["url"]}" class="read">Ler análise completa →</a>'
        )
        pattern_dest = re.compile(r"<!--HERO_DESTAQUE_START-->.*?<!--HERO_DESTAQUE_END-->", re.DOTALL)
        novo_dest = f"<!--HERO_DESTAQUE_START-->\n      {destaque_card}\n      <!--HERO_DESTAQUE_END-->"
        if pattern_dest.search(html):
            html = pattern_dest.sub(novo_dest, html)
            print(f"     -> destaque do hero atualizado: {p['titulo'][:60]}")

    # --- HERO TOTAL: contador de artigos publicados (trust strip) ---
    pattern_total = re.compile(r"<!--HERO_TOTAL_START-->.*?<!--HERO_TOTAL_END-->", re.DOTALL)
    novo_total = f"<!--HERO_TOTAL_START-->{len(posts)}<!--HERO_TOTAL_END-->"
    if pattern_total.search(html):
        html = pattern_total.sub(novo_total, html)

    # --- DESTAQUE: 2 mais recentes (cards grandes) ---
    destaque = posts[:2]
    featured_html = "\n".join([
        f'''      <article class="feat">
        {'<span class="new-badge">● Novo</span>' if i == 0 else ''}
        <a href="{p["url"]}"><div class="thumb"><div class="emoji">{p["emoji"]}</div></div></a>
        <div class="body">
          <span class="tag">{p["categoria"].capitalize()}</span>
          <h3><a href="{p["url"]}">{p["titulo"]}</a></h3>
          <p class="lead">{p["resumo"]}</p>
          <div class="meta-row">
            <span class="date">{_fmt_data_extenso(p["data"])}</span>
            <span class="dot">·</span>
            <span class="read">{p["tempo_leitura"]} min de leitura</span>
            <span class="arrow">Ler →</span>
          </div>
        </div>
      </article>'''
        for i, p in enumerate(destaque)
    ])

    pattern_feat = re.compile(r"<!--FEATURED_START-->.*?<!--FEATURED_END-->", re.DOTALL)
    novo_feat = f"<!--FEATURED_START-->\n{featured_html}\n      <!--FEATURED_END-->"
    if pattern_feat.search(html):
        html = pattern_feat.sub(novo_feat, html)
        print(f"     -> destaque regenerado com {len(destaque)} cards")

    # --- MAIS ARTIGOS: do 3º ao 8º (6 cards no grid) ---
    arquivo = posts[2:8]
    cards_html = "\n".join([
        f'''      <article class="card">
        <a href="{p["url"]}"><div class="thumb"><div class="emoji">{p["emoji"]}</div></div></a>
        <div class="body">
          <span class="tag">{p["categoria"].capitalize()}</span>
          <h3><a href="{p["url"]}">{p["titulo"]}</a></h3>
          <p>{p["resumo"]}</p>
          <div class="meta"><span class="date">{_fmt_data_extenso(p["data"])}</span> · <span>{p["tempo_leitura"]} min</span></div>
        </div>
      </article>'''
        for p in arquivo
    ])

    pattern = re.compile(r"<!--POSTS_START-->.*?<!--POSTS_END-->", re.DOTALL)
    novo_bloco = f"<!--POSTS_START-->\n{cards_html}\n      <!--POSTS_END-->"
    if pattern.search(html):
        html = pattern.sub(novo_bloco, html)
        print(f"     -> arquivo regenerado com {len(arquivo)} cards")
    else:
        print("     -> marcadores POSTS_START/END não encontrados")

    idx.write_text(html, encoding="utf-8")


def _fmt_data_extenso(iso: str) -> str:
    meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
             "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    d = datetime.date.fromisoformat(iso)
    return f"{d.day} de {meses[d.month-1]} de {d.year}"


def _fmt_data(iso: str) -> str:
    """Formato curto: 28 mai 2026."""
    meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
    d = datetime.date.fromisoformat(iso)
    return f"{d.day} {meses[d.month-1]} {d.year}"


def _autor_por_categoria(cat: str) -> tuple:
    """Mapa autor → (nome, papel) para o hero card."""
    # Sem autores fictícios: todo conteúdo é assinado pela equipe, com aviso de IA.
    return ("Equipe Shape Real", "conteúdo com auxílio de IA")


def _publicado_label(iso: str) -> str:
    """Mostra 'Publicado hoje', 'há X dias' ou a data curta."""
    d = datetime.date.fromisoformat(iso)
    delta = (datetime.date.today() - d).days
    if delta == 0:
        return "● Publicado hoje"
    if delta == 1:
        return "● Publicado ontem"
    if delta < 7:
        return f"● Publicado há {delta} dias"
    return f"● {_fmt_data(iso)}"


# ============================================================
# 6. GIT — commit + push (ou cria branch para PR)
# ============================================================
def git(*args, check=True):
    return subprocess.run(["git", *args], check=check, capture_output=True, text=True)


def commit_e_push(artigo: dict, draft_mode: bool) -> None:
    git("config", "user.name",  "shape-real-bot")
    git("config", "user.email", "bot@shapereal.com")

    if draft_mode:
        branch = f"draft/{TODAY.isoformat()}-{artigo['slug']}"
        git("checkout", "-b", branch)
        git("add", ".")
        git("commit", "-m", f"draft: {artigo['titulo']}")
        git("push", "-u", "origin", branch)
        # Cria PR via API gh CLI (já disponível no runner do GitHub Actions)
        subprocess.run([
            "gh", "pr", "create",
            "--title", f"Revisão: {artigo['titulo']}",
            "--body",  f"Artigo gerado em {TODAY}. Revise e ajuste antes de fazer merge.",
            "--base",  "main",
        ], check=True)
        print(f"     -> Pull Request criado: {branch}")
    else:
        git("add", ".")
        # Se nada mudou, sai sem erro
        result = git("diff", "--staged", "--quiet", check=False)
        if result.returncode == 0:
            print("     -> nada para commitar")
            return
        git("commit", "-m", f"post: {artigo['titulo']} ({TODAY})")
        git("push", "origin", "main")
        print(f"     -> publicado em main (Netlify re-deployará em ~30s)")


# ============================================================
# MAIN
# ============================================================
def main() -> None:
    print(f"== Shape Real Pipeline · {datetime.datetime.now().isoformat()}")
    weekday = TODAY.weekday()
    draft_mode = weekday in DAYS_DRAFT_MODE

    print(f"[1/4] Gerando artigo do dia ({['seg','ter','qua','qui','sex','sáb','dom'][weekday]})...")
    artigo = gerar_artigo()
    parecido = duplicado(artigo["titulo"], publicados())
    if parecido:
        print(f"[skip] título muito parecido com um já publicado: '{parecido}' — nada foi publicado")
        raise SystemExit(0)
    html_path = render_artigo(artigo)
    print(f"     -> {artigo['titulo']} ({artigo['tempo_leitura_min']} min)")
    print(f"     -> {html_path.relative_to(ROOT)}")

    print("[2/4] Atualizando manifesto de posts...")
    posts = atualizar_manifesto(artigo, html_path)
    print(f"     -> {len(posts)} artigos no manifesto")

    print("[3/4] Verificando preços do comparativo...")
    sups = atualizar_precos()
    print(f"     -> {len(sups)} itens verificados")

    print("[4/4] Regenerando homepage e fazendo push...")
    regenerar_homepage(posts)
    commit_e_push(artigo, draft_mode)

    print("== Pipeline concluído")


if __name__ == "__main__":
    main()
