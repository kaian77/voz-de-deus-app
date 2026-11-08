"""Restaurar foto antiga pela fal.ai (crédito FAL_KEY). Uso: python3 video/restore_photo.py <url da foto> <pasta de saída>
Faz 3 versões: A = rostos restaurados (CodeFormer); B = A colorida (DDColor); C = restaurada e colorida pela IA de edição (FLUX Kontext)."""
import json, os, sys, urllib.error, urllib.request

KEY = os.environ["FAL_KEY"]

def fal(model, body):
    req = urllib.request.Request(f"https://fal.run/{model}", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Key {KEY}", "Content-Type": "application/json", "User-Agent": "social-studio/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            out = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{model}: {e.code} {e.read().decode(errors='replace')[:300]}")
    img = out.get("image") or (out.get("images") or [None])[0]
    if not img:
        raise RuntimeError(f"{model}: {json.dumps(out)[:300]}")
    return img["url"]

def save(url, path):
    urllib.request.urlretrieve(url, path)
    print("ok", path, flush=True)

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
try:
    a = fal("fal-ai/codeformer", {"image_url": src, "fidelity": 0.7, "upscaling": 2, "face_upscale": True})
    save(a, f"{out}/A-restaurada.jpg")
    b = fal("fal-ai/ddcolor", {"image_url": a})
    save(b, f"{out}/B-restaurada-colorida.jpg")
except Exception as e:
    print("A/B falhou:", e, flush=True)
try:
    c = fal("fal-ai/flux-pro/kontext", {"image_url": src, "prompt": (
        "Restore this antique photograph: remove scratches, dust, stains and noise, sharpen the faces, "
        "and colorize it with natural realistic colors. Keep every person's face, expression, pose, clothing "
        "and the frame exactly the same.")})
    save(c, f"{out}/C-ia-restaurada-colorida.jpg")
except Exception as e:
    print("C falhou:", e, flush=True)
