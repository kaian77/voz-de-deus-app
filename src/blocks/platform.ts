// Ponte com o portal de jogos (CrazyGames). Fora do portal (nosso link) tudo vira simulação/sem efeito.
// No CrazyGames: SDK v3 (window.CrazyGames.SDK) carregado pelo jogo.html da versão do portal (build:crazygames).

type Sdk = {
  init: () => Promise<void>;
  environment: string;
  ad: { requestAd: (kind: "midgame" | "rewarded", cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }) => void };
  game: { gameplayStart: () => void; gameplayStop: () => void; loadingStart?: () => void; loadingStop?: () => void };
};
declare global {
  interface Window {
    CrazyGames?: { SDK: Sdk };
  }
}

let sdk: Sdk | null = null;
let playing = false;

export async function initPlatform() {
  const s = window.CrazyGames?.SDK;
  if (!s) return;
  try {
    await s.init();
    if (s.environment === "disabled") return;
    sdk = s;
  } catch {
    sdk = null;
  }
}
export const onPortal = () => !!sdk;

/** Avisa o portal quando a pessoa está jogando (ele usa para medir e para não mostrar anúncio no meio da jogada). */
export function gameplay(on: boolean) {
  if (!sdk || on === playing) return;
  playing = on;
  try {
    if (on) sdk.game.gameplayStart();
    else sdk.game.gameplayStop();
  } catch { /* ignora */ }
}

/**
 * Anúncio. rewarded = "ver vídeo para continuar" (recompensa em done); midgame = entre partidas.
 * Sem portal: devolve false e o jogo faz a simulação dele. Anúncio que falha (adblock, sem anúncio) também libera.
 */
export function showAd(kind: "midgame" | "rewarded", hooks: { start?: () => void; done: (ok: boolean) => void }) {
  if (!sdk) return false;
  gameplay(false);
  try {
    sdk.ad.requestAd(kind, {
      adStarted: () => hooks.start?.(),
      adFinished: () => hooks.done(true),
      adError: () => hooks.done(kind === "midgame"),
    });
  } catch {
    hooks.done(kind === "midgame");
  }
  return true;
}
