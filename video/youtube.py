#!/usr/bin/env python3
"""Vídeos do canal automático do YouTube (Renda extra) — roda no GitHub Actions (workflow "Vídeos do YouTube").

Fila: tabela yt_videos com status "queued" (roteiro pronto, escrito pela IA no Supabase). Para cada vídeo:
1. narração cena a cena com voz neural grátis (edge-tts), guardando o tempo de cada palavra;
2. uma imagem por cena (estilo animação 3D de personagens bíblicos) pelo Pollinations (grátis), com o
   Cloudflare Workers AI de reserva (CF_ACCOUNT_ID + CF_API_TOKEN, plano grátis);
3. cada imagem ganha movimento (zoom/pan suave), as cenas se juntam com transição e entram legendas palavra a palavra
   (estilo TikTok no Short, embaixo no longo), trilha suave original e capítulos na descrição do longo;
4. capa com imagem dramática + texto grande;
5. envio ao YouTube (agendado para publish_at) e capa; a capa também vai para o storage para aparecer no Studio.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
(opcionais: POLLINATIONS_TOKEN, CF_ACCOUNT_ID, CF_API_TOKEN). Uso: python3 video/youtube.py [--check]
"""
import asyncio
import datetime as dt
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

from worker import KEY, URL, http, rest
import yt_styles

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "engine", "assets", "fonts")
MAX_ATTEMPTS = 3
FPS = 30
XF = 0.45  # transição entre cenas (s)
PAUSE = 0.30  # respiro depois de cada fala (s)
SR = 24000
STYLE = (
    "3D animated movie still, Pixar and Disney style, stylized biblical characters with very expressive faces, dynamic pose, "
    "epic cinematic composition, dramatic warm lighting with god rays, rich vibrant colors, depth of field, highly detailed, "
    "no text, no letters, no watermark"
)
# Estilo cinemático: frame de filme bíblico realista (como os canais de "Bible stories" que viralizam)
CINEMATIC = (
    "cinematic film still from a biblical epic movie, photorealistic, real people, natural skin texture, shot on ARRI Alexa, "
    "anamorphic 35mm lens, shallow depth of field, warm golden hour sunlight, dust in the air, ancient Israel, "
    "muted earthy tones, film grain, highly detailed, no text, no letters, no watermark"
)


# Estilo colagem (estilo Vox): gravuras antigas em P&B que viram fotos recortadas; mapas antigos para as rotas
COLLAGE = ("vintage 19th century engraving illustration, black and white etching, crosshatching, high contrast, "
           "single clear subject, plain light background, no text, no letters, no watermark")
COLLAGE_MAP = ("antique hand-drawn parchment map, old cartography, sepia ink, coastlines and mountains, top-down view, "
               "no text, no letters, no labels, no watermark")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------------------------------------ fila

def queued(limit=4):
    return rest("GET", f"yt_videos?status=eq.queued&attempts=lt.{MAX_ATTEMPTS}&order=publish_at&limit={limit}&select=*") or []


def requeue_stuck():
    limit = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)).isoformat()
    rest("PATCH", f"yt_videos?status=eq.rendering&kind=neq.clip&updated_at=lt.{urllib.parse.quote(limit)}", {"status": "queued"})


def patch(vid, **fields):
    fields["updated_at"] = now()
    rest("PATCH", f"yt_videos?id=eq.{vid}", fields)


# ------------------------------------------------------------------------------------------------ Google

def google_token(channel_ref):
    row = (rest("GET", f"yt_tokens?channel_ref=eq.{channel_ref}&select=*") or [None])[0]
    if not row:
        raise RuntimeError("canal sem token; conecte de novo no Studio")
    body = urllib.parse.urlencode({
        "client_id": os.environ["GOOGLE_CLIENT_ID"], "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "refresh_token": row["refresh_token"], "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Google recusou o token ({e.read()[:200].decode(errors='replace')}); conecte o canal de novo") from None
    rest("PATCH", f"yt_tokens?channel_ref=eq.{channel_ref}", {
        "access_token": data["access_token"], "updated_at": now(),
        "expires_at": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=data["expires_in"])).isoformat(),
    })
    return data["access_token"]


def upload_video(token, path, meta):
    """Envio resumível: cria a sessão com os metadados e manda o arquivo inteiro."""
    size = os.path.getsize(path)
    req = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        data=json.dumps(meta).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            session = r.headers["Location"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"YouTube recusou o envio: {e.read()[:300].decode(errors='replace')}") from None
    with open(path, "rb") as f:
        put = urllib.request.Request(session, data=f.read(), method="PUT", headers={"Content-Type": "video/mp4", "Content-Length": str(size)})
    try:
        with urllib.request.urlopen(put, timeout=1800) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"YouTube recusou o vídeo: {e.read()[:300].decode(errors='replace')}") from None


def set_thumbnail(token, video_id, path):
    with open(path, "rb") as f:
        data = f.read()
    req = urllib.request.Request(
        f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}", data=data, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "image/jpeg"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            r.read()
        return None
    except urllib.error.HTTPError as e:
        msg = e.read()[:300].decode(errors="replace")
        # Canal sem verificação por telefone não pode trocar a capa: o vídeo sai do mesmo jeito
        return "Capa não enviada: verifique o canal por telefone em youtube.com/verify" if e.code == 403 else f"Capa: {msg}"


def storage_upload(path, dest, ctype):
    with open(path, "rb") as f:
        http("POST", f"{URL}/storage/v1/object/media/{dest}", f.read(), {"Content-Type": ctype, "x-upsert": "true"}, raw=True)
    return f"{URL}/storage/v1/object/public/media/{dest}"


# ------------------------------------------------------------------------------------------------ voz

async def _speak(text, voice, mp3):
    import edge_tts

    try:
        comm = edge_tts.Communicate(text, voice, rate="+6%", boundary="WordBoundary")
    except TypeError:  # versões antigas já mandam palavra a palavra
        comm = edge_tts.Communicate(text, voice, rate="+6%")
    words = []
    with open(mp3, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7, "w": chunk["text"]})
    return words


def speak(text, voice, mp3):
    for attempt in range(4):
        try:
            words = asyncio.run(_speak(text, voice, mp3))
            if os.path.getsize(mp3) > 1000:
                return words
        except Exception as e:  # o serviço de voz às vezes corta a conexão
            log(f"    voz: {e}")
        time.sleep(3 + attempt * 4)
    raise RuntimeError("a narração falhou")


def pcm(path):
    """Áudio -> amostras mono float32 em SR Hz."""
    import numpy as np

    out = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(out, dtype=np.int16).astype(np.float32) / 32768


def music_bed(seconds):
    """Trilha original suave (acordes longos, sem bateria), por síntese — livre de direitos."""
    import numpy as np

    n = int(seconds * SR) + SR
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float32)
    chords = [(261.63, 329.63, 392.0), (220.0, 261.63, 329.63), (174.61, 220.0, 261.63), (196.0, 246.94, 293.66)]
    bar = 4.0
    for i in range(int(seconds / bar) + 2):
        a, b = int(i * bar * SR), int(min(n, (i * bar + bar + 1.5) * SR))
        if a >= n:
            break
        tt = t[: b - a]
        env = np.minimum(1, tt / 1.2) * np.minimum(1, np.maximum(0, (bar + 1.5 - tt) / 1.5))
        for f in chords[i % 4]:
            out[a:b] += (np.sin(2 * np.pi * f / 2 * tt) + 0.35 * np.sin(2 * np.pi * f * tt * 1.003)) * env * 0.08
    # Pulsação grave suave (80 bpm) para dar ritmo sem brigar com a voz
    beat = 60 / 80
    kick_t = np.arange(int(0.5 * SR)) / SR
    kick = np.sin(2 * np.pi * (55 + 40 * np.exp(-kick_t * 18)) * kick_t) * np.exp(-kick_t * 7) * 0.35
    for k in range(int(seconds / beat) + 1):
        a = int(k * beat * SR)
        if a >= n:
            break
        seg = kick[: n - a]
        out[a:a + len(seg)] += seg * (1.0 if k % 4 == 0 else 0.55)
    return out[: int(seconds * SR)] / (np.abs(out).max() + 1e-9) * 0.5


def sfx_whoosh(seconds=0.45):
    """Whoosh de transição: ruído filtrado com envelope (síntese, livre de direitos)."""
    import numpy as np

    n = int(seconds * SR)
    noise = np.random.default_rng(7).standard_normal(n).astype(np.float32)
    k = 24
    low = np.convolve(noise, np.ones(k) / k, mode="same")
    env = np.sin(np.linspace(0, np.pi, n)) ** 2
    return (low * env / (np.abs(low).max() + 1e-9)).astype(np.float32)


def sfx_impact():
    """Batida grave para o gancho do começo."""
    import numpy as np

    t = np.arange(int(1.0 * SR)) / SR
    boom = np.sin(2 * np.pi * (45 + 60 * np.exp(-t * 10)) * t) * np.exp(-t * 4)
    hit = np.random.default_rng(3).standard_normal(len(t)) * np.exp(-t * 30) * 0.3
    return ((boom + hit) / 1.3).astype(np.float32)


def particles(w, h, out, seconds=4.0, fps=15):
    """Camada de partículas de luz/poeira subindo (loop de 4 s, com transparência) para dar vida às cenas."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter

    sw, sh = w // 3, h // 3
    rng = np.random.default_rng(11)
    count = 45
    xs, ys = rng.uniform(0, sw, count), rng.uniform(0, sh, count)
    rs = rng.uniform(0.8, 2.6, count)
    vy = rng.uniform(sh * 0.04, sh * 0.12, count)  # px por segundo
    phase = rng.uniform(0, 2 * np.pi, count)
    frames = int(seconds * fps)
    folder = os.path.join(os.path.dirname(out), "pt")
    os.makedirs(folder, exist_ok=True)
    for f in range(frames):
        t = f / fps
        im = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for i in range(count):
            # Volta ao mesmo ponto em `seconds` (loop sem emenda)
            y = (ys[i] - vy[i] * t) % sh
            x = xs[i] + 6 * math.sin(2 * math.pi * t / seconds + phase[i])
            a = int(140 + 90 * math.sin(2 * math.pi * t / seconds * 2 + phase[i]))
            r = rs[i]
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 236, 190, max(0, min(255, a))))
        im = im.filter(ImageFilter.GaussianBlur(0.8))
        im.save(os.path.join(folder, f"p{f:03d}.png"))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", os.path.join(folder, "p%03d.png"),
                    "-c:v", "qtrle", "-pix_fmt", "argb", out], check=True)


# ------------------------------------------------------------------------------------------------ imagens

def _fetch(url, headers=None, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "BraxStudio/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "")


def _http_detail(e):
    """Motivo do erro HTTP (o corpo da resposta diz por que o serviço recusou)."""
    try:
        return f"{e} {e.read().decode(errors='replace')[:200]}" if isinstance(e, urllib.error.HTTPError) else str(e)
    except Exception:
        return str(e)


def image(prompt, w, h, path, seed, style=None):
    """Imagem da cena: Cloudflare Workers AI (grátis, quando configurado) -> Pollinations. None se nenhum conseguiu."""
    from PIL import Image

    full = f"{prompt.strip().rstrip('.')}. {STYLE if style is None else style}"[:2000]
    tries = []
    acc, cft = os.environ.get("CF_ACCOUNT_ID"), os.environ.get("CF_API_TOKEN")
    if acc and cft:
        import base64

        def cf(model, body):
            def run():
                raw, ctype = _fetch(f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/{model}",
                                    {"Authorization": f"Bearer {cft}", "Content-Type": "application/json"}, json.dumps(body).encode())
                if ctype.startswith("image/"):
                    return raw, ctype
                return base64.b64decode(json.loads(raw)["result"]["image"]), "image/jpeg"
            return run
        tries.append(("cloudflare flux", cf("@cf/black-forest-labs/flux-1-schnell", {"prompt": full, "steps": 8, "seed": seed % 2_000_000})))
        # Reserva no mesmo Cloudflare (outro modelo, devolve PNG)
        tries.append(("cloudflare sdxl", cf("@cf/bytedance/stable-diffusion-xl-lightning",
                                            {"prompt": full, "width": 768 if w < h else 1024, "height": 1024 if w < h else 768, "seed": seed % 2_000_000})))
    tok = os.environ.get("POLLINATIONS_TOKEN")
    # Pollinations põe a marca no canto de baixo sem token: pede 10% mais alto e corta essa faixa
    ph = h if tok else int(h * 1.1)
    q = urllib.parse.urlencode({"width": w, "height": ph, "model": "flux", "seed": seed, "nologo": "true", "enhance": "false"})
    tries.append(("pollinations", lambda: _fetch(
        f"https://image.pollinations.ai/prompt/{urllib.parse.quote(full)}?{q}",
        {"Authorization": f"Bearer {tok}"} if tok else None)))
    for name, fn in tries:
        for attempt in range(3):
            try:
                raw, ctype = fn()
                if len(raw) > 5000:
                    with open(path, "wb") as f:
                        f.write(raw)
                    im = Image.open(path).convert("RGB")
                    if name == "pollinations" and not tok:
                        im = im.crop((0, 0, im.width, int(im.height * 0.9)))
                    cover(im, w, h).save(path, quality=93)
                    return name
            except Exception as e:
                log(f"    imagem ({name}): {_http_detail(e)[:300]}")
                # Pedido recusado (sem crédito, limite do dia ou parâmetro): não adianta insistir neste serviço
                if isinstance(e, urllib.error.HTTPError) and e.code in (400, 401, 402, 403, 404):
                    break
            time.sleep(4 + attempt * 6)
    return None


def cover(im, w, h):
    """Recorta/escala a imagem para preencher w x h."""
    from PIL import Image

    k = max(w / im.width, h / im.height)
    im = im.resize((math.ceil(im.width * k), math.ceil(im.height * k)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def fallback_image(path, w, h, prev=None, salt=0):
    """Sem imagem nova: reaproveita uma anterior espelhada e num recorte diferente (não parece cena repetida)."""
    from PIL import Image, ImageDraw, ImageOps

    if prev and os.path.exists(prev):
        im = ImageOps.mirror(Image.open(prev).convert("RGB"))
        k = 0.72
        cw, ch = int(im.width * k), int(im.height * k)
        x = [0, im.width - cw, (im.width - cw) // 2][salt % 3]
        y = [im.height - ch, 0, (im.height - ch) // 2][salt % 3]
        cover(im.crop((x, y, x + cw, y + ch)), w, h).save(path, quality=92)
        return
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        k = y / h
        d.line([(0, y), (w, y)], fill=(int(60 + 120 * k), int(40 + 70 * k), int(20 + 30 * k)))
    im.save(path, quality=92)


# ------------------------------------------------------------------------------------------------ montagem

def hero(prompt, script):
    """Troca HERO pela aparência fixa do protagonista (o mesmo rosto em todas as cenas)."""
    cast = (script.get("cast") or "").strip().rstrip(".")
    return prompt.replace("HERO", f"the main character ({cast})" if cast else "the main character")


def clip(img, seconds, motion, w, h, out, slow=False):
    """Imagem parada -> clipe com movimento de câmera (zoom/pan com aceleração suave, como em animação).
    slow: movimento lento de câmera de cinema (cinemático)."""
    frames = max(2, round(seconds * FPS))
    k = 2 if w < h else 1.5  # vertical: mais resolução para o zoom; horizontal (longo): mais rápido
    big_w, big_h = int(w * k) // 2 * 2, int(h * k) // 2 * 2
    e = f"(3*pow(on/{frames},2)-2*pow(on/{frames},3))"  # easing in-out
    amp = 0.10 if slow else 0.22
    z = {"zoom_in": f"1.03+{amp}*{e}", "zoom_out": f"{1.03 + amp:.2f}-{amp}*{e}"}.get(motion, "1.20" if not slow else "1.10")
    if motion == "pan_left":
        x = f"(iw-iw/zoom)*(1-{e})"
    elif motion == "pan_right":
        x = f"(iw-iw/zoom)*{e}"
    else:
        x = "(iw-iw/zoom)/2"
    y = f"(ih-ih/zoom)*(0.5+0.12*({e}-0.5))"  # leve subida/descida junto
    vf = (f"scale={big_w}:{big_h},zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={w}x{h}:fps={FPS},"
          f"format=yuv420p")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", img, "-vf", vf, "-frames:v", str(frames),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out], check=True)


def join(clips, lens, out, soft=False):
    """Junta os clipes com transição (xfade); cada clipe já tem XF a mais para a sobreposição.
    soft: só fusões (cinemático, sem cortina/círculo)."""
    if len(clips) == 1:
        shutil.copy(clips[0], out)
        return
    args = ["ffmpeg", "-v", "error", "-y"]
    for c in clips:
        args += ["-i", c]
    parts, prev, offset = [], "[0:v]", 0.0
    kinds = ["fade", "dissolve"] if soft else ["fade", "smoothleft", "fadeblack", "smoothright", "dissolve", "circleopen"]
    for i in range(1, len(clips)):
        offset += lens[i - 1] - XF
        label = f"[v{i}]"
        parts.append(f"{prev}[{i}:v]xfade=transition={kinds[i % len(kinds)]}:duration={XF}:offset={offset:.3f}{label}")
        prev = label
    args += ["-filter_complex", ";".join(parts), "-map", prev, "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", out]
    subprocess.run(args, check=True)


def ass_time(s):
    s = max(0.0, s)
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def captions(words, short, w, h, path, hook=None):
    """Legendas .ass: blocos curtos com a palavra falada destacada em amarelo."""
    # Short: um pouco abaixo do meio (fora da área dos botões do app); longo: embaixo
    size, per, align, margin = (92, 3, 2, int(h * 0.30)) if short else (54, 6, 2, 70)
    head = (
        "[Script Info]\nScriptType: v4.00+\nWrapStyle: 0\n"
        f"PlayResX: {w}\nPlayResY: {h}\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Cap,Poppins,{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,{7 if short else 4},"
        f"{2 if short else 1},{align},60,60,{margin},1\n"
        f"Style: Hook,Poppins,{150 if short else 110},&H0000D7FF,&H0000D7FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,{11 if short else 8},4,8,60,60,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    # Agrupa as palavras: no máximo `per` por bloco, quebrando em pontuação
    groups, cur = [], []
    for wd in words:
        cur.append(wd)
        if len(cur) >= per or re.search(r"[.!?,;:]$", wd["w"]):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    lines = []
    for gi, g in enumerate(groups):
        nxt = groups[gi + 1][0]["t"] if gi + 1 < len(groups) else g[-1]["t"] + g[-1]["d"] + 0.4
        for i, wd in enumerate(g):
            start = wd["t"]
            end = g[i + 1]["t"] if i + 1 < len(g) else min(nxt, wd["t"] + wd["d"] + 0.6)
            txt = []
            for j, x in enumerate(g):
                t = x["w"].upper() if short else x["w"]
                t = t.replace("{", "").replace("}", "")
                txt.append(f"{{\\c&H00D7FF&}}{t}{{\\c&HFFFFFF&}}" if j == i else t)
            pop = "{\\fscx108\\fscy108\\t(0,90,\\fscx100\\fscy100)}" if short and i == 0 else ""
            lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Cap,,0,0,0,,{pop}{' '.join(txt)}")
    if hook:
        # Texto do gancho (o mesmo da capa) entra com impacto nos primeiros segundos
        txt = hook.upper().replace("{", "").replace("}", "")
        pos = f"\\pos({w // 2},{int(h * (0.16 if short else 0.10))})"
        lines.insert(0, f"Dialogue: 1,{ass_time(0.05)},{ass_time(2.4 if short else 3.2)},Hook,,0,0,0,,"
                        f"{{{pos}\\fad(0,300)\\fscx140\\fscy140\\t(0,220,\\fscx100\\fscy100)}}{txt}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(head + "\n".join(lines) + "\n")


def font(size, bold=True):
    from PIL import ImageFont

    for name in (["Anton-Regular.woff", "InterDisplay-Black.otf"] if bold else ["Poppins-Bold.ttf"]):
        try:
            return ImageFont.truetype(os.path.join(FONTS, name), size)
        except Exception:
            continue
    return ImageFont.load_default()


def thumbnail(src, text, out):
    """Capa 1280x720: imagem + escurecido à esquerda + texto enorme amarelo/branco com contorno."""
    from PIL import Image, ImageDraw, ImageEnhance

    im = cover(Image.open(src).convert("RGB"), 1280, 720)
    im = ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(1.25)).enhance(1.12)
    shade = Image.new("L", (1280, 720))
    d = ImageDraw.Draw(shade)
    for x in range(1280):
        d.line([(x, 0), (x, 720)], fill=int(max(0, 200 * (1 - x / 760))))
    im = Image.composite(Image.new("RGB", im.size, (0, 0, 0)), im, shade)
    d = ImageDraw.Draw(im)
    words = text.upper().split()
    lines, cur = [], ""
    for wd in words:  # até ~10 letras por linha
        if cur and len(cur) + 1 + len(wd) > 10:
            lines.append(cur)
            cur = wd
        else:
            cur = f"{cur} {wd}".strip()
    if cur:
        lines.append(cur)
    lines = lines[:3]
    size = 150 if len(lines) <= 2 else 118
    f = font(size)
    y = (720 - len(lines) * size * 1.02) / 2
    for i, ln in enumerate(lines):
        color = (255, 215, 0) if i == len(lines) - 1 else (255, 255, 255)
        d.text((56, y), ln, font=f, fill=color, stroke_width=10, stroke_fill=(0, 0, 0))
        y += size * 1.02
    im.save(out, quality=90)


# ------------------------------------------------------------------------------------------------ vídeo

def render(video, work, channel=None):
    import numpy as np

    script = video["script"]
    short = video["kind"] == "short"
    w, h = (1080, 1920) if short else (1920, 1080)
    if channel is None:
        channel = (rest("GET", f"yt_channels?id=eq.{video['channel_ref']}&select=voice,language,style") or [{}])[0]
    style = channel.get("style") or "parallax"
    lang = channel.get("language") or "pt"
    voices = {"pt": "pt-BR-AntonioNeural", "en": "en-US-AndrewNeural", "es": "es-MX-JorgeNeural"}
    voice = channel.get("voice") or voices.get(lang, voices["pt"])
    if not voice.startswith(lang + "-"):  # voz de outro idioma: usa a padrão do idioma do canal
        voice = voices.get(lang, voices["pt"])
    scenes = script["scenes"]
    base_seed = random.randint(1, 10_000_000)
    cine = style == "cinematic"
    collage = style == "collage"
    look = CINEMATIC if cine else None

    def look_for(sc):
        if collage:
            return COLLAGE_MAP if sc.get("layout") == "map" else COLLAGE
        return look

    clips, lens, voices, words, chapters, starts, t = [], [], [], [], [], [], 0.0
    missing = []
    for i, sc in enumerate(scenes):
        log(f"  cena {i + 1}/{len(scenes)}")
        mp3 = os.path.join(work, f"v{i}.mp3")
        ws = speak(sc["narration"], voice, mp3)
        audio = pcm(mp3)
        a_len = len(audio) / SR
        lead = 0.12
        length = lead + a_len + PAUSE + XF  # XF a mais: some na transição
        img = os.path.join(work, f"i{i}.jpg")
        prompt = hero(sc["image"], script) if cine else sc["image"]
        # Cinemático: mesma semente em todas as cenas ajuda o rosto do protagonista a sair parecido
        if not image(prompt, w, h, img, base_seed if cine else base_seed + i, style=look_for(sc)):
            missing.append((i, prompt))
        clips.append({"img": img, "length": length, "advance": length - XF, "motion": sc.get("motion") or "zoom_in",
                      "layout": sc.get("layout") or "photo", "label": sc.get("label") or ""})
        lens.append(length)
        voices.append((t + lead, audio))
        words += [{**x, "t": x["t"] + t + lead} for x in ws]
        starts.append(t)
        if sc.get("chapter"):
            chapters.append((t, sc["chapter"]))
        t += length - XF
    total = t + XF

    # Cenas sem imagem: mais uma tentativa com calma (limite por minuto dos serviços) antes de reaproveitar outra
    if missing:
        log(f"  {len(missing)} cena(s) sem imagem, tentando de novo…")
        time.sleep(30)
        missing = [(i, p) for i, p in missing
                   if not image(p, w, h, clips[i]["img"], (base_seed if cine else base_seed + i) + 7, style=look_for(scenes[i]))]
    if len(missing) > len(scenes) * 0.3:
        # Vídeo com metade das cenas repetidas não vale publicar: volta para a fila e tenta mais tarde
        raise RuntimeError(f"os geradores de imagem falharam em {len(missing)} de {len(scenes)} cenas")
    ok = [c["img"] for j, c in enumerate(clips) if j not in {i for i, _ in missing}]
    for n, (i, _) in enumerate(missing):
        # Reaproveita uma imagem boa que não é a vizinha, espelhada e noutro recorte
        far = [p for p in ok if abs(int(os.path.basename(p)[1:-4]) - i) > 1] or ok
        fallback_image(clips[i]["img"], w, h, far[(i * 3) % len(far)] if far else None, salt=n)

    silent = os.path.join(work, "video.mp4")
    log(f"  montando ({style})…")
    if style == "whiteboard":
        yt_styles.whiteboard_video(clips, w, h, silent, hand=hand_asset(work))
    elif collage:
        for i, c in enumerate(clips):  # personagem recortado vira adesivo
            if c["layout"] == "sticker":
                try:
                    c["cut"] = yt_styles.cutout(c["img"], os.path.join(work, f"cut{i}.png"))
                except Exception as e:
                    log(f"    recorte: {e}")
        yt_styles.collage_video(clips, w, h, silent, seed=base_seed % 1000)
    else:
        files = []
        for i, c in enumerate(clips):
            out = os.path.join(work, f"c{i}.mp4")
            fg = None
            if style == "parallax":
                try:
                    fg = yt_styles.cutout(c["img"], os.path.join(work, f"fg{i}.png"))
                except Exception as e:  # sem recorte: a cena sai só com o fundo em movimento
                    log(f"    recorte: {e}")
                yt_styles.parallax_clip(c["img"], fg, c["length"], c["motion"], w, h, out)
            else:
                clip(c["img"], c["length"], c["motion"], w, h, out, slow=cine)
            files.append(out)
        join(files, lens, silent, soft=cine)

    # Áudio: narração + trilha baixinha (abaixa mais quando tem voz)
    mixl = np.zeros(int((total + 1) * SR), dtype=np.float32)
    talk = np.zeros_like(mixl)
    for start, a in voices:
        i0 = int(start * SR)
        mixl[i0:i0 + len(a)] += a
        talk[i0:i0 + len(a)] = 1
    bed = music_bed(len(mixl) / SR)[: len(mixl)]
    duck = np.convolve(talk, np.ones(SR // 4) / (SR // 4), mode="same")
    mixl += bed * (0.26 - 0.13 * duck)
    # Efeitos: batida no gancho e whoosh em cada troca de cena
    imp = sfx_impact()
    mixl[: len(imp)] += imp[: len(mixl)] * 0.45
    if style == "whiteboard":
        # Lápis raspando enquanto desenha + papel amassando na troca de cena
        for st, c in zip(starts, clips):
            dt = min(c["advance"] * 0.55, 3.2 if short else 4.5)
            pen = yt_styles.sfx_pencil(dt)
            i0 = int(st * SR)
            seg = pen[: max(0, len(mixl) - i0)]
            mixl[i0:i0 + len(seg)] += seg * 0.05
        pap = yt_styles.sfx_paper()
        for st in starts[1:]:
            i0 = max(0, int((st - 0.45) * SR))
            seg = pap[: max(0, len(mixl) - i0)]
            mixl[i0:i0 + len(seg)] += seg * 0.3
    else:
        wh = sfx_whoosh()
        for st in starts[1:]:
            i0 = max(0, int((st - XF * 0.6) * SR))
            seg = wh[: max(0, len(mixl) - i0)]
            mixl[i0:i0 + len(seg)] += seg * (0.22 if short else 0.12)
    mixl = np.clip(mixl / max(1e-6, np.abs(mixl).max()) * 0.95, -1, 1)
    wav = os.path.join(work, "audio.wav")
    import wave

    with wave.open(wav, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((mixl * 32767).astype(np.int16).tobytes())

    ass = os.path.join(work, "cap.ass")
    captions(words, short, w, h, ass, hook=script.get("thumbnail_text"))
    final = os.path.join(work, "final.mp4")
    args = ["ffmpeg", "-v", "error", "-y", "-i", silent, "-i", wav]
    if style == "whiteboard":  # papel limpo: sem vinheta, grão nem partículas
        fc = f"[0:v]subtitles={ass}:fontsdir={FONTS}[s]"
        bar = 2
    elif collage:  # papel com grão de filme, sem partículas
        fc = f"[0:v]noise=alls=7:allf=t,vignette=PI/6,subtitles={ass}:fontsdir={FONTS}[s]"
        bar = 2
    else:
        # Cor mais viva + vinheta + partículas de luz + grão de filme + legendas
        pt = os.path.join(work, "particles.mov")
        particles(w, h, pt)
        args += ["-stream_loop", "-1", "-i", pt]
        grade = ("eq=saturation=0.95:contrast=1.08,colorbalance=rs=0.04:bs=-0.05:rh=0.03:bh=-0.04,vignette=PI/4.5" if cine
                 else "eq=saturation=1.12:contrast=1.05,vignette=PI/5")
        fc = (f"[0:v]{grade}[b];"
              f"[2:v]scale={w}:{h},format=rgba,colorchannelmixer=aa={0.45 if cine else 0.75}[p];"
              f"[b][p]overlay=shortest=1,noise=alls=5:allf=t,subtitles={ass}:fontsdir={FONTS}[s]")
        bar = 3
    if short:  # barra de progresso embaixo
        args += ["-f", "lavfi", "-i", f"color=c=0xFFD700:s={w}x12:r={FPS}:d={total + 1:.2f}"]
        fc += f";[{bar}:v]format=rgba[bar];[s][bar]overlay=x='-w+w*t/{total:.2f}':y='H-h':shortest=1[v]"
    else:
        fc += ";[s]null[v]"
    args += ["-filter_complex", fc, "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-preset", "medium" if short else "faster",
             "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final]
    subprocess.run(args, check=True)

    # Capa
    thumb_src = os.path.join(work, "thumb_src.jpg")
    thumb_prompt = hero(script["thumbnail_image"], script) if cine else script["thumbnail_image"]
    if not image(thumb_prompt, 1280, 720, thumb_src, base_seed if cine else base_seed + 999, style=COLLAGE if collage else look):
        shutil.copy(os.path.join(work, "i0.jpg"), thumb_src)
    thumb = os.path.join(work, "thumb.jpg")
    thumbnail(thumb_src, script["thumbnail_text"], thumb)
    return final, thumb, total, chapters, lang


def hand_asset(work):
    """Mão segurando a caneta para o estilo desenho à mão: gerada uma vez e guardada no storage."""
    path = os.path.join(work, "hand.png")
    url = f"{URL}/storage/v1/object/public/media/youtube-assets/hand-v1.png"
    try:
        raw, _ = _fetch(url, timeout=60)
        with open(path, "wb") as f:
            f.write(raw)
        return yt_styles.load_hand(path)
    except Exception:
        pass
    src = os.path.join(work, "hand_src.jpg")
    ok = image("a realistic right human hand holding a black marker pen, the pen tip pointing to the top-left corner, "
               "seen from above, hand coming from the bottom-right corner", 1024, 1024, src, 4242,
               style="photorealistic, studio light, isolated on a plain pure white background, no shadow, no text")
    if not ok:
        return None
    try:
        if not yt_styles.cutout(src, path):
            return None
        from PIL import Image

        im = Image.open(path)
        im = im.crop(im.getbbox()).resize((int(im.width * 0.55), int(im.height * 0.55)))
        im.save(path)
        storage_upload(path, "youtube-assets/hand-v1.png", "image/png")
        return yt_styles.load_hand(path)
    except Exception as e:
        log(f"  mão: {e}")
        return None


def description(script, chapters, short, lang="pt"):
    desc = script["description"].strip()
    words = {"en": ("Chapters", "References"), "es": ("Capítulos", "Referencias")}.get(lang, ("Capítulos", "Referências"))
    if not short and len(chapters) >= 3:
        fmt = lambda s: f"{int(s // 60)}:{int(s % 60):02d}"  # noqa: E731
        lines = [f"{fmt(0 if i == 0 else c[0])} {c[1]}" for i, c in enumerate(chapters)]
        desc += f"\n\n{words[0]}:\n" + "\n".join(lines)
    if script.get("references"):
        desc += f"\n\n{words[1]}: " + "; ".join(script["references"])
    return desc[:4900]


def process(video):
    vid = video["id"]
    patch(vid, status="rendering", attempts=video["attempts"] + 1, error=None)
    with tempfile.TemporaryDirectory() as work:
        final, thumb, total, chapters, lang = render(video, work)
        short = video["kind"] == "short"
        thumb_url = storage_upload(thumb, f"{video['user_id']}/youtube/{vid}.jpg", "image/jpeg")
        # Prévia leve (até ~15 MB) para assistir no Studio sem precisar abrir o YouTube
        small = os.path.join(work, "preview.mp4")
        scale = "360:-2" if short else "-2:360"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", final, "-vf", f"scale={scale}", "-c:v", "libx264", "-preset", "veryfast",
                        "-crf", "30", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", small], check=True)
        preview_url = storage_upload(small, f"{video['user_id']}/youtube/{vid}.mp4", "video/mp4")
        token = google_token(video["channel_ref"])
        script = video["script"]
        publish_at = video.get("publish_at")
        future = publish_at and dt.datetime.fromisoformat(publish_at.replace("Z", "+00:00")) > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=20)
        meta = {
            "snippet": {
                "title": script["title"][:100], "description": description(script, chapters, short, lang),
                "tags": [t[:30] for t in script.get("tags", [])][:15], "categoryId": "27",
                "defaultLanguage": {"en": "en", "es": "es-419"}.get(lang, "pt-BR"),
                "defaultAudioLanguage": {"en": "en", "es": "es-419"}.get(lang, "pt-BR"),
            },
            # Agendado (privado até a hora); vídeo atrasado sai público na hora.
            # App do Google ainda não auditado: o YouTube deixa tudo privado até a auditoria.
            "status": {"privacyStatus": "private" if future else "public", **({"publishAt": publish_at} if future else {}),
                       "selfDeclaredMadeForKids": False, "embeddable": True},
        }
        log("  enviando ao YouTube…")
        up = upload_video(token, final, meta)
        warn = set_thumbnail(token, up["id"], thumb)
        patch(vid, status="uploaded", youtube_id=up["id"], thumbnail_url=thumb_url, duration_s=round(total, 1), error=warn)
        try:  # à parte: se a coluna ainda não existir, o vídeo já enviado não volta para a fila
            patch(vid, preview_url=preview_url)
        except Exception as e:
            log(f"  prévia: {e}")
        log(f"  ✓ https://youtu.be/{up['id']} ({total:.0f}s)")


# Roteiro fixo para ver um estilo novo antes de ligar no canal (workflow "Prévia de estilo")
SAMPLE = {
    "title": "O mar se abriu — e ninguém esperava o que veio depois",
    "thumbnail_text": "O MAR SE ABRIU",
    "thumbnail_image": "Moses raising his staff as the Red Sea parts into two walls of water",
    "cast": "",
    "scenes": [
        {"narration": "Seiscentos mil hebreus encurralados entre o mar e o exército do faraó.", "label": "Mar Vermelho",
         "layout": "photo", "image": "a huge crowd of ancient Hebrews on a beach trapped between the sea and an army"},
        {"narration": "À frente, um homem de oitenta anos com um cajado na mão.", "label": "Moisés",
         "layout": "sticker", "image": "old Moses with long beard holding a wooden staff, full body"},
        {"narration": "Eles tinham saído do Egito poucos dias antes, rumo à terra prometida.", "label": "Egito → Canaã",
         "layout": "map", "image": "antique map of Egypt, the Sinai peninsula and Canaan"},
        {"narration": "Atrás deles vinham seiscentos carros de guerra.", "label": "Êxodo 14:7",
         "layout": "tv", "image": "ancient Egyptian war chariots with horses charging"},
        {"narration": "Então Moisés estendeu a mão sobre o mar, e as águas se dividiram.", "label": "Êxodo 14:21",
         "layout": "photo", "image": "the Red Sea parting into two giant walls of water with a dry path in the middle"},
        {"narration": "O povo atravessou a pé enxuto, no meio do mar.", "label": "A travessia",
         "layout": "sticker", "image": "a Hebrew family walking with a donkey, full body"},
        {"narration": "E você, acredita que Deus ainda abre caminhos onde não existe saída?", "label": "Comente",
         "layout": "photo", "image": "a lone traveler looking at a path opening between two mountains at dawn"},
    ],
}


def preview(style, lang="pt"):
    """Renderiza o roteiro de exemplo no estilo pedido e salva em previews/ (o workflow publica na branch previews)."""
    video = {"script": SAMPLE, "kind": "short"}
    channel = {"style": style, "language": lang, "voice": None}
    os.makedirs(os.path.join(HERE, "..", "previews"), exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        final, thumb, total, _, _ = render(video, work, channel)
        shutil.copy(final, os.path.join(HERE, "..", "previews", f"{style}.mp4"))
        shutil.copy(thumb, os.path.join(HERE, "..", "previews", f"{style}.jpg"))
    log(f"✓ prévia {style}: {total:.0f}s")


def main():
    if "--preview" in sys.argv:
        args = sys.argv[sys.argv.index("--preview") + 1:]
        preview(args[0] if args else "collage", args[1] if len(args) > 1 else "pt")
        return
    if "--check" in sys.argv:
        requeue_stuck()
        print("queued" if queued(1) else "empty")
        return
    if not (URL and KEY):
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY ausentes")
    if not (os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET")):
        sys.exit("Cadastre GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nos secrets do GitHub")
    done = 0
    while done < 6:
        batch = queued(1)
        if not batch:
            break
        video = batch[0]
        log(f"▶ {video['kind']}: {video.get('title') or video.get('topic')}")
        try:
            process(video)
        except Exception as e:
            log(f"  ✗ {e}")
            failed = video["attempts"] + 1 >= MAX_ATTEMPTS
            patch(video["id"], status="failed" if failed else "queued", error=str(e)[:500])
        done += 1


if __name__ == "__main__":
    main()
