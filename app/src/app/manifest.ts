import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shape Real",
    short_name: "Shape Real",
    description: "Ficha de treino com IA, registro de cargas, evolução e dieta.",
    start_url: "/hoje",
    display: "standalone",
    background_color: "#f1f2ee",
    theme_color: "#12151a",
    lang: "pt-BR",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
