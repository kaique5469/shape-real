# Shape Real

Dois produtos no mesmo repositório:

| Pasta | O que é | Onde roda |
|---|---|---|
| `/` (raiz) | Blog de fitness estático + pipeline de artigos com IA | Netlify — shapereal.com.br |
| `app/` | App de treino: ficha com IA, cargas, evolução, dieta e área do personal | Vercel — app.shapereal.com.br |

O blog é o canal de aquisição do app: menu "Ficha com IA" e chamada no fim de todo artigo (com UTM).

## App

Veja [`app/README.md`](app/README.md).

## Blog — pipeline de artigos

GitHub Actions (`.github/workflows/daily-update.yml`) roda seg–qui às 9h UTC e executa `ai_pipeline.py`:

| Dia | Tipo | Publicação |
|---|---|---|
| Seg | guia (nutrição) | direto no `main` |
| Ter | estudo | **Pull Request para revisão** (cita pesquisa) |
| Qua | review de suplemento | direto no `main` |
| Qui | treino (leva ao app) | direto no `main` |

Proteções contra conteúdo repetido ou inventado:
- **Fila de temas** (`TEMAS`): o pipeline escolhe o primeiro tema ainda não coberto. Acabou a fila → não publica.
- **Trava de duplicado**: título parecido com um já publicado (similaridade ≥ 50%) → não publica.
- **Sem "notícia"**: sem fonte real, o modelo inventava notícias da Anvisa. Removido até integrar uma fonte (RSS do DOU/Anvisa).
- **Preços não são "verificados" pela IA**: atualize `data/supplements.json` manualmente ou via API de afiliados.
- **Autoria honesta**: "Equipe Shape Real", com aviso de uso de IA. Só use nome de profissional real (com CRN/CREF) se houver revisão de fato.

### Pendências do blog
- Trocar `?ref=SEUCODIGO` em `data/supplements.json` pelos códigos reais de afiliado (hoje nenhuma comissão é registrada).
- Consolidar os artigos duplicados já publicados (mesmo tema várias vezes) com redirecionamento 301 para a melhor versão.
- Apagar as branches `draft/*` com notícias geradas sem fonte.
