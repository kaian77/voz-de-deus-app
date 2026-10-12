#!/usr/bin/env python3
"""edit.py — edição dos SEUS vídeos (gravações prontas) com ffmpeg.

  info        python edit.py info video.mp4 [--silences] [--scenes]
  cut-silence python edit.py cut-silence bruto.mp4 out.mp4 [--db -32 --min 0.45 --pad 0.12]   (jump cut)
  trim        python edit.py trim in.mp4 out.mp4 --start 3.2 --end 41
  speed       python edit.py speed in.mp4 out.mp4 --factor 1.15
  reframe     python edit.py reframe in.mp4 out.mp4 --aspect 9:16 --mode blur|crop|fit [--focus 0.5]
  concat      python edit.py concat out.mp4 a.mp4 b.mp4 c.mp4 [--transition fade --tdur 0.35 --aspect 9:16]
  grade       python edit.py grade in.mp4 out.mp4 --preset punchy|warm|cool|cinematic|bw|clean [--lut x.cube]
  audio       python edit.py audio in.mp4 out.mp4 [--music trilha.mp3|auto --music-db -20 --clean-voice --lufs -14]
  transcribe  python edit.py transcribe in.mp4 --out legendas      (gera .srt e _words.json; precisa faster-whisper)
  captions    python edit.py captions in.mp4 out.mp4 --words legendas_words.json --style tiktok
              python edit.py captions in.mp4 out.mp4 --srt legendas.srt --style clean
  overlay     python edit.py overlay base.mp4 out.mp4 --file objeto3d.mov --x 0.5 --y 0.6 --w 0.6 --start 2 --end 6
  zoom        python edit.py zoom in.mp4 out.mp4 --at 3.0,7.5 --amount 1.18    (zoom-punch em momentos de ênfase)
  cover       python edit.py cover in.mp4 capa.png --time 2.5 --text "3 erros que *todo mundo* comete"
  export      python edit.py export in.mp4 out.mp4 --platform reels|tiktok|shorts|feed|youtube|whatsapp
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import FONT_DIR, ffmpeg_bin, render_text, run  # noqa: E402

FF = None
ASPECTS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "4:5": (1080, 1350), "16:9": (1920, 1080), "4:3": (1440, 1080)}
GRADE = {
    "clean": "eq=contrast=1.04:saturation=1.08,unsharp=5:5:0.4",
    "punchy": "eq=contrast=1.12:saturation=1.28:brightness=0.01,unsharp=5:5:0.6",
    "warm": "colorbalance=rs=0.06:gs=0.01:bs=-0.06:rm=0.04:bm=-0.04,eq=saturation=1.12:contrast=1.05",
    "cool": "colorbalance=rs=-0.05:bs=0.07:bm=0.04,eq=saturation=1.05:contrast=1.05",
    "cinematic": "colorbalance=rs=-0.07:bs=0.09:rh=0.09:bh=-0.07,eq=contrast=1.1:saturation=1.05,vignette=PI/5",
    "bw": "hue=s=0,eq=contrast=1.18",
    "vintage": "curves=preset=vintage,eq=saturation=0.9,noise=alls=6:allf=t",
}
PLATFORM = {
    "reels": dict(aspect="9:16", fps=30, crf=19, maxrate="14M", lufs=-14),
    "tiktok": dict(aspect="9:16", fps=30, crf=19, maxrate="14M", lufs=-14),
    "shorts": dict(aspect="9:16", fps=30, crf=19, maxrate="14M", lufs=-14),
    "feed": dict(aspect="4:5", fps=30, crf=19, maxrate="10M", lufs=-14),
    "square": dict(aspect="1:1", fps=30, crf=19, maxrate="10M", lufs=-14),
    "youtube": dict(aspect="16:9", fps=30, crf=18, maxrate="20M", lufs=-14),
    "whatsapp": dict(aspect=None, fps=30, crf=26, maxrate="2.5M", lufs=-16, max_side=1280),
}


def ff(*args):
    return [FF, "-y", "-hide_banner", "-loglevel", "error", *args]


def venc(crf=18, maxrate=None):
    a = ["-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p", "-profile:v", "high"]
    if maxrate:
        a += ["-maxrate", maxrate, "-bufsize", str(int(float(maxrate[:-1]) * 2)) + maxrate[-1]]
    return a


AENC = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
MP4 = ["-movflags", "+faststart"]


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
                       stdout=subprocess.PIPE, text=True)
    d = json.loads(r.stdout or "{}")
    v = next((s for s in d.get("streams", []) if s["codec_type"] == "video"), None)
    a = next((s for s in d.get("streams", []) if s["codec_type"] == "audio"), None)
    info = {"file": path, "duration": float(d.get("format", {}).get("duration", 0)), "has_audio": a is not None}
    if v:
        w, h = int(v["width"]), int(v["height"])
        rot = 0
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                rot = int(sd["rotation"])
        rot = int(v.get("tags", {}).get("rotate", rot))
        if abs(rot) in (90, 270):
            w, h = h, w
        num, den = (v.get("avg_frame_rate") or "30/1").split("/")
        info.update(width=w, height=h, fps=round(float(num) / max(1, float(den)), 3), vcodec=v["codec_name"],
                    aspect=f"{w}:{h}", orientation="vertical" if h > w else ("square" if h == w else "horizontal"))
    if a:
        info.update(acodec=a["codec_name"], sample_rate=int(a.get("sample_rate", 0)), channels=a.get("channels"))
    return info


def detect_silences(path, db=-32, min_d=0.45):
    r = subprocess.run([FF, "-hide_banner", "-i", path, "-af", f"silencedetect=noise={db}dB:d={min_d}", "-f", "null", "-"],
                       stderr=subprocess.PIPE, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    dur = probe(path)["duration"]
    if len(ends) < len(starts):
        ends.append(dur)
    return [(max(0.0, s), e) for s, e in zip(starts, ends)]


def detect_scenes(path, thr=0.3):
    r = subprocess.run([FF, "-hide_banner", "-i", path, "-vf", f"select='gt(scene,{thr})',showinfo", "-f", "null", "-"],
                       stderr=subprocess.PIPE, text=True)
    return [round(float(x), 2) for x in re.findall(r"pts_time:([\d.]+)", r.stderr)]


def size_for(aspect, max_side=None):
    if aspect in ASPECTS:
        return ASPECTS[aspect]
    w, h = [int(x) for x in aspect.split("x")]
    return w, h


def reframe_filter(w, h, mode="blur", focus=0.5):
    if mode == "crop":
        return (f"scale={w}:{h}:force_original_aspect_ratio=increase,"
                f"crop={w}:{h}:(iw-{w})*{focus}:(ih-{h})/2,setsar=1")
    if mode == "fit":
        return f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
    # blur: vídeo inteiro no centro + o mesmo vídeo desfocado preenchendo o fundo
    return (f"split=2[bgsrc][fgsrc];"
            f"[bgsrc]scale={w // 4}:{h // 4}:force_original_aspect_ratio=increase,crop={w // 4}:{h // 4},"
            f"boxblur=10:2,eq=brightness=-0.08:saturation=1.1,scale={w}:{h}[bg];"
            f"[fgsrc]scale={w}:{h}:force_original_aspect_ratio=decrease[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1")


# ------------------------------------------------------------------ comandos
def cmd_info(a):
    i = probe(a.input)
    if a.silences:
        i["silences"] = [[round(s, 2), round(e, 2)] for s, e in detect_silences(a.input, a.db, a.min)]
    if a.scenes:
        i["scene_cuts"] = detect_scenes(a.input)
    print(json.dumps(i, indent=2, ensure_ascii=False))


def cmd_cut_silence(a):
    info = probe(a.input)
    sil = detect_silences(a.input, a.db, a.min)
    keep, cur = [], 0.0
    for s, e in sil:
        s2, e2 = s + a.pad, e - a.pad
        if s2 > cur:
            keep.append((cur, s2))
        cur = max(cur, e2)
    if cur < info["duration"]:
        keep.append((cur, info["duration"]))
    keep = [(s, e) for s, e in keep if e - s > 0.08]
    if not keep:
        raise SystemExit("O vídeo parece todo em silêncio com esses parâmetros; tente --db -40.")
    expr = "+".join(f"between(t,{s:.3f},{e:.3f})" for s, e in keep)
    tmp = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False)
    fc = f"[0:v]select='{expr}',setpts=N/FRAME_RATE/TB[v]"
    if info["has_audio"]:
        fc += f";[0:a]aselect='{expr}',asetpts=N/SR/TB[a]"
    tmp.write(fc)
    tmp.close()
    maps = ["-map", "[v]"] + (["-map", "[a]"] if info["has_audio"] else [])
    run(ff("-i", a.input, "-filter_complex_script", tmp.name, *maps, *venc(a.crf), *AENC, *MP4, a.output))
    new = sum(e - s for s, e in keep)
    print(f"{a.output}: {info['duration']:.1f}s -> {new:.1f}s ({len(keep)} trechos, {len(sil)} pausas removidas)")


def cmd_trim(a):
    args = ["-ss", str(a.start)] if a.start else []
    if a.end:
        args += ["-to", str(a.end)]
    run(ff("-i", a.input, *args, *venc(a.crf), *AENC, *MP4, a.output))
    print(a.output)


def atempo_chain(f):
    parts = []
    while f > 2.0:
        parts.append("atempo=2.0")
        f /= 2.0
    while f < 0.5:
        parts.append("atempo=0.5")
        f /= 0.5
    parts.append(f"atempo={f:.4f}")
    return ",".join(parts)


def cmd_speed(a):
    info = probe(a.input)
    fc = ["-filter:v", f"setpts=PTS/{a.factor}"]
    if info["has_audio"]:
        fc += ["-filter:a", atempo_chain(a.factor)]
    run(ff("-i", a.input, *fc, *venc(a.crf), *AENC, *MP4, a.output))
    print(a.output)


def cmd_reframe(a):
    w, h = size_for(a.aspect)
    run(ff("-i", a.input, "-filter_complex", f"[0:v]{reframe_filter(w, h, a.mode, a.focus)}[v]", "-map", "[v]", "-map", "0:a?",
           *venc(a.crf), *AENC, *MP4, a.output))
    print(f"{a.output} ({w}x{h}, modo {a.mode})")


def cmd_concat(a):
    infos = [probe(p) for p in a.inputs]
    if a.aspect:
        w, h = size_for(a.aspect)
    else:
        w, h = infos[0]["width"] // 2 * 2, infos[0]["height"] // 2 * 2
    fps = a.fps
    args, fc = [], []
    for i, (p, inf) in enumerate(zip(a.inputs, infos)):
        args += ["-i", p]
        fc.append(f"[{i}:v]{reframe_filter(w, h, a.mode)},fps={fps},format=yuv420p[v{i}]")
        if inf["has_audio"]:
            fc.append(f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a{i}]")
        else:
            fc.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{inf['duration']:.3f}[a{i}]")
    n = len(a.inputs)
    td = a.tdur if a.transition != "none" else 0
    if n == 1:
        vl, al = "[v0]", "[a0]"
    elif a.transition == "none":
        fc.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vout][aout]")
        vl, al = "[vout]", "[aout]"
    else:
        off = 0.0
        prev_v, prev_a = "[v0]", "[a0]"
        for i in range(1, n):
            off += infos[i - 1]["duration"] - td
            fc.append(f"{prev_v}[v{i}]xfade=transition={a.transition}:duration={td}:offset={off:.3f}[vx{i}]")
            fc.append(f"{prev_a}[a{i}]acrossfade=d={td}[ax{i}]")
            prev_v, prev_a = f"[vx{i}]", f"[ax{i}]"
        vl, al = prev_v, prev_a
    run(ff(*args, "-filter_complex", ";".join(fc), "-map", vl, "-map", al, *venc(a.crf), *AENC, *MP4, a.output))
    print(f"{a.output} ({n} clipes, {w}x{h}, transição {a.transition})")


def cmd_grade(a):
    vf = GRADE.get(a.preset, a.preset)
    if a.lut:
        vf = f"lut3d={a.lut}" + ("," + vf if a.preset else "")
    run(ff("-i", a.input, "-vf", vf, "-c:a", "copy", *venc(a.crf), *MP4, a.output))
    print(a.output)


VOICE_CHAIN = ("highpass=f=80,afftdn=nf=-25,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.2:g=3,"
               "acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=3,"
               "deesser=i=0.4")


def cmd_audio(a):
    info = probe(a.input)
    inputs = ["-i", a.input]
    fc = []
    voice = "[0:a]" if info["has_audio"] else None
    if voice and a.clean_voice:
        fc.append(f"{voice}{VOICE_CHAIN}[vc]")
        voice = "[vc]"
    if a.music:
        mpath = a.music
        if a.music == "auto":
            import audio as au
            mpath = os.path.join(tempfile.mkdtemp(), "trilha.wav")
            au.write_wav(mpath, au.music_bed(info["duration"] + 1, a.bpm, a.style))
        inputs += ["-stream_loop", "-1", "-i", mpath]
        fo = max(0.0, info["duration"] - 1.5)
        fc.append(f"[1:a]atrim=0:{info['duration']:.3f},volume={a.music_db}dB,afade=t=out:st={fo:.3f}:d=1.5,"
                  f"aformat=sample_rates=48000:channel_layouts=stereo[mus]")
        if voice and not a.no_duck:
            fc.append(f"{voice}aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[vo1][vo2]")
            fc.append("[mus][vo1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[duck]")
            fc.append("[vo2][duck]amix=inputs=2:duration=first:normalize=0[mix]")
        elif voice:
            fc.append(f"{voice}[mus]amix=inputs=2:duration=first:normalize=0[mix]")
        else:
            fc.append("[mus]anull[mix]")
        last = "[mix]"
    else:
        if not voice:
            raise SystemExit("Vídeo sem áudio e sem --music.")
        last = voice
    fc.append(f"{last}loudnorm=I={a.lufs}:TP=-1.0:LRA=11[aout]")
    run(ff(*inputs, "-filter_complex", ";".join(fc), "-map", "0:v", "-map", "[aout]", "-c:v", "copy", *AENC, "-shortest",
           *MP4, a.output))
    print(a.output)


def fmt_srt(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def cmd_transcribe(a):
    words, segs = [], []
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(a.model, device="auto", compute_type="int8")
        it, _ = model.transcribe(a.input, language=a.lang, word_timestamps=True, vad_filter=True)
        for s in it:
            segs.append((s.start, s.end, s.text.strip()))
            words += [{"word": w.word.strip(), "start": w.start, "end": w.end} for w in (s.words or [])]
    except ImportError:
        try:
            import whisper
            m = whisper.load_model(a.model)
            r = m.transcribe(a.input, language=a.lang, word_timestamps=True)
            for s in r["segments"]:
                segs.append((s["start"], s["end"], s["text"].strip()))
                words += [{"word": w["word"].strip(), "start": w["start"], "end": w["end"]} for w in s.get("words", [])]
        except ImportError:
            raise SystemExit("Transcrição precisa de: pip install faster-whisper  (baixa o modelo na 1ª vez; requer internet).\n"
                             "Alternativa: forneça um .srt (CapCut/YouTube exportam) e use: edit.py captions --srt arquivo.srt")
    base = a.out or os.path.splitext(a.input)[0]
    with open(base + ".srt", "w", encoding="utf-8") as f:
        for i, (s, e, t) in enumerate(segs, 1):
            f.write(f"{i}\n{fmt_srt(s)} --> {fmt_srt(e)}\n{t}\n\n")
    with open(base + "_words.json", "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=1)
    print(f"{base}.srt  {base}_words.json  ({len(words)} palavras) — revise erros de nomes/marcas antes de queimar a legenda")


def parse_srt(path):
    txt = open(path, encoding="utf-8-sig").read()
    out = []
    for blk in re.split(r"\n\s*\n", txt.strip()):
        lines = blk.strip().splitlines()
        m = next((re.match(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)", l) for l in lines if "-->" in l), None)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        s = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        e = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        idx = next(i for i, l in enumerate(lines) if "-->" in l)
        out.append((s, e, " ".join(lines[idx + 1:]).strip()))
    return out


def ass_color(hexc, alpha=0):
    h = hexc.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ass_time(t):
    cs = int(round(t * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def build_ass(w, h, style, events, color, hl):
    s = min(w, h) / 1080
    if style == "tiktok":
        st = (f"Style: Main,Poppins,{int(86 * s)},{ass_color(color)},{ass_color(hl)},&H00000000,&H64000000,"
              f"-1,0,0,0,100,100,0,0,1,{max(3, int(7 * s))},{int(3 * s)},2,{int(80 * s)},{int(80 * s)},{int(h * 0.30)},1")
    elif style == "box":
        st = (f"Style: Main,Poppins,{int(56 * s)},{ass_color(color)},{ass_color(hl)},&H00000000,&H50000000,"
              f"-1,0,0,0,100,100,0,0,3,{int(14 * s)},0,2,{int(80 * s)},{int(80 * s)},{int(h * 0.22)},1")
    else:  # clean
        st = (f"Style: Main,Poppins,{int(58 * s)},{ass_color(color)},{ass_color(hl)},&H00000000,&H78000000,"
              f"-1,0,0,0,100,100,0,0,1,{max(2, int(4 * s))},{int(2 * s)},2,{int(80 * s)},{int(80 * s)},{int(h * 0.12)},1")
    head = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {w}\nPlayResY: {h}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
            "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
            "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, "
            f"Encoding\n{st}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    return head + "".join(f"Dialogue: 0,{ass_time(s0)},{ass_time(e0)},Main,,0,0,0,,{t}\n" for s0, e0, t in events)


def word_events(words, style, hl, upper, max_words=3, max_dur=1.5):
    chunks, cur = [], []
    for w in words:
        if not w["word"]:
            continue
        if cur and (len(cur) >= max_words or w["start"] - cur[-1]["end"] > 0.45 or w["end"] - cur[0]["start"] > max_dur
                    or cur[-1]["word"].endswith((".", "?", "!", ","))):
            chunks.append(cur)
            cur = []
        cur.append(w)
    if cur:
        chunks.append(cur)
    ev = []
    hc = ass_color(hl)
    for ch in chunks:
        for i, w in enumerate(ch):
            s = w["start"]
            e = ch[i + 1]["start"] if i + 1 < len(ch) else ch[-1]["end"] + 0.15
            parts = []
            for j, x in enumerate(ch):
                t = x["word"].upper() if upper else x["word"]
                if j == i:
                    pop = r"{\fscx112\fscy112\t(0,90,\fscx100\fscy100)}" if style == "tiktok" else ""
                    parts.append(f"{{\\c{hc}}}{pop}{t}{{\\c\\fscx100\\fscy100}}")
                else:
                    parts.append(t)
            ev.append((s, e, " ".join(parts)))
    return ev


def cmd_captions(a):
    info = probe(a.input)
    w, h = info["width"], info["height"]
    if a.words:
        words = json.load(open(a.words, encoding="utf-8"))
        ev = word_events(words, a.style, a.highlight, a.style == "tiktok" if a.upper is None else a.upper, a.max_words)
    elif a.srt:
        ev = [(s, e, (t.upper() if a.upper else t).replace("\n", "\\N")) for s, e, t in parse_srt(a.srt)]
    else:
        raise SystemExit("Informe --words (de transcribe) ou --srt.")
    ass = os.path.join(tempfile.mkdtemp(), "legenda.ass")
    with open(ass, "w", encoding="utf-8") as f:
        f.write(build_ass(w, h, a.style, ev, a.color, a.highlight))
    esc = ass.replace("\\", "/").replace(":", "\\:")
    fd = os.path.abspath(FONT_DIR).replace(":", "\\:")
    run(ff("-i", a.input, "-vf", f"subtitles='{esc}':fontsdir='{fd}'", "-c:a", "copy", *venc(a.crf), *MP4, a.output))
    if a.keep_ass:
        import shutil
        shutil.copy(ass, os.path.splitext(a.output)[0] + ".ass")
    print(f"{a.output} ({len(ev)} eventos de legenda, estilo {a.style})")


def cmd_overlay(a):
    info = probe(a.input)
    W, H = info["width"], info["height"]
    ow = int(W * a.w) // 2 * 2
    is_img = os.path.splitext(a.file)[1].lower() in (".png", ".jpg", ".jpeg", ".webp")
    end = a.end if a.end else info["duration"]
    ov_in = ["-loop", "1", "-t", str(end), "-i", a.file] if is_img else (["-c:v", "libvpx-vp9"] if a.file.endswith(".webm") else []) + ["-i", a.file]
    fade = f",fade=t=in:st=0:d=0.25:alpha=1" if a.fade else ""
    fc = (f"[1:v]format=rgba,scale={ow}:-1{fade},setpts=PTS-STARTPTS+{a.start}/TB[ov];"
          f"[0:v][ov]overlay=x={a.x}*W-w/2:y={a.y}*H-h/2:enable='between(t,{a.start},{end})':eof_action=pass[v]")
    run(ff("-i", a.input, *ov_in, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", *venc(a.crf), "-c:a", "copy", *MP4, a.output))
    print(a.output)


def cmd_zoom(a):
    info = probe(a.input)
    w, h = info["width"] // 2 * 2, info["height"] // 2 * 2
    ts = [float(x) for x in a.at.split(",")]
    # zoom que entra rápido (0.12s), segura e volta suave — ênfase de fala/edição de criador
    terms = [f"if(between(t,{t0:.3f},{t0 + a.hold:.3f}),"
             f"1+({a.amount}-1)*min(1,(t-{t0:.3f})/0.12)*min(1,({t0 + a.hold:.3f}-t)/0.25),0)" for t0 in ts]
    z = "max(1," + "+".join(terms) + ")" if len(terms) == 1 else "max(1," + "+".join(terms) + ")"
    vf = (f"scale=w='trunc({w}*({z})/2)*2':h='trunc({h}*({z})/2)*2':eval=frame,"
          f"crop={w}:{h}:(iw-{w})/2:(ih-{h})/2,setsar=1")
    run(ff("-i", a.input, "-vf", vf, "-c:a", "copy", *venc(a.crf), *MP4, a.output))
    print(a.output)


def cmd_cover(a):
    from PIL import Image
    from common import gradient
    tmp = os.path.join(tempfile.mkdtemp(), "f.png")
    run(ff("-ss", str(a.time), "-i", a.input, "-frames:v", "1", tmp))
    im = Image.open(tmp).convert("RGBA")
    W, H = im.size
    shade = gradient(W, H, (0, 0, 0), (0, 0, 0), 90)
    import numpy as np
    alpha = (np.linspace(0, 1, H) ** 2 * 200).astype("uint8")
    shade.putalpha(Image.fromarray(np.repeat(alpha[:, None], W, 1)))
    im.alpha_composite(shade)
    if a.text:
        lay = render_text(a.text, W * 0.88, min(W, H) * 0.11, "#FFFFFF", a.highlight, "black", upper=True, hl_box=True, max_lines=3)
        im.alpha_composite(lay, (int((W - lay.width) / 2), int(H * (0.62 if H > W else 0.55) - lay.height / 2)))
    im.convert("RGB").save(a.output, quality=95)
    print(a.output)


def cmd_export(a):
    p = PLATFORM[a.platform]
    info = probe(a.input)
    if p.get("aspect"):
        w, h = size_for(p["aspect"])
        vf = reframe_filter(w, h, a.mode)
    else:
        k = min(1, p["max_side"] / max(info["width"], info["height"]))
        w, h = int(info["width"] * k) // 2 * 2, int(info["height"] * k) // 2 * 2
        vf = f"scale={w}:{h}"
    fc = f"[0:v]{vf},fps={p['fps']},format=yuv420p[v]"
    maps = ["-map", "[v]"]
    if info["has_audio"]:
        fc += f";[0:a]loudnorm=I={p['lufs']}:TP=-1.0:LRA=11,aresample=48000[a]"
        maps += ["-map", "[a]"]
    run(ff("-i", a.input, "-filter_complex", fc, *maps, *venc(p["crf"], p["maxrate"]), *AENC, *MP4, a.output))
    print(f"{a.output} ({a.platform}: {w}x{h} {p['fps']}fps, {p['lufs']} LUFS)")


def main():
    global FF
    FF = ffmpeg_bin()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)

    def P(name, io=True, out=True):
        p = sp.add_parser(name)
        if io:
            p.add_argument("input")
        if out:
            p.add_argument("output")
        p.add_argument("--crf", type=int, default=18)
        return p

    p = P("info", out=False)
    p.add_argument("--silences", action="store_true")
    p.add_argument("--scenes", action="store_true")
    p.add_argument("--db", type=float, default=-32)
    p.add_argument("--min", type=float, default=0.45)
    p = P("cut-silence")
    p.add_argument("--db", type=float, default=-32, help="abaixo disso é silêncio (dB). Ambiente barulhento: -28; quieto: -38")
    p.add_argument("--min", type=float, default=0.45, help="pausa mínima para cortar (s)")
    p.add_argument("--pad", type=float, default=0.12, help="respiro mantido em cada lado do corte (s)")
    p = P("trim")
    p.add_argument("--start", type=float)
    p.add_argument("--end", type=float)
    p = P("speed")
    p.add_argument("--factor", type=float, required=True)
    p = P("reframe")
    p.add_argument("--aspect", default="9:16")
    p.add_argument("--mode", default="blur", choices=["blur", "crop", "fit"])
    p.add_argument("--focus", type=float, default=0.5, help="crop: 0 = esquerda, 0.5 = centro, 1 = direita")
    p = sp.add_parser("concat")
    p.add_argument("output")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--transition", default="fade", help="none, fade, fadeblack, fadewhite, slideleft, slideup, wipeleft, circleopen, "
                   "smoothleft, zoomin, dissolve, radial, pixelize …")
    p.add_argument("--tdur", type=float, default=0.35)
    p.add_argument("--aspect")
    p.add_argument("--mode", default="blur", choices=["blur", "crop", "fit"])
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--crf", type=int, default=18)
    p = P("grade")
    p.add_argument("--preset", default="clean", help=", ".join(GRADE))
    p.add_argument("--lut")
    p = P("audio")
    p.add_argument("--music", help="arquivo de música ou 'auto' (trilha sintetizada livre de direitos)")
    p.add_argument("--music-db", type=float, default=-20)
    p.add_argument("--bpm", type=float, default=110)
    p.add_argument("--style", default="chill")
    p.add_argument("--clean-voice", action="store_true", help="reduz ruído, EQ de voz, compressor e de-esser")
    p.add_argument("--no-duck", action="store_true")
    p.add_argument("--lufs", type=float, default=-14)
    p = P("transcribe", out=False)
    p.add_argument("--out")
    p.add_argument("--lang", default="pt")
    p.add_argument("--model", default="small")
    p = P("captions")
    p.add_argument("--words")
    p.add_argument("--srt")
    p.add_argument("--style", default="tiktok", choices=["tiktok", "clean", "box"])
    p.add_argument("--color", default="#FFFFFF")
    p.add_argument("--highlight", default="#FFD23F")
    p.add_argument("--upper", action="store_true", default=None)
    p.add_argument("--max-words", type=int, default=3)
    p.add_argument("--keep-ass", action="store_true")
    p = P("overlay")
    p.add_argument("--file", required=True, help=".mov/.webm com alfa (motion.py, render3d.py) ou .png")
    p.add_argument("--x", type=float, default=0.5)
    p.add_argument("--y", type=float, default=0.5)
    p.add_argument("--w", type=float, default=0.5, help="largura relativa ao vídeo")
    p.add_argument("--start", type=float, default=0)
    p.add_argument("--end", type=float)
    p.add_argument("--fade", action="store_true")
    p = P("zoom")
    p.add_argument("--at", required=True, help="tempos separados por vírgula")
    p.add_argument("--amount", type=float, default=1.18)
    p.add_argument("--hold", type=float, default=1.2)
    p = P("cover")
    p.add_argument("--time", type=float, default=1.0)
    p.add_argument("--text")
    p.add_argument("--highlight", default="#FFD23F")
    p = P("export")
    p.add_argument("--platform", required=True, choices=list(PLATFORM))
    p.add_argument("--mode", default="blur", choices=["blur", "crop", "fit"])
    a = ap.parse_args()
    {"info": cmd_info, "cut-silence": cmd_cut_silence, "trim": cmd_trim, "speed": cmd_speed, "reframe": cmd_reframe,
     "concat": cmd_concat, "grade": cmd_grade, "audio": cmd_audio, "transcribe": cmd_transcribe, "captions": cmd_captions,
     "overlay": cmd_overlay, "zoom": cmd_zoom, "cover": cmd_cover, "export": cmd_export}[a.cmd](a)


if __name__ == "__main__":
    main()
