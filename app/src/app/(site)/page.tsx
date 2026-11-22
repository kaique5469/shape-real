import { Brain, CalendarRange, Camera, ClipboardList, Dumbbell, FileSpreadsheet, LineChart as LineIcon, Send, ShieldCheck, Timer, Users } from "lucide-react";
import { HeroFicha } from "@/components/landing/hero-ficha";
import { SystemPicker } from "@/components/landing/system-picker";
import { DietDemo } from "@/components/landing/diet-demo";
import { DemoButton } from "@/components/landing/demo-button";
import { CoachMock, EvolutionMock, SessionPhone } from "@/components/landing/mocks";
import { Pricing } from "@/components/landing/pricing";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { LinkButton } from "@/components/ui";
import { PLANS } from "@/lib/domain/plans";

const FAQ = [
  {
    q: "É grátis mesmo?",
    a: "Sim. Durante o beta, tudo está liberado de graça para personais e alunos, sem limite de alunos, fichas, fotos ou exportação. Os planos pagos só passam a valer depois do beta, com aviso antes.",
  },
  {
    q: "A IA substitui um personal?",
    a: "Não. A IA monta uma ficha sólida para o seu objetivo, tempo e equipamento, e o app conduz a progressão de carga. Um personal enxerga técnica, ajusta por lesão e cobra constância — por isso o Shape Real tem uma área inteira para personais acompanharem alunos.",
  },
  {
    q: "Posso usar o sistema de treino que eu gosto?",
    a: "Pode. ABC, ABCD, ABCDE, AB, Upper/Lower, Push/Pull/Legs (3 ou 6 dias), Full Body e Força 5×5. A IA gera no sistema escolhido e você edita qualquer exercício, série, repetição ou carga.",
  },
  {
    q: "Como funciona para o personal?",
    a: "Você cadastra o aluno, monta a ficha e a dieta e toca em “Enviar para o celular do aluno”. Ele recebe um link no WhatsApp, abre no celular dele e passa a treinar pelo app, sem cadastro. No fim de cada treino, ele manda o resultado de volta e você registra no seu painel com um toque: frequência, cargas e relatório de evolução se atualizam sozinhos.",
  },
  {
    q: "Meus dados de saúde ficam seguros?",
    a: "Medidas, fotos e dieta são dados sensíveis pela LGPD. No beta, tudo fica guardado no seu próprio celular, sem cadastro e sem servidor: só circula o que você mesmo envia pelo WhatsApp. Você pode exportar um backup, restaurar em outro aparelho ou apagar tudo quando quiser.",
  },
  {
    q: "Funciona no celular na academia?",
    a: "Funciona direto no navegador e pode ser instalado na tela inicial como app. A tela de treino foi feita para usar entre as séries: números grandes, timer de descanso automático e cálculo de anilhas por lado.",
  },
];

export default function Landing() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Shape Real",
    applicationCategory: "HealthApplication",
    operatingSystem: "Web, Android, iOS",
    inLanguage: "pt-BR",
    description: "Ficha de treino com IA, registro de cargas, evolução, dieta e área para personal trainers.",
    offers: [PLANS.free, PLANS.pro, PLANS.coach].map((p) => ({ "@type": "Offer", name: p.name, price: p.priceMonthly.toFixed(2), priceCurrency: "BRL" })),
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <>
      <SiteHeader />
      <main id="conteudo">
        {/* Primeira dobra: a ficha que lembra cada carga */}
        <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-16 pt-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:pb-24 lg:pt-16">
          <div className="animate-rise">
            <h1 className="plate-type text-[2.35rem] leading-[0.98] text-balance sm:text-[3.6rem] lg:text-[4.1rem]">
              Sua ficha de treino, agora com <span className="text-plate-red">memória</span>.
            </h1>
            <p className="mt-4 max-w-[34rem] text-base leading-relaxed text-steel sm:mt-5 sm:text-[1.0625rem]">
              A IA monta a ficha no sistema que você gosta. O app lembra cada carga que você levantou e avisa a hora de subir o peso. Para quem treina sozinho e para personais que acompanham alunos.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 sm:mt-7">
              <LinkButton href="/entrar?modo=criar" size="lg">
                Começar grátis
              </LinkButton>
              <DemoButton role="athlete" variant="secondary" size="lg">
                Ver por dentro
              </DemoButton>
            </div>
            <p className="mt-4 text-sm text-steel">Sem cartão. Funciona no celular, direto do navegador.</p>
          </div>
          <HeroFicha />
        </section>

        {/* Sistemas de treino */}
        <section id="como-funciona" className="border-t border-rule bg-chalk-2/60">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-24">
            <div className="max-w-2xl">
              <h2 className="plate-type text-[2rem] leading-tight text-balance sm:text-[2.6rem]">Monte no sistema que você gosta. A IA faz o resto.</h2>
              <p className="mt-4 text-[1.0625rem] text-steel">
                Diga objetivo, nível, quantos dias e quanto tempo você tem, o equipamento disponível e se sente alguma dor. A ficha sai pronta em segundos — e continua editável, exercício por exercício.
              </p>
            </div>
            <div className="mt-10">
              <SystemPicker />
            </div>
          </div>
        </section>

        {/* Durante o treino */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[auto_1fr] lg:gap-20">
            <SessionPhone />
            <div>
              <h2 className="plate-type text-[2rem] leading-tight text-balance sm:text-[2.6rem]">Feito para usar entre uma série e outra.</h2>
              <dl className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
                {[
                  [ClipboardList, "A última vez na tela", "Carga e repetições do treino anterior ao lado de cada exercício. Nada de lembrar de cabeça."],
                  [Dumbbell, "Quando subir o peso", "Bateu o topo da faixa em todas as séries? O app sugere a próxima carga. Falhou? Sugere ajustar."],
                  [Timer, "Descanso automático", "Marcou a série, o timer começa. Vibra quando é hora de voltar."],
                  [CalendarRange, "Anilhas por lado", "Digite 82,5 kg e veja exatamente o que colocar em cada lado da barra."],
                ].map(([Icon, t, d]) => {
                  const I = Icon as typeof Timer;
                  return (
                    <div key={t as string}>
                      <dt className="flex items-center gap-2 text-[1.0625rem] font-bold">
                        <I className="size-5 text-plate-red" aria-hidden />
                        {t as string}
                      </dt>
                      <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-steel">{d as string}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>
        </section>

        {/* Evolução */}
        <section className="border-y border-rule bg-paper">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[minmax(0,1fr)_1.1fr] lg:py-24">
            <div>
              <h2 className="plate-type text-[2rem] leading-tight text-balance sm:text-[2.6rem]">Evolução que dá para ver, não só sentir.</h2>
              <p className="mt-4 text-[1.0625rem] text-steel">
                Cada série vira dado: força estimada por exercício, volume semanal, recordes, peso, medidas e fotos lado a lado. Exporte tudo para Excel quando quiser.
              </p>
              <ul className="mt-7 space-y-3 text-[0.9375rem]">
                {[
                  [LineIcon, "1RM estimado e recordes por exercício"],
                  [Camera, "Fotos de frente, lado e costas com comparação"],
                  [FileSpreadsheet, "Planilha completa no formato do Excel brasileiro"],
                ].map(([Icon, t]) => {
                  const I = Icon as typeof Camera;
                  return (
                    <li key={t as string} className="flex items-center gap-3">
                      <I className="size-5 shrink-0 text-plate-blue" aria-hidden />
                      {t as string}
                    </li>
                  );
                })}
              </ul>
            </div>
            <EvolutionMock />
          </div>
        </section>

        {/* Dieta */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:py-24">
          <div className="max-w-2xl">
            <h2 className="plate-type text-[2rem] leading-tight text-balance sm:text-[2.6rem]">Dieta sem planilha de nutricionista.</h2>
            <p className="mt-4 text-[1.0625rem] text-steel">
              O app calcula suas metas de calorias e proteína. Escreva o que você comeu como mandaria no WhatsApp — o Shape Real entende porções caseiras e mostra o que ajustar. Teste aqui:
            </p>
          </div>
          <div className="mt-8">
            <DietDemo />
          </div>
        </section>

        {/* Personal */}
        <section id="personal" className="bg-iron text-chalk">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[minmax(0,1fr)_1.15fr] lg:py-24">
            <div>
              <h2 className="plate-type text-[2rem] leading-tight text-balance sm:text-[2.6rem]">Personal: todos os alunos numa planilha viva.</h2>
              <p className="mt-4 text-[1.0625rem] text-chalk/70">
                Pare de mandar ficha em PDF e cobrar foto de carga pelo WhatsApp. Envie ficha e dieta pelo app e veja quem treinou, quanto levantou e quem sumiu.
              </p>
              <ul className="mt-7 space-y-3.5 text-[0.9375rem]">
                {[
                  [Send, "Convite por código ou link no WhatsApp"],
                  [Brain, "Ficha com IA em segundos — você revisa e envia"],
                  [Users, "Painel de aderência com alerta de aluno parado"],
                  [ShieldCheck, `Alunos usam recursos Pro sem pagar, até ${PLANS.coach.maxStudents} no plano Personal`],
                ].map(([Icon, t]) => {
                  const I = Icon as typeof Send;
                  return (
                    <li key={t as string} className="flex items-center gap-3">
                      <I className="size-5 shrink-0 text-plate-yellow" aria-hidden />
                      {t as string}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="/entrar?modo=criar&perfil=personal" size="lg" className="!bg-chalk !text-iron hover:!bg-white">
                  Criar conta de personal
                </LinkButton>
                <DemoButton role="coach" variant="ghost" size="lg" className="!text-chalk ring-1 ring-white/30 hover:!bg-white/10">
                  Ver painel de exemplo
                </DemoButton>
              </div>
            </div>
            <CoachMock />
          </div>
        </section>

        {/* Planos */}
        <section id="planos" className="mx-auto max-w-6xl px-4 py-16 lg:py-24">
          <h2 className="plate-type text-[2rem] leading-tight sm:text-[2.6rem]">Comece grátis. Pague quando fizer sentido.</h2>
          <p className="mt-3 max-w-2xl text-[1.0625rem] text-steel">Registro de treino ilimitado em todos os planos. Os pagos liberam IA, fotos e a área do personal.</p>
          <p className="mt-4 max-w-2xl rounded-[var(--radius-ficha)] border border-plate-yellow/60 bg-plate-yellow/15 px-4 py-3 text-[0.9375rem]">
            <strong>Beta aberto:</strong> enquanto o app está em teste, todos os recursos estão liberados de graça. Os preços abaixo valem só depois do beta, com aviso antes.
          </p>
          <div className="mt-8">
            <Pricing />
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-rule bg-paper">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[minmax(0,1fr)_2fr] lg:py-24">
            <h2 className="plate-type text-[2rem] leading-tight sm:text-[2.4rem]">Perguntas frequentes</h2>
            <div className="ruled border-y border-rule">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.0625rem] font-semibold">
                    {f.q}
                    <span className="plate-type text-xl text-plate-red transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-2.5 max-w-[65ch] leading-relaxed text-steel">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center lg:py-20">
          <h2 className="plate-type mx-auto max-w-3xl text-[2.2rem] leading-tight text-balance sm:text-[3rem]">O próximo treino já pode ter a carga certa.</h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <LinkButton href="/entrar?modo=criar" size="lg">
              Começar grátis
            </LinkButton>
            <DemoButton role="athlete" variant="secondary" size="lg">
              Ver por dentro
            </DemoButton>
          </div>
        </section>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, faqLd]) }} />
    </>
  );
}
