# Shape Real — app

Ficha de treino com IA, registro de cargas, evolução, dieta e área do personal.
Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Auth, Postgres com RLS, Storage) · Claude.

## Rodar localmente

```bash
cd app
npm install
npm run dev          # http://localhost:3000
npm run verify       # typecheck + testes de unidade
npm run build
```

Sem nenhuma variável de ambiente o app já funciona em **modo local**: os dados ficam no
navegador, a IA usa o motor determinístico e a demonstração (aluno e personal) fica disponível.

## Modo teste (sem login)

`/testar` entra direto no painel do personal, sem cadastro: cria um ambiente no próprio aparelho com três
alunos de exemplo. O personal cadastra alunos, monta ficha e dieta, e usa **Ver como aluno** para registrar
um treino do lado do aluno. Tudo fica liberado (sem limites de plano) e a faixa do topo abre o feedback,
que vai pelo WhatsApp. `/testar?k=<TESTER_PASS>` também libera a IA real, quando ela estiver ligada.

Sem IA ligada, fichas e cardápios saem do motor do próprio app (`src/lib/domain`), e a interface não
promete IA. Para ligar: cadastre um cartão em Vercel → AI Gateway (variável `AI_GATEWAY=1` já usa o token
do deploy) ou defina `ANTHROPIC_API_KEY`.

## Colocar no ar (produção)

1. **Supabase** — crie um projeto (região `sa-east-1`, São Paulo, para latência e LGPD) e rode
   `supabase/migrations/0001_schema.sql` no SQL Editor (ou `npx supabase db push`).
   Em Authentication → URL Configuration, cadastre `https://app.shapereal.com.br` como Site URL
   e `https://app.shapereal.com.br/**` em Redirect URLs.
2. **Vercel** — importe o repositório com **Root Directory = `app`**. Variáveis:
   | Variável | Onde pegar |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API |
   | `ANTHROPIC_API_KEY` | console.anthropic.com (só servidor; nunca `NEXT_PUBLIC_`) |
   | `NEXT_PUBLIC_SITE_URL` | `https://app.shapereal.com.br` |
   | `NEXT_PUBLIC_POSTHOG_KEY` (opcional) | PostHog → Project settings |
   | `NEXT_PUBLIC_CHECKOUT_PRO_URL` / `..._COACH_URL` (opcional) | Link de pagamento (Stripe/Mercado Pago) |
3. **Domínio** — aponte `app.shapereal.com.br` para a Vercel. O blog (Netlify) já redireciona `/app` para lá.

## Arquitetura

```
src/lib/domain/   Regras puras e testadas: exercícios, sistemas (ABC, Upper/Lower, PPL, 5×5…),
                  gerador de fichas, progressão dupla, 1RM, anilhas, nutrição, leitor de dieta, CSV
src/lib/data/     Repository (contrato) → LocalRepository (navegador) e SupabaseRepository (RLS)
src/lib/ai/       Rotas de IA: saída estruturada (JSON Schema), créditos por plano, fallback
src/app/(site)    Landing, privacidade, termos        src/app/(painel)  App autenticado
supabase/         Migrations (tabelas, RLS, storage, RPCs de convite, créditos e exclusão de conta)
```

**IA nunca é ponto único de falha.** Sem chave, sem login, sem crédito ou com erro, as rotas
respondem com o motor determinístico (mesmo formato), e a tela avisa o motivo.

**Segurança.** Todas as tabelas têm RLS. O aluno vê os próprios dados; o personal só vê alunos
vinculados por convite. O plano (`profiles.plan`) só muda pelo backend de pagamento (trigger).
O consumo de IA é contado no banco (`consume_ai_credit`), não no navegador.

**LGPD.** Peso, medidas, fotos e dieta são dados sensíveis: consentimento explícito e datado,
fotos em bucket privado com URL assinada, exportação completa e exclusão de conta pelo próprio usuário.

## Monetização (hipóteses a validar)

| Plano | Preço | Limites |
|---|---|---|
| Grátis | R$ 0 | registro ilimitado, 2 fichas, 3 IA/mês, 6 fotos |
| Pro | R$ 19,90/mês · R$ 149/ano | IA (uso justo), fichas e fotos ilimitadas, exportar Excel |
| Personal | R$ 59,90/mês · R$ 599/ano | 20 alunos, alunos ganham Pro, painel de aderência |

Sem link de checkout configurado, o botão "Assinar" registra o interesse em `upgrade_intents`:
funciona como teste de demanda antes de integrar cobrança. Próximo passo: webhook do pagamento
atualizando `profiles.plan` com a chave secreta (rota de servidor).

## Métricas (eventos já instrumentados)

`signup_started → signup_completed → onboarding_completed → program_generated → workout_started →
workout_completed` (ativação), `pr_achieved`, `diet_analyzed`, `student_invited → invite_accepted`
(loop viral do personal), `paywall_viewed → upgrade_clicked` (conversão). Nenhum dado de saúde é
enviado nos eventos.
