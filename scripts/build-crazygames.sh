#!/usr/bin/env bash
# Gera site/jogos/block-pop-crazygames.zip (index.html + assets) para enviar no portal do CrazyGames.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vite build --config vite.crazygames.config.ts
cd dist-crazygames
mv jogo.html index.html
# SDK do CrazyGames antes do jogo (o jogo funciona sem ele: fora do portal os anúncios viram simulação)
sed -i 's#<script type="module" crossorigin#<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n    <script defer#' index.html
mkdir -p ../site/jogos
rm -f ../site/jogos/block-pop-crazygames.zip
zip -qr ../site/jogos/block-pop-crazygames.zip .
echo "pronto: site/jogos/block-pop-crazygames.zip"
