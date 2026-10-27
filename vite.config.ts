import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // NEXT_PUBLIC_* é o prefixo que a integração Supabase da Vercel usa para as chaves públicas.
  // Nunca adicione "SUPABASE_" aqui: exporia a service_role no navegador.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // tour3d.html = Tour 3D da PáginasPro (/3d/<slug>, rewrite no vercel.json), página separada do Studio.
  build: {
    rollupOptions: {
      input: { main: path.resolve(__dirname, "index.html"), tour3d: path.resolve(__dirname, "tour3d.html"), corrida: path.resolve(__dirname, "corrida.html"), montagem: path.resolve(__dirname, "montagem.html"), jogo: path.resolve(__dirname, "jogo.html"), resgate: path.resolve(__dirname, "resgate.html") },
    },
  },
}));
