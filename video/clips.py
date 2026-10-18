#!/usr/bin/env python3
"""Cortes para canais de clipping (Renda extra) — roda no GitHub Actions (workflow "Cortes").

Só para conteúdo LIBERADO: campanhas de clipping (Whop Content Rewards etc.), Creative Commons ou criadores que
autorizaram. Fila: tabela clip_sources (status "queued"; as "done" são revistas a cada 12 h para pegar episódios
novos na mesma pasta). Para cada vídeo da fonte:
1. baixa do Google Drive (pasta ou arquivo compartilhado com "qualquer pessoa com o link") ou de um link direto;
2. transcreve com faster-whisper (tempo de cada palavra);
3. a IA (Claude) escolhe os melhores momentos de 20 a 58 s, com título curto para a tela e título do YouTube;
4. corta na vertical 1080x1920 seguindo o rosto de quem fala (OpenCV); sem rosto claro, usa o vídeo inteiro
   centralizado sobre um fundo desfocado;
5. título na tela, logo da campanha, legendas palavra a palavra e áudio normalizado;
6. envia ao canal (agendado em horários do público dos EUA) e grava um yt_videos kind = 'clip' com o link,
   para a pessoa enviar no painel da campanha.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY
(opcional CLAUDE_MODEL). Uso: python3 video/clips.py [--check]
"""
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

from worker import URL, rest
import youtube as yt

VIDEO_EXT = (".mp4", ".mov", ".mkv", ".m4v", ".webm")
# Episódios baixados ficam guardados no cache do workflow: o Drive de campanha popular bloqueia downloads
# ("Too many users have viewed or downloaded this file") e o Refazer não precisa baixar de novo.
CACHE = os.environ.get("CLIPS_CACHE") or ""
DRIVE_LIMIT = "Too many users"
SKIP_NAMES = re.compile(r"trailer|teaser|coming[\s_-]*soon|promo|sneak[\s_-]*peek", re.I)
NOT_VIDEO = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".pdf", ".txt", ".doc", ".docx", ".srt", ".vtt", ".zip", ".psd", ".ai", ".mp3", ".wav")
W, H, FPS = 1080, 1920, 30
SLOTS = ["14:00", "19:00", "23:00", "11:00", "16:30", "21:00"]  # horário de Brasília (tarde/noite nos EUA)


def log(*a):
    print(*a, flush=True)


def now():
    return dt.datetime.now(dt.timezone.utc)


def patch_source(sid, **f):
    f["updated_at"] = now().isoformat()
    rest("PATCH", f"clip_sources?id=eq.{sid}", f)


def pending():
    """Fontes novas + fontes já feitas há mais de 12 h (para pegar episódios novos na pasta)."""
    q = rest("GET", "clip_sources?status=eq.queued&order=created_at&limit=3&select=*") or []
    limit = (now() - dt.timedelta(hours=12)).isoformat()
    again = rest("GET", f"clip_sources?status=eq.done&updated_at=lt.{urllib.parse.quote(limit)}&order=updated_at&limit=3&select=*") or []
    return q + again


# ------------------------------------------------------------------------------------------------ download

def drive_files(url, folder):
    """Lista (id, nome) dos vídeos de uma pasta do Drive, ou do arquivo único."""
    import gdown

    if "/folders/" in url:
        files = gdown.download_folder(url, output=folder, skip_download=True, quiet=True, use_cookies=False) or []
        # No Drive o nome às vezes vem sem extensão ("EP1"): vale tudo que não é imagem/documento/áudio
        vids = [(f.id, os.path.basename(f.path)) for f in files if not f.path.lower().endswith(NOT_VIDEO)]
        log(f"  pasta: {', '.join(os.path.basename(f.path) for f in files) or '(vazia)'}")
    else:
        m = re.search(r"/d/([\w-]+)|id=([\w-]+)", url)
        vids = [(m.group(1) or m.group(2), "video.mp4")] if m else []
    main = [v for v in vids if not SKIP_NAMES.search(v[1])]
    return main or vids


def download(file_id, name, folder, mirror=None):
    """Baixa o vídeo do Drive. Drive da campanha bloqueado e há link reserva (cópia no Drive do dono): baixa da cópia."""
    try:
        return _download(file_id, name, folder)
    except RuntimeError as e:
        if DRIVE_LIMIT not in str(e) or not mirror:
            raise
    log("  Drive da campanha bloqueado: usando o link reserva")
    files = drive_files(mirror, os.path.join(folder, "mirror"))
    if not files:
        raise RuntimeError("o link reserva não tem vídeo (confira se está como 'qualquer pessoa com o link')")
    stem = lambda n: os.path.splitext(n)[0].strip().lower()  # noqa: E731
    pick = next((f for f in files if stem(f[1]) == stem(name)), files[0])
    return _download(pick[0], name, folder, keep_as=file_id)


def _download(file_id, name, folder, keep_as=None):
    import gdown

    if CACHE:
        os.makedirs(CACHE, exist_ok=True)
        kept = os.path.join(CACHE, f"{keep_as or file_id}.mp4")
        if os.path.exists(kept) and os.path.getsize(kept) > 100_000:
            os.utime(kept)
            log(f"  {name}: já estava guardado (não baixei do Drive)")
            return kept
        out = kept
    else:
        out = os.path.join(folder, re.sub(r"[^\w.-]", "_", name) or "video.mp4")
        if not out.lower().endswith(VIDEO_EXT):
            out += ".mp4"
    try:
        got = gdown.download(id=file_id, output=out, quiet=True, use_cookies=False)
    except Exception as e:
        if os.path.exists(out):
            os.remove(out)
        if DRIVE_LIMIT in str(e):
            raise RuntimeError(f"{DRIVE_LIMIT}: o Drive da campanha bloqueou downloads por algumas horas "
                               "(muita gente baixando o mesmo episódio). Tento de novo sozinho na próxima rodada.") from None
        raise
    if not got or not os.path.exists(out) or os.path.getsize(out) < 100_000:
        if os.path.exists(out):
            os.remove(out)
        raise RuntimeError(f"não consegui baixar {name} do Drive (confira se está como 'qualquer pessoa com o link')")
    return out


def drop(video):
    """Apaga o vídeo da pasta de trabalho (o guardado no cache fica para a próxima)."""
    if not (CACHE and os.path.abspath(video).startswith(os.path.abspath(CACHE))):
        os.remove(video)


def prune_cache(days=5, max_gb=6):
    """Cache do workflow tem limite: tira episódios parados há dias e, se passar do tamanho, os mais antigos."""
    if not CACHE or not os.path.isdir(CACHE):
        return
    files = sorted((os.path.join(CACHE, f) for f in os.listdir(CACHE)), key=os.path.getmtime, reverse=True)
    old = now().timestamp() - days * 86400
    total = 0
    for f in files:
        total += os.path.getsize(f)
        if os.path.getmtime(f) < old or total > max_gb * 1024 ** 3:
            os.remove(f)


def duration(video):
    """Duração em segundos (0 se não for vídeo)."""
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True).stdout.strip()
    try:
        return float(out.splitlines()[0]) if out else 0.0
    except ValueError:
        return 0.0


def download_direct(url, folder):
    out = os.path.join(folder, "video.mp4")
    req = urllib.request.Request(url, headers={"User-Agent": "BraxStudio/1.0"})
    with urllib.request.urlopen(req, timeout=600) as r, open(out, "wb") as f:
        shutil.copyfileobj(r, f)
    return out


# ------------------------------------------------------------------------------------------------ transcrição

def transcribe(video, work):
    from faster_whisper import WhisperModel

    import numpy as np

    # Áudio cru (16 kHz mono float32) direto do ffmpeg: não depende do PyAV (versões novas quebram o faster-whisper)
    raw = os.path.join(work, "audio.f32")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", raw], check=True)
    audio = np.fromfile(raw, dtype=np.float32)
    os.remove(raw)
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, info = model.transcribe(audio, word_timestamps=True, vad_filter=True, beam_size=1)
    words, lines = [], []
    for s in segs:
        lines.append((s.start, s.end, s.text.strip()))
        for wd in s.words or []:
            words.append({"t": wd.start, "d": max(0.05, wd.end - wd.start), "w": wd.word.strip()})
    log(f"  transcrição: {len(lines)} trechos, idioma {info.language}")
    return words, lines, info.language


def transcript_for(source, fid, video, work):
    """Transcrição do episódio, guardada no storage na 1ª vez: o "Refazer" não precisa transcrever de novo (economiza ~1 h)."""
    key = f"{source['user_id']}/clips/transcripts/{source['id']}-{fid}.json"
    try:
        with urllib.request.urlopen(f"{yt.URL}/storage/v1/object/public/media/{key}", timeout=60) as r:
            data = json.loads(r.read())
        log("  transcrição guardada (pulei a transcrição)")
        return data["words"], [tuple(x) for x in data["lines"]], data["language"]
    except Exception:
        pass
    words, lines, language = transcribe(video, work)
    path = os.path.join(work, "transcript.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"words": words, "lines": lines, "language": language}, f)
    try:
        yt.storage_upload(path, key, "application/json")
    except Exception as e:
        log(f"  não guardei a transcrição: {e}")
    return words, lines, language


# ------------------------------------------------------------------------------------------------ IA

def clip_language(spoken, channel):
    """Título, capa e descrição no idioma falado no vídeo (as legendas já saem nele), não no padrão do canal."""
    return spoken if spoken in ("pt", "en", "es") else (channel.get("language") or "en")


def pick_moments(lines, n, campaign, rules, language, extra=""):
    """Claude escolhe os melhores momentos (saída estruturada = JSON garantido)."""
    key = os.environ["ANTHROPIC_API_KEY"]
    model = os.environ.get("CLAUDE_MODEL") or "claude-opus-5-5"
    fmt = lambda s: f"{int(s // 60)}:{int(s % 60):02d}"  # noqa: E731
    transcript = "\n".join(f"[{fmt(a)}-{fmt(b)}] {t}" for a, b, t in lines)[:180000]
    lang = {"es": "Spanish", "pt": "Brazilian Portuguese"}.get(language, "English")
    schema = {
        "type": "object", "additionalProperties": False, "required": ["clips"],
        "properties": {"clips": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["start", "end", "screen_title", "youtube_title", "why"],
            "properties": {
                "start": {"type": "number", "description": "start in seconds"},
                "end": {"type": "number", "description": "end in seconds"},
                "screen_title": {"type": "string", "description": f"on-screen title, max 7 words, in {lang}, hooky"},
                "youtube_title": {"type": "string", "description": f"YouTube title, max 80 chars, in {lang}, no hashtags"},
                "why": {"type": "string"},
            }}}},
    }
    prompt = (
        f"You are an expert short-form video editor who finds viral moments in long videos (campaign: {campaign}).\n"
        f"Pick the {n} best moments for YouTube Shorts from the transcript below. Each clip must:\n"
        "- be 20 to 58 seconds long and NOT overlap other clips;\n"
        "- start right at a strong hook (a surprising line, a question, conflict, a laugh) — no warm-up;\n"
        "- end on a payoff (punchline, reveal, strong reaction) and make sense on its own;\n"
        "- favor funny, dramatic, relatable or conversation-worthy moments, as the campaign asks;\n"
        "- avoid hate, sexual content, slurs or anything against YouTube policies.\n"
        f"Campaign rules from the brand:\n{rules or '(none)'}\n{extra}\nTranscript with timestamps:\n{transcript}"
    )
    body = json.dumps({"model": model, "max_tokens": 8000, "output_config": {"format": {"type": "json_schema", "schema": schema}},
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST", headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        raise RuntimeError(f"IA (Anthropic) {e.code}: {detail}") from None
    for block in data.get("content", []):
        if block.get("type") == "text" and block.get("text", "").strip():
            return json.loads(block["text"])["clips"]
    raise RuntimeError("a IA não escolheu os momentos")


def snap(clips, words, total):
    """Ajusta início/fim aos limites das palavras, garante 15-59 s e tira sobreposições."""
    out, used = [], []
    for c in sorted(clips, key=lambda c: c["start"]):
        a, b = max(0.0, float(c["start"])), min(total, float(c["end"]))
        before = [w for w in words if w["t"] <= a + 0.3]
        if before:
            a = max(0.0, before[-1]["t"] - 0.15)
        after = [w for w in words if w["t"] + w["d"] >= b - 0.3]
        if after:
            b = min(total, after[0]["t"] + after[0]["d"] + 0.35)
        if b - a > 59:
            b = a + 59
        if b - a < 15 or any(not (b <= u0 or a >= u1) for u0, u1 in used):
            continue
        used.append((a, b))
        out.append({**c, "start": a, "end": b})
    return out


# ------------------------------------------------------------------------------------------------ vídeo

def probe_size(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                          "-of", "csv=p=0", path], stdout=subprocess.PIPE, text=True, check=True).stdout.strip()
    w, h = (int(x) for x in out.split(",")[:2])
    return w, h


def face_track(src, a, dur):
    """Centro horizontal (0-1) do rosto principal ao longo do corte, 5 amostras/s. None se quase não há rosto."""
    import cv2
    import numpy as np

    sw, sh = probe_size(src)
    lw = 640
    lh = int(round(sh * lw / sw / 2) * 2)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{a:.2f}", "-i", src, "-t", f"{dur:.2f}", "-vf", f"fps=5,scale={lw}:{lh}",
                          "-an", "-f", "rawvideo", "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE, check=True).stdout
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, lh, lw)
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    xs, hits = [], 0
    for f in frames:
        faces = det.detectMultiScale(f, scaleFactor=1.15, minNeighbors=5, minSize=(lh // 10, lh // 10))
        if len(faces):
            x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
            xs.append((x + fw / 2) / lw)
            hits += 1
        else:
            xs.append(None)
    if not frames.shape[0] or hits / frames.shape[0] < 0.4:
        return None
    # Preenche os buracos com o último rosto visto e suaviza (câmera calma, sem tremer)
    last = next(x for x in xs if x is not None)
    filled = []
    for x in xs:
        last = x if x is not None else last
        filled.append(last)
    k = 7
    pad = np.pad(np.array(filled), (k // 2, k // 2), mode="edge")
    smooth = np.convolve(pad, np.ones(k) / k, mode="valid")
    return smooth


def render_vertical(src, a, dur, out):
    """Corte vertical 1080x1920: segue o rosto; sem rosto, vídeo inteiro sobre fundo desfocado."""
    import numpy as np

    track = face_track(src, a, dur)
    if track is None:
        vf = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=30,"
              f"eq=brightness=-0.12[bg];[b]scale={W}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps={FPS},format=yuv420p[v]")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.2f}", "-i", src, "-t", f"{dur:.2f}", "-filter_complex", vf,
                        "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", out], check=True)
        return "blur"
    sw, sh = probe_size(src)
    bw = int(round(sw * H / sh / 2) * 2)  # largura com altura 1920
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{a:.2f}", "-i", src, "-t", f"{dur:.2f}", "-vf", f"fps={FPS},scale={bw}:{H}",
                            "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                            "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", out],
                           stdin=subprocess.PIPE)
    size = bw * H * 3
    i = 0
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        frame = np.frombuffer(buf, dtype=np.uint8).reshape(H, bw, 3)
        cx = track[min(len(track) - 1, int(i / FPS * 5))] * bw
        x0 = int(min(max(0, cx - W / 2), bw - W)) if bw > W else 0
        enc.stdin.write(np.ascontiguousarray(frame[:, x0:x0 + W]).tobytes() if bw >= W else frame.tobytes())
        i += 1
    enc.stdin.close()
    dec.wait()
    if enc.wait() != 0 or i == 0:
        raise RuntimeError("falha ao montar o corte vertical")
    return "face"


def finish(video_only, src, a, dur, words, title, logo, work, out):
    """Título na tela, legendas, logo e áudio normalizado."""
    ass = os.path.join(work, "cap.ass")
    clip_words = [{**w, "t": w["t"] - a} for w in words if a <= w["t"] <= a + dur]
    # Primeiros 2 s: o título gigante em amarelo (é o que aparece de capa no feed de Shorts); depois vira a faixa branca
    yt.captions(clip_words, True, W, H, ass, hook=title)
    with open(ass, encoding="utf-8") as f:
        text = f.read()
    style = (f"Style: Title,Poppins,74,&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,18,0,8,80,80,0,1\n")
    text = text.replace("\n\n[Events]", "\n" + style + "\n[Events]", 1)
    safe = title.replace("{", "").replace("}", "").strip()
    text += f"Dialogue: 2,{yt.ass_time(2.3)},{yt.ass_time(dur)},Title,,0,0,0,,{{\\pos({W // 2},{int(H * 0.12)})\\fad(200,0)}}{safe.upper()}\n"
    with open(ass, "w", encoding="utf-8") as f:
        f.write(text)
    args = ["ffmpeg", "-v", "error", "-y", "-i", video_only, "-ss", f"{a:.2f}", "-t", f"{dur:.2f}", "-i", src]
    fc = f"[0:v]subtitles={ass}:fontsdir={yt.FONTS}[s]"
    if logo:
        args += ["-i", logo]
        fc += ";[2:v]scale=190:-1[lg];[s][lg]overlay=40:70[v]"  # canto de cima à esquerda: fora do título e dos botões do Shorts
    else:
        fc += ";[s]null[v]"
    args += ["-filter_complex", fc, "-map", "[v]", "-map", "1:a:0?", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
             "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
             "-shortest", "-movflags", "+faststart", out]
    subprocess.run(args, check=True)


# ------------------------------------------------------------------------------------------------ agenda e envio

def next_slots(channel_ref, per_day, count):
    """Próximos horários livres do canal (per_day por dia), a partir de daqui a 30 min."""
    taken = {r["publish_at"][:16] for r in (rest("GET", f"yt_videos?channel_ref=eq.{channel_ref}&kind=eq.clip&status=in.(uploaded,rendering)&publish_at=gt.{urllib.parse.quote(now().isoformat())}&select=publish_at") or []) if r.get("publish_at")}
    out, day = [], (now() - dt.timedelta(hours=3)).date()
    while len(out) < count:
        for hhmm in SLOTS[:per_day]:
            t = dt.datetime.fromisoformat(f"{day}T{hhmm}:00-03:00").astimezone(dt.timezone.utc)
            if t > now() + dt.timedelta(minutes=30) and t.isoformat()[:16] not in taken:
                out.append(t)
                if len(out) == count:
                    break
        day += dt.timedelta(days=1)
    return out


def upload_clip(source, channel, clip, path, thumb, preview, when, work, row_id=None):
    token = yt.google_token(channel["id"])
    tags = [h.lstrip("#") for h in (source.get("hashtags") or "").split() if h.startswith("#")]
    hashtags = " ".join("#" + t for t in tags)
    lang = channel.get("language") or "en"
    credit = source.get("credit") or source["campaign"]
    desc = (f"{clip['youtube_title']}\n\n"
            f"{'Credit' if lang == 'en' else 'Crédito'}: {credit}\n\n{hashtags} #shorts").strip()
    title = f"{clip['youtube_title']} {('#' + tags[0]) if tags else ''}".strip()[:100]
    future = when > now() + dt.timedelta(minutes=20)
    meta = {
        "snippet": {"title": title, "description": desc[:4900], "tags": tags[:15] + ["shorts", "clips"], "categoryId": "24",
                    "defaultLanguage": lang, "defaultAudioLanguage": lang},
        "status": {"privacyStatus": "private" if future else "public", **({"publishAt": when.isoformat()} if future else {}),
                   "selfDeclaredMadeForKids": False},
    }
    up = yt.upload_video(token, path, meta)
    row = {
        "user_id": source["user_id"], "channel_ref": channel["id"], "kind": "clip", "status": "uploaded", "error": None,
        "topic": source["campaign"], "angle": clip.get("why"), "title": title, "youtube_id": up["id"],
        "publish_at": when.isoformat(), "thumbnail_url": thumb, "preview_url": preview,
        "duration_s": round(clip["end"] - clip["start"], 1),
        "script": {"source_id": source["id"], "file": clip.get("file"), "start": clip["start"], "end": clip["end"],
                   "screen_title": clip["screen_title"]},
    }
    if row_id:  # "Refazer": o mesmo registro ganha o corte novo
        rest("PATCH", f"yt_videos?id=eq.{row_id}", {**row, "updated_at": now().isoformat()})
    else:
        rest("POST", "yt_videos", row)
    return up["id"]


def logo_for(source, folder):
    """Logo da campanha: Logo.png da mesma pasta do Drive, se existir."""
    import gdown

    if "/folders/" not in source["url"]:
        return None
    try:
        files = gdown.download_folder(source["url"], output=folder, skip_download=True, quiet=True, use_cookies=False) or []
        for f in files:
            if re.search(r"logo", os.path.basename(f.path), re.I) and f.path.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                out = os.path.join(folder, "logo" + os.path.splitext(f.path)[1].lower())
                return gdown.download(id=f.id, output=out, quiet=True, use_cookies=False)
    except Exception as e:
        log(f"  logo: {e}")
    return None


def make_clip(source, channel, clip, video, words, logo, work, when, name, row_id=None):
    """Renderiza um corte (vertical, título, logo, legendas), sobe prévia/capa e envia ao canal."""
    a, dur = clip["start"], clip["end"] - clip["start"]
    vo = os.path.join(work, "v.mp4")
    mode = render_vertical(video, a, dur, vo)
    final = os.path.join(work, "clip.mp4")
    finish(vo, video, a, dur, words, clip["screen_title"], logo, work, final)
    thumb_path = os.path.join(work, "t.jpg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{dur * 0.3:.2f}", "-i", final, "-frames:v", "1", "-vf", "scale=540:-2", thumb_path], check=True)
    small = os.path.join(work, "p.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", final, "-vf", "scale=360:-2", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "30", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", small], check=True)
    key = f"{source['user_id']}/clips/{name}"
    thumb = yt.storage_upload(thumb_path, key + ".jpg", "image/jpeg")
    preview = yt.storage_upload(small, key + ".mp4", "video/mp4")
    vid = upload_clip(source, channel, clip, final, thumb, preview, when, work, row_id)
    log(f"    ✓ https://youtu.be/{vid} ({mode}) → publica {when.isoformat()}")
    return vid


def process(source):
    sid = source["id"]
    channel = (rest("GET", f"yt_channels?id=eq.{source['channel_ref']}&select=id,language") or [None])[0]
    if not channel:
        raise RuntimeError("canal não encontrado")
    prev = rest("GET", f"yt_videos?kind=eq.clip&channel_ref=eq.{channel['id']}&select=script") or []
    done_files = {(p.get("script") or {}).get("file") for p in prev if (p.get("script") or {}).get("source_id") == sid}
    done_ids = {f for f in done_files if f}  # vídeos dessa fonte que já viraram cortes
    patch_source(sid, status="processing", error=None)
    made = 0
    with tempfile.TemporaryDirectory() as work:
        if "drive.google.com" in source["url"]:
            files = [f for f in drive_files(source["url"], work) if f[0] not in done_ids]
        else:
            files = [("direct", "video.mp4")] if "direct" not in done_ids else []
        if not files:
            log("  nada novo nessa fonte")
        logo = logo_for(source, work)
        files.sort(key=lambda f: bool(SKIP_NAMES.search(f[1])))  # episódios antes de teaser/trailer
        for fid, name in files[:2]:  # até 2 vídeos novos por rodada (tempo do workflow)
            log(f"  baixando {name}…")
            video = download(fid, name, work, source.get("mirror_url")) if fid != "direct" else download_direct(source["url"], work)
            total = duration(video)
            if total < 180 and len(files) > 1:  # vinheta/teaser curto: não vale cortar se tem episódio
                log(f"  {name} tem só {total:.0f}s, pulando")
                drop(video)
                continue
            if total < 25:
                raise RuntimeError(f"{name} não é um vídeo que dá para cortar ({total:.0f}s)")
            words, lines, language = transcript_for(source, fid, video, work)
            channel["language"] = clip_language(language, channel)
            moments = snap(pick_moments(lines, min(source.get("clips_wanted") or 6, max(1, int(total // 60))), source["campaign"], source.get("rules"),
                                        channel["language"]), words, total)
            slots = next_slots(channel["id"], source.get("per_day") or 3, len(moments))
            for i, (clip, when) in enumerate(zip(moments, slots)):
                clip["file"] = fid
                log(f"  corte {i + 1}/{len(moments)}: {clip['screen_title']} ({clip['end'] - clip['start']:.0f}s)")
                make_clip(source, channel, clip, video, words, logo, work, when, f"{sid}-{fid}-{i}")
                made += 1
            drop(video)
    patch_source(sid, status="done", clips_made=(source.get("clips_made") or 0) + made)
    if made:
        notify_owner(source["user_id"], f"✂️ {made} corte(s) novo(s) — {source['campaign']}")


def notify_owner(user_id, title):
    """Aviso no celular (Studio instalado como app): o cron do Studio envia."""
    try:
        rest("POST", "notifications", {"user_id": user_id, "title": title,
                                       "body": "Depois de publicado, copie o link e envie na campanha.", "url": "/studio/cortes"})
    except Exception as e:  # noqa: BLE001 — aviso não derruba o corte
        log(f"  aviso: {e}")


def redo_rows():
    stuck = (now() - dt.timedelta(hours=4)).isoformat()  # workflow que caiu no meio de um "Refazer"
    rest("PATCH", f"yt_videos?kind=eq.clip&status=eq.rendering&updated_at=lt.{urllib.parse.quote(stuck)}", {"status": "redo"})
    return rest("GET", "yt_videos?kind=eq.clip&status=eq.redo&order=updated_at&limit=12&select=*") or []


def process_redos():
    """Botão "Refazer" no Studio: novo corte do mesmo episódio, num momento diferente (e com o pedido do dono)."""
    groups = {}
    for row in redo_rows():
        sc = row.get("script") or {}
        groups.setdefault((sc.get("source_id"), sc.get("file")), []).append(row)
    for (sid, fid), rows in groups.items():
        ids = ",".join(r["id"] for r in rows)
        try:
            source = (rest("GET", f"clip_sources?id=eq.{sid}&select=*") or [None])[0]
            if not source or not fid:
                raise RuntimeError("campanha do corte não encontrada")
            channel = (rest("GET", f"yt_channels?id=eq.{source['channel_ref']}&select=id,language") or [None])[0]
            if not channel:
                raise RuntimeError("canal não encontrado")
            log(f"▶ refazer {len(rows)} corte(s) de {source['campaign']}")
            rest("PATCH", f"yt_videos?id=in.({ids})", {"status": "rendering", "updated_at": now().isoformat()})
            same = rest("GET", f"yt_videos?kind=eq.clip&channel_ref=eq.{channel['id']}&status=neq.deleted&select=script") or []
            used = [(p.get("script") or {}) for p in same]
            used = [u for u in used if u.get("source_id") == sid and u.get("file") == fid and "start" in u]
            used += [r["script"] for r in rows if (r.get("script") or {}).get("start") is not None]
            avoid = "; ".join(f"{u['start']:.0f}-{u['end']:.0f}s" for u in used)
            notes = "\n".join(f"- {r['redo_note']}" for r in rows if r.get("redo_note"))
            extra = (f"Do NOT reuse these time ranges (already used or rejected): {avoid}\n" if avoid else "") + \
                    (f"The channel owner asked for these changes:\n{notes}\n" if notes else "")
            with tempfile.TemporaryDirectory() as work:
                video = download_direct(source["url"], work) if fid == "direct" else download(fid, "video.mp4", work, source.get("mirror_url"))
                words, lines, language = transcript_for(source, fid, video, work)
                channel["language"] = clip_language(language, channel)
                total = duration(video)
                logo = logo_for(source, work)
                moments = snap(pick_moments(lines, len(rows), source["campaign"], source.get("rules"),
                                            channel["language"], extra), words, total)
                slots = next_slots(channel["id"], source.get("per_day") or 3, len(moments))
                for row, clip, when in zip(rows, moments, slots):
                    clip["file"] = fid
                    log(f"  novo corte: {clip['screen_title']}")
                    make_clip(source, channel, clip, video, words, logo, work, when, f"{sid}-{fid}-r{row['id'][:8]}", row["id"])
                notify_owner(source["user_id"], f"✂️ {len(moments)} corte(s) refeito(s) — {source['campaign']}")
                for row in rows[len(moments):]:
                    rest("PATCH", f"yt_videos?id=eq.{row['id']}", {"status": "failed", "error": "a IA não achou outro momento bom"})
        except Exception as e:
            log(f"  ✗ {e}")
            # Drive bloqueado por excesso de downloads: fica na fila e a próxima rodada (até 6 h) tenta de novo
            status = "redo" if DRIVE_LIMIT in str(e) else "failed"
            rest("PATCH", f"yt_videos?id=in.({ids})&status=in.(redo,rendering)", {"status": status, "error": f"Refazer: {e}"[:500]})


def main():
    if "--check" in sys.argv:
        print("queued" if pending() or redo_rows() else "empty")
        return
    process_redos()
    for source in pending():
        log(f"▶ {source['campaign']}")
        try:
            process(source)
        except Exception as e:
            log(f"  ✗ {e}")
            patch_source(source["id"], status="queued" if DRIVE_LIMIT in str(e) else "failed", error=str(e)[:500])
    prune_cache()


if __name__ == "__main__":
    main()
