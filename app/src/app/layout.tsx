import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa";
import { AppProvider } from "@/lib/app-context";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://app.shapereal.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Shape Real — ficha de treino, cargas e evolução", template: "%s · Shape Real" },
  description:
    "Ficha montada por regras que você entende e edita, no sistema que você gosta (ABC, Upper/Lower, PPL, 5×5). Registre cada carga e acompanhe a evolução. Personal: envie ficha e dieta pelo WhatsApp e acompanhe seus alunos.",
  applicationName: "Shape Real",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Shape Real",
    title: "Shape Real — sua ficha de treino, agora com memória",
    description: "Ficha montada por regras que você entende e edita, registro de cargas, evolução, dieta e área do personal. Grátis no beta.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Shape Real", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#12151a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppProvider>{children}</AppProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
