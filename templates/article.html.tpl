<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{TITLE}} — Shape Real</title>
<meta name="description" content="{{META_DESCRIPTION}}">
<meta property="og:title" content="{{TITLE}}">
<meta property="og:description" content="{{META_DESCRIPTION}}">
<meta property="og:type" content="article">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../article.css">

<!-- Schema.org Article (rich snippet no Google) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{{TITLE}}",
  "description": "{{META_DESCRIPTION}}",
  "author": {"@type": "Person", "name": "{{AUTHOR_NAME}}"},
  "datePublished": "{{DATE}}",
  "publisher": {"@type": "Organization", "name": "Shape Real"}
}
</script>
</head>
<body>

<header class="site">
  <div class="nav">
    <a href="../index.html" class="logo"><span class="dot"></span> Shape <span style="color:var(--accent)">Real</span></a>
    <ul class="menu">
      <li><a href="../index.html#calculadora">Calculadora</a></li>
      <li><a href="../index.html#comparativo">Comparativo</a></li>
      <li><a href="../index.html#artigos">Artigos</a></li>
      <li><a href="../index.html#suplementos">Suplementos</a></li>
      <li><a href="../index.html#equipe">Equipe</a></li>
    </ul>
  </div>
</header>

<div class="container article-head">
  <div class="crumb"><a href="../index.html">Home</a> › <a href="../index.html#artigos">{{TAG}}</a></div>
  <span class="tag">{{TAG}}</span>
  <h1>{{H1}}</h1>
  <p class="lead">{{LEAD}}</p>
  <div class="author">
    <div class="avatar">{{AUTHOR_AVATAR}}</div>
    <div>
      <strong style="color:#fff">{{AUTHOR_NAME}}</strong> — {{AUTHOR_ROLE}}<br>
      <span style="font-size:13px">{{DATE}} · {{READ_TIME}} min de leitura</span>
    </div>
  </div>
</div>

<article class="body container">
{{CONTENT_HTML}}

<hr>
<p style="color:var(--muted);font-size:13px">
  <strong>Revisão técnica:</strong> {{AUTHOR_NAME}}.<br>
  <strong>Aviso:</strong> conteúdo educativo. Não substitui consulta com profissional de saúde, nutricionista ou educador físico.
</p>

<a href="../index.html" class="back">← Voltar para a home</a>
</article>

<footer class="site">
  <div class="container">
    <strong>Shape Real</strong> · Conteúdo independente revisado por nutricionistas esportivos parceiros. © 2026.
  </div>
</footer>

</body>
</html>
