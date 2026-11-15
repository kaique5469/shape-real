import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="plate-type text-[2.2rem] leading-tight">{title}</h1>
        <p className="mt-2 text-sm text-steel">Atualizado em {updated}</p>
        <div className="mt-8 space-y-5 leading-relaxed text-iron [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:max-w-[68ch]">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
