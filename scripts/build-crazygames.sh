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
# Versão em um arquivo só (o código dentro do index.html): para quando o navegador/antivírus bloqueia o .zip.
# Basta baixar esse arquivo, renomear para index.html e compactar no próprio computador.
python3 - <<'PY'
import glob, re
js = open(glob.glob("assets/*.js")[0], encoding="utf-8").read().replace("</script", "<\\/script")
html = open("index.html", encoding="utf-8").read()
html = re.sub(r'<script defer src="\./assets/[^"]+"></script>', lambda _: "<script>window.addEventListener('DOMContentLoaded',function(){\n" + js + "\n});</script>", html)
open("../site/jogos/block-pop-index.html", "w", encoding="utf-8").write(html)
PY
echo "pronto: site/jogos/block-pop-index.html"
# Mesma versão de um arquivo só publicada no nosso site (opção "Hospedado externamente (iframe)" do portal):
# https://voz-de-deus-app.vercel.app/crazygames/index.html
mkdir -p ../public/crazygames
cp ../site/jogos/block-pop-index.html ../public/crazygames/index.html
echo "pronto: public/crazygames/index.html"
