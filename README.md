# Shape Real — blog fitness com pipeline de IA

Site estático hospedado na Netlify. Atualização automática 4×/semana via GitHub Actions + Claude API.

## Estrutura

```
shape-real/
├── index.html                    # homepage com calculadora + comparativo
├── article.css                   # estilo compartilhado dos artigos
├── estudo-cafeina.html           # artigo modelo (estudo)
├── review-whey.html              # artigo modelo (review)
├── noticia-anvisa.html           # artigo modelo (notícia)
├── guia-deficit.html             # artigo modelo (guia)
├── posts/                        # artigos gerados automaticamente
├── data/
│   ├── posts.json                # manifesto dos artigos publicados
│   └── supplements.json          # dados do comparativo
├── templates/
│   └── article.html.tpl          # template usado pelo pipeline
├── ai_pipeline.py                # script que gera artigos com Claude
├── requirements.txt
├── netlify.toml                  # config Netlify
├── .github/workflows/
│   └── daily-update.yml          # cron que dispara o pipeline
├── DEPLOY-AGORA.md               # passo-a-passo de deploy
└── GUIA-USO.md                   # guia completo
```

## Deploy

Leia o `DEPLOY-AGORA.md`.

## Como o pipeline funciona

Segunda → guia · Terça → estudo · Quarta → review · Quinta → notícia (vira PR pra você revisar)

Sexta-domingo não roda.
