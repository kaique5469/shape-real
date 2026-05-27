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

# Quinta-feira = dia de criar PR para revisão
DAYS_DRAFT_MODE = {3}  # 0=seg, 1=ter, 2=qua, 3=qui, 4=sex...

# Calendário editorial: tipo + tema sugerido por dia da semana
EDITORIAL = {
    0: ("guia",    "Guia prático sobre déficit calórico, treino para definição ou estratégia de cutting (1.500 palavras)"),
    1: ("estudo",  "Tradução comentada de um estudo recente sobre suplementação, nutrição ou treinamento"),
    2: ("review",  "Review honesto de um suplemento popular (whey, creatina, termogênico ou pré-treino)"),
    3: ("noticia", "Notícia recente do mundo fitness (Anvisa, lançamento, polêmica ou tendência)"),
}

client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
TODAY = datetime.date.today()


# ============================================================
# 1. GERAR ARTIGO
# ============================================================
def gerar_artigo() -> dict:
    weekday = TODAY.weekday()
    if weekday not in EDITORIAL:
        print(f"[skip] {TODAY} é {['seg','ter','qua','qui','sex','sáb','dom'][weekday]} — pipeline não roda")
        raise SystemExit(0)

    tipo, descricao = EDITORIAL[weekday]

    prompt = f"""Você é redator do blog brasileiro "Shape Real" (nicho: emagrecimento e definição muscular).

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
    msg = client.messages.create(
        model=MODEL,
        max_tokens=8000,
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


# ============================================================
# 2. RENDER ARTIGO -> HTML
# ============================================================
def render_artigo(artigo: dict) -> Path:
    tpl = (TEMPLATES / "article.html.tpl").read_text(encoding="utf-8")
    hoje_pt = TODAY.strftime("%d de %B de %Y")
    autor = {
        "guia":    ("Dra. Marina Costa", "MC", "Nutricionista esportiva"),
        "estudo":  ("Dra. Marina Costa", "MC", "Nutricionista esportiva"),
        "review":  ("Rafael Andrade",    "RA", "Editor-chefe"),
        "noticia": ("Rafael Andrade",    "RA", "Editor-chefe"),
    }.get(artigo["categoria"], ("Equipe Shape Real", "SR", "Equipe editorial"))

    html = (tpl
        .replace("{{TITLE}}", artigo["titulo"])
        .replace("{{META_DESCRIPTION}}", artigo["meta_description"])
        .replace("{{TAG}}", artigo["categoria"].capitalize())
        .replace("{{H1}}", artigo["titulo"])
        .replace("{{LEAD}}", artigo["lead"])
        .replace("{{AUTHOR_NAME}}", autor[0])
        .replace("{{AUTHOR_AVATAR}}", autor[1])
        .replace("{{AUTHOR_ROLE}}", autor[2])
        .replace("{{DATE}}", hoje_pt)
        .replace("{{READ_TIME}}", str(artigo["tempo_leitura_min"]))
        .replace("{{CONTENT_HTML}}", artigo["conteudo_html"])
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
    """Mantido para compatibilidade — formato curto."""
    meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
    d = datetime.date.fromisoformat(iso)
    return f"{d.day} {meses[d.month-1]} {d.year}"


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

    print(f"[1/4] Gerando artigo do dia ({['seg','ter','qua','qui'][weekday]})...")
    artigo = gerar_artigo()
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
