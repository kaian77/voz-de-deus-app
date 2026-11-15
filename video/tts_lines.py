"""Narração avulsa (edge-tts, grátis) para montar vídeos fora do Studio: uma fala por linha.
Uso: python3 tts_lines.py <pasta> <nome> <voz> "fala 1|fala 2|..."
Gera <nome>-<i>.mp3 e <nome>.json com a duração e as palavras (tempo de cada uma) de cada fala.
"""
import json
import os
import subprocess
import sys

import youtube as yt


def main():
    out, name, voice, text = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    os.makedirs(out, exist_ok=True)
    lines = []
    for i, line in enumerate(t.strip() for t in text.split("|") if t.strip()):
        mp3 = os.path.join(out, f"{name}-{i}.mp3")
        words = yt.speak(line, voice, mp3)
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3],
                                   capture_output=True, text=True, check=True).stdout)
        lines.append({"text": line, "file": os.path.basename(mp3), "duration": dur, "words": words})
        print(f"{i}: {dur:.2f}s  {line}")
    json.dump({"voice": voice, "lines": lines}, open(os.path.join(out, f"{name}.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
