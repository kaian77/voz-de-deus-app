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

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "engine", "assets", "fonts")
MAX_ATTEMPTS = 3
FPS = 30
XF = 0.45  # transição entre cenas (s)
PAUSE = 0.30  # respiro depois de cada fala (s)
SR = 24000
STYLE = (
    "3D animated movie still, Pixar and Disney style, cute stylized biblical characters with expressive faces, "
    "ancient Middle East, warm cinematic lighting, rich vibrant colors, soft depth of field, highly detailed, "
    "no text, no letters, no watermark"
)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------------------------------------ fila

def queued(limit=4):
    return rest("GET", f"yt_videos?status=eq.queued&attempts=lt.{MAX_ATTEMPTS}&order=publish_at&limit={limit}&select=*") or []


def requeue_stuck():
    limit = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)).isoformat()
    rest("PATCH", f"yt_videos?status=eq.rendering&updated_at=lt.{urllib.parse.quote(limit)}", {"status": "queued"})


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
    return out[: int(seconds * SR)] / (np.abs(out).max() + 1e-9) * 0.5


# ------------------------------------------------------------------------------------------------ imagens

def _fetch(url, headers=None, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "BraxStudio/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "")


def image(prompt, w, h, path, seed):
    """Imagem da cena: Pollinations (grátis) -> Cloudflare Workers AI (grátis) -> fundo liso."""
    from PIL import Image

    full = f"{prompt.strip().rstrip('.')}. {STYLE}"
    tries = []
    q = urllib.parse.urlencode({"width": w, "height": h, "model": "flux", "seed": seed, "nologo": "true", "enhance": "false"})
    tok = os.environ.get("POLLINATIONS_TOKEN")
    tries.append(("pollinations", lambda: _fetch(
        f"https://image.pollinations.ai/prompt/{urllib.parse.quote(full)}?{q}",
        {"Authorization": f"Bearer {tok}"} if tok else None)))
    acc, cft = os.environ.get("CF_ACCOUNT_ID"), os.environ.get("CF_API_TOKEN")
    if acc and cft:
        def cloudflare():
            raw, _ = _fetch(
                f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/@cf/black-forest-labs/flux-1-schnell",
                {"Authorization": f"Bearer {cft}", "Content-Type": "application/json"},
                json.dumps({"prompt": full, "steps": 6, "seed": seed}).encode())
            import base64
            return base64.b64decode(json.loads(raw)["result"]["image"]), "image/jpeg"
        tries.append(("cloudflare", cloudflare))
    for name, fn in tries:
        for attempt in range(3):
            try:
                raw, ctype = fn()
                if len(raw) > 5000:
                    with open(path, "wb") as f:
                        f.write(raw)
                    im = Image.open(path).convert("RGB")
                    cover(im, w, h).save(path, quality=93)
                    return name
            except Exception as e:
                log(f"    imagem ({name}): {str(e)[:120]}")
            time.sleep(6 + attempt * 8)
    return None


def cover(im, w, h):
    """Recorta/escala a imagem para preencher w x h."""
    from PIL import Image

    k = max(w / im.width, h / im.height)
    im = im.resize((math.ceil(im.width * k), math.ceil(im.height * k)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def fallback_image(path, w, h, prev=None):
    from PIL import Image, ImageDraw

    if prev and os.path.exists(prev):
        shutil.copy(prev, path)
        return
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        k = y / h
        d.line([(0, y), (w, y)], fill=(int(60 + 120 * k), int(40 + 70 * k), int(20 + 30 * k)))
    im.save(path, quality=92)


# ------------------------------------------------------------------------------------------------ montagem

def clip(img, seconds, motion, w, h, out):
    """Imagem parada -> clipe com movimento suave (zoom ou pan)."""
    frames = max(2, round(seconds * FPS))
    big_w, big_h = w * 2, h * 2
    z = {"zoom_in": f"1+0.12*on/{frames}", "zoom_out": f"1.12-0.12*on/{frames}"}.get(motion, "1.10")
    if motion == "pan_left":
        x = f"(iw-iw/zoom)*(1-on/{frames})"
    elif motion == "pan_right":
        x = f"(iw-iw/zoom)*on/{frames}"
    else:
        x = "(iw-iw/zoom)/2"
    vf = (f"scale={big_w}:{big_h},zoompan=z='{z}':x='{x}':y='(ih-ih/zoom)/2':d={frames}:s={w}x{h}:fps={FPS},"
          f"format=yuv420p")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", img, "-vf", vf, "-frames:v", str(frames),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", out], check=True)


def join(clips, lens, out):
    """Junta os clipes com transição (xfade); cada clipe já tem XF a mais para a sobreposição."""
    if len(clips) == 1:
        shutil.copy(clips[0], out)
        return
    args = ["ffmpeg", "-v", "error", "-y"]
    for c in clips:
        args += ["-i", c]
    parts, prev, offset = [], "[0:v]", 0.0
    kinds = ["fade", "smoothleft", "fadeblack", "smoothright", "dissolve", "circleopen"]
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


def captions(words, short, w, h, path):
    """Legendas .ass: blocos curtos com a palavra falada destacada em amarelo."""
    # Short: um pouco abaixo do meio (fora da área dos botões do app); longo: embaixo
    size, per, align, margin = (92, 3, 2, int(h * 0.30)) if short else (54, 6, 2, 70)
    head = (
        "[Script Info]\nScriptType: v4.00+\nWrapStyle: 0\n"
        f"PlayResX: {w}\nPlayResY: {h}\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Cap,Poppins,{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,{7 if short else 4},"
        f"{2 if short else 1},{align},60,60,{margin},1\n\n"
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

def render(video, work):
    import numpy as np

    script = video["script"]
    short = video["kind"] == "short"
    w, h = (1080, 1920) if short else (1920, 1080)
    channel = (rest("GET", f"yt_channels?id=eq.{video['channel_ref']}&select=voice,language") or [{}])[0]
    en = channel.get("language") == "en"
    voice = channel.get("voice") or ("en-US-AndrewNeural" if en else "pt-BR-AntonioNeural")
    if not voice.startswith("en-" if en else "pt-"):  # voz de outro idioma: usa a padrão do idioma do canal
        voice = "en-US-AndrewNeural" if en else "pt-BR-AntonioNeural"
    scenes = script["scenes"]
    base_seed = random.randint(1, 10_000_000)

    clips, lens, voices, words, chapters, t = [], [], [], [], [], 0.0
    prev_img = None
    for i, sc in enumerate(scenes):
        log(f"  cena {i + 1}/{len(scenes)}")
        mp3 = os.path.join(work, f"v{i}.mp3")
        ws = speak(sc["narration"], voice, mp3)
        audio = pcm(mp3)
        a_len = len(audio) / SR
        lead = 0.12
        length = lead + a_len + PAUSE + XF  # XF a mais: some na transição
        img = os.path.join(work, f"i{i}.jpg")
        if not image(sc["image"], w, h, img, base_seed + i):
            fallback_image(img, w, h, prev_img)
        prev_img = img
        out = os.path.join(work, f"c{i}.mp4")
        clip(img, length, sc.get("motion") or "zoom_in", w, h, out)
        clips.append(out)
        lens.append(length)
        voices.append((t + lead, audio))
        words += [{**x, "t": x["t"] + t + lead} for x in ws]
        if sc.get("chapter"):
            chapters.append((t, sc["chapter"]))
        t += length - XF
    total = t + XF

    silent = os.path.join(work, "video.mp4")
    join(clips, lens, silent)

    # Áudio: narração + trilha baixinha (abaixa mais quando tem voz)
    mixl = np.zeros(int((total + 1) * SR), dtype=np.float32)
    talk = np.zeros_like(mixl)
    for start, a in voices:
        i0 = int(start * SR)
        mixl[i0:i0 + len(a)] += a
        talk[i0:i0 + len(a)] = 1
    bed = music_bed(len(mixl) / SR)[: len(mixl)]
    duck = np.convolve(talk, np.ones(SR // 4) / (SR // 4), mode="same")
    mixl += bed * (0.16 - 0.09 * duck)
    mixl = np.clip(mixl / max(1e-6, np.abs(mixl).max()) * 0.95, -1, 1)
    wav = os.path.join(work, "audio.wav")
    import wave

    with wave.open(wav, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((mixl * 32767).astype(np.int16).tobytes())

    ass = os.path.join(work, "cap.ass")
    captions(words, short, w, h, ass)
    final = os.path.join(work, "final.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", silent, "-i", wav,
                    "-vf", f"subtitles={ass}:fontsdir={FONTS}", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final], check=True)

    # Capa
    thumb_src = os.path.join(work, "thumb_src.jpg")
    if not image(script["thumbnail_image"], 1280, 720, thumb_src, base_seed + 999):
        shutil.copy(os.path.join(work, "i0.jpg"), thumb_src)
    thumb = os.path.join(work, "thumb.jpg")
    thumbnail(thumb_src, script["thumbnail_text"], thumb)
    return final, thumb, total, chapters, en


def description(script, chapters, short, en=False):
    desc = script["description"].strip()
    if not short and len(chapters) >= 3:
        fmt = lambda s: f"{int(s // 60)}:{int(s % 60):02d}"  # noqa: E731
        lines = [f"{fmt(0 if i == 0 else c[0])} {c[1]}" for i, c in enumerate(chapters)]
        desc += ("\n\nChapters:\n" if en else "\n\nCapítulos:\n") + "\n".join(lines)
    if script.get("references"):
        desc += ("\n\nReferences: " if en else "\n\nReferências: ") + "; ".join(script["references"])
    return desc[:4900]


def process(video):
    vid = video["id"]
    patch(vid, status="rendering", attempts=video["attempts"] + 1, error=None)
    with tempfile.TemporaryDirectory() as work:
        final, thumb, total, chapters, en = render(video, work)
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
                "title": script["title"][:100], "description": description(script, chapters, short, en),
                "tags": [t[:30] for t in script.get("tags", [])][:15], "categoryId": "27",
                "defaultLanguage": "en" if en else "pt-BR", "defaultAudioLanguage": "en" if en else "pt-BR",
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


def main():
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
