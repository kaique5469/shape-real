import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Shape Real",
    short_name: "Shape Real",
    description: "Ficha de treino, registro de cargas, evolução e dieta. Para personal trainers, alunos e quem treina sozinho.",
    start_url: "/hoje",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f2ee",
    theme_color: "#12151a",
    lang: "pt-BR",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Treino de hoje", short_name: "Hoje", url: "/hoje" },
      { name: "Histórico de treinos", short_name: "Histórico", url: "/historico" },
    ],
  };
}
