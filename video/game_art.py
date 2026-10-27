"""Arte do jogo Castle Rescue: gera as ilustrações (Cloudflare/Pollinations, os mesmos do canal) e recorta o fundo.

Salva em art/<nome>-<n>.png (2 opções de cada, para escolher) e publica na branch "game-art".
Uso: python3 video/game_art.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import youtube as yt  # noqa: E402
from yt_styles import cutout  # noqa: E402

STYLE = ("bright glossy casual mobile puzzle game art, 3D cartoon render, soft studio lighting, vivid saturated colors, "
         "clean edges, high detail, centered, isolated on a plain pure white background, no text, no watermark")
BG = "bright casual mobile game background art, 3D cartoon render, vivid colors, no characters, no text"

# nome, prompt, largura, altura, recortar o fundo?
ASSETS = [
    ("king", "full body cute chubby cartoon king character standing, big golden crown with red gems, round friendly face, "
             "big expressive eyes, white fluffy beard, purple royal robe with gold trim and white fur collar, small red cape, "
             "front view, game character", 768, 1024, True),
    ("king-scared", "full body cute chubby cartoon king character, terrified scared expression, mouth wide open, hands on cheeks, "
                    "big golden crown with red gems, white fluffy beard, purple royal robe with gold trim and white fur collar, "
                    "front view, game character", 768, 1024, True),
    ("king-happy", "full body cute chubby cartoon king character jumping with joy, arms raised, huge smile, "
                   "big golden crown with red gems, white fluffy beard, purple royal robe with gold trim and white fur collar, "
                   "front view, game character", 768, 1024, True),
    ("dragon", "cute but menacing cartoon green dragon head and neck peeking up, big yellow eyes, small horns, open mouth with teeth, "
               "game villain character, front view", 1024, 768, True),
    ("crown", "single shiny golden crown game icon, chunky, glossy", 512, 512, True),
    ("leaf", "single shiny green leaf game icon, chunky, glossy", 512, 512, True),
    ("ruby", "single shiny red square cut ruby gem game icon, chunky, glossy", 512, 512, True),
    ("drop", "single shiny blue water drop game icon, chunky, glossy", 512, 512, True),
    ("castle", "inside a medieval castle dungeon, light stone brick wall, torches with warm light, golden trims, cozy", 768, 1344, False),
    ("stone", "seamless texture of dark grey castle stone blocks wall, flat front view, game texture", 512, 512, False),
]


def main():
    os.makedirs("art", exist_ok=True)
    for name, prompt, w, h, cut in ASSETS:
        for n in (1, 2):
            raw = f"art/{name}-{n}.jpg"
            style = BG if name in ("castle", "stone") else STYLE
            ok = yt.image(prompt, w, h, raw, seed=4242 + n * 97 + len(name), style=style)
            yt.log(f"{name}-{n}: {ok}")
            if not ok:
                continue
            if cut:
                if cutout(raw, f"art/{name}-{n}.png"):
                    os.remove(raw)


if __name__ == "__main__":
    main()
