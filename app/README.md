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
alunos de exemplo. Tudo fica liberado (sem limites de plano) e a faixa do topo abre o feedback, que vai
pelo WhatsApp (`NEXT_PUBLIC_FEEDBACK_WHATSAPP`). O que dá para testar:

- **Alunos** — cadastro com anamnese básica, painel de quem treinou, ficha vencendo e quem está parado,
  resumo por aluno, avaliação física e fotos registradas pelo personal, WhatsApp direto.
- **Fichas** — base gerada pelo perfil ou montada do zero (divisão livre), editor com dias, séries por
  repetições/segundos/minutos, técnicas, validade e exercícios próprios; envio por WhatsApp, texto, PDF e
  planilha; modelos reutilizáveis aplicados a alunos.
- **Ver como aluno** — abre o app do aluno para registrar um treino (cargas, descanso com aviso sonoro,
  bi-set, cronômetro de isometria) e volta ao painel pela faixa do topo.
- **Dieta** — metas editáveis, cardápio com porções em gramas e medida caseira, alimentos próprios,
  análise de texto livre ("o que comeu") e envio. Em modo personal aparece o aviso do CRN.

`/testar?k=<TESTER_PASS>` também libera a IA real, quando ela estiver ligada. Sem IA, fichas e cardápios
saem do motor do próprio app (`src/lib/domain`) e a interface não promete IA. Para ligar: cadastre um
cartão em Vercel → AI Gateway (a variável `AI_GATEWAY=1` já usa o token do deploy) ou defina
`ANTHROPIC_API_KEY`.

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
   | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` / `NEXT_PUBLIC_POSTHOG_HOST` (opcional) | PostHog → Project settings (token público do projeto) |
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

## Métricas e erros (PostHog)

Com `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` o app envia eventos de uso e erros pelo proxy `/ingest` (rewrites em
`next.config.ts`). Sem o token nada é enviado. Iniciado em `src/instrumentation-client.ts`; eventos em `src/lib/analytics.ts`.

- **Funil de ativação:** `signup_started → signup_completed → onboarding_completed → program_generated → workout_started → workout_completed`.
- **Personal (modo teste):** `tester_started → student_created → program_generated / program_assigned → program_edited → program_shared → view_as_student → workout_completed`, mais
  `assessment_logged`, `diet_generated`, `diet_saved`, `diet_shared`, `diet_analyzed`, `program_copied`, `custom_exercise_created`, `custom_food_created`, `student_contacted`.
- **Recursos do treino:** `session_feature_used` (cronômetro de série, troca de exercício, som, descanso), `pr_achieved`.
- **Conversão:** `paywall_viewed → upgrade_clicked`; loop do personal: `student_invited → invite_accepted`.
- **Erros:** exceções não tratadas (captura automática), telas derrubadas (`error.tsx`, `global-error.tsx`), erros tratados com o local
  (`reportError`), respostas de erro das rotas e falhas inesperadas da IA no servidor (`src/instrumentation.ts`, `src/lib/posthog-server.ts`).

Todo evento leva `app_mode` (teste, demo, local, conta), `app_role` e `viewing_as_student`. Privacidade: nenhum dado de saúde, nome,
telefone ou texto digitado vai nas propriedades; o texto dos elementos clicados é mascarado; gravação de sessão desligada.
