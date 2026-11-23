"""Sobe os vídeos da promoção R$14,99 (promo_tutorial.py) e agenda cada um como Reels + Story no Instagram,
3 por dia (o 1º agora). Não duplica: vídeo já agendado (options.promo = nome do arquivo) é pulado.

    python3 promo_post.py <pasta_com_mp4>
"""
import datetime as dt
import os
import sys

from worker import URL, http, rest

BRT = dt.timezone(dt.timedelta(hours=-3))
SLOTS = [(11, 40), (18, 40), (21, 10)]
HOOKS = ["BAIXOU! Pins de R$17,99 agora por R$14,99 💥", "Pins por R$14,99? Te mostro onde achar 👇", "274 pins em promoção na Brax 🔥",
         "Ache a promoção da Brax em 10 segundos ⏱️", "Seu pin favorito ficou mais barato 😍", "Não pague R$17,99 no seu pin! 🚫",
         "Onde tá a promoção da Brax? 👀"]
HOW = {"google": "É só pesquisar \"Brax Pins Mania\" no Google, entrar no site, tocar no menu (canto esquerdo) e ir em Produtos em promoção.",
       "instagram": "É só tocar no link da bio, abrir o menu (canto esquerdo) e ir em Produtos em promoção."}
TAGS = "#braxpinsmania #pins #zegotinha #sus #promoção #pinscolecionaveis"


def order():
    out = []
    for j in range(7):
        out += [2 * j, 2 * j + 15, 2 * j + 1, 2 * j + 14]  # índices 0-based: escuro google, claro insta, escuro insta, claro google
    return out


def schedule(n):
    now = dt.datetime.now(BRT)
    times = [now + dt.timedelta(minutes=3)]
    day = now.date()
    while len(times) < n:
        for h, m in SLOTS:
            t = dt.datetime(day.year, day.month, day.day, h, m, tzinfo=BRT)
            if t > times[-1] + dt.timedelta(hours=2) and len(times) < n:
                times.append(t)
        day += dt.timedelta(days=1)
    return times


def main(folder):
    user = rest("GET", "brand_settings?select=user_id&brand_name=eq.Brax%20Pins%20Mania&limit=1")[0]["user_id"]
    files = {f.split("-")[2]: f for f in os.listdir(folder) if f.startswith("brax-promo-") and f.endswith(".mp4")}
    done = {p["options"].get("promo") for p in rest("GET", "posts?select=options&options->>source=eq.promo1499") or []}
    todo = [i for i in order() if f"{i + 1:02d}" in files and files[f"{i + 1:02d}"] not in done]
    for i, when in zip(todo, schedule(len(todo))):
        name = files[f"{i + 1:02d}"]
        with open(os.path.join(folder, name), "rb") as f:
            data = f.read()
        path = f"{user}/promo/{name}"
        http("POST", f"{URL}/storage/v1/object/media/{path}", data, {"Content-Type": "video/mp4", "x-upsert": "true"}, raw=True)
        url = f"{URL}/storage/v1/object/public/media/{path}"
        way = "google" if "google" in name else "instagram"
        caption = f"{HOOKS[(i // 2) % 7]}\n\n{HOW[way]}\nEntregamos para todo o Brasil 🚚\n\n{TAGS}"
        base = {"user_id": user, "media": [{"url": url, "type": "video"}], "scheduled_at": when.isoformat(), "status": "scheduled",
                "created_by": "agent", "platforms": ["instagram"], "options": {"source": "promo1499", "promo": name}}
        rest("POST", "posts", {**base, "title": f"Promo R$14,99 · {name[11:13]} · Reels", "caption": caption, "kind": "reel"})
        rest("POST", "posts", {**base, "title": f"Promo R$14,99 · {name[11:13]} · Story", "caption": "", "kind": "story",
                               "options": {"source": "promo1499", "promo": name + "#story"}})
        print(f"{when:%d/%m %H:%M}  {name}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
