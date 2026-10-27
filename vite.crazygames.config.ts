// Versão do Block Pop para o CrazyGames: só o jogo, caminhos relativos (o portal hospeda numa pasta dele), sem a
// pasta public do Studio. scripts/build-crazygames.sh põe o SDK e gera o .zip para enviar.
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: false,
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    outDir: "dist-crazygames",
    emptyOutDir: true,
    // sem minificar: código legível (antivírus do navegador desconfia de JS compactado dentro de .zip)
    minify: false,
    modulePreload: false,
    // script comum (não módulo): abre até com dois cliques no arquivo (file://), que bloqueia módulos
    rollupOptions: { input: { jogo: path.resolve(__dirname, "jogo.html") }, output: { format: "iife" } },
  },
});
