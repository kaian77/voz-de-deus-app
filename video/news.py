#!/usr/bin/env python3
"""Piloto de notícias — posta sozinho no Instagram marcado como "Notícias" em Contas (primeiro caso: @lula__nao).

Roda no GitHub Actions (workflow "Piloto de notícias", de meia em meia hora das 7h às 21h). Em cada rodada, para cada
conta Instagram com meta.brand = "noticias" (e sem meta.news_paused):
1. vê se já passou um horário do dia sem post (meta.news_per_day, padrão 3: 8h10, 12h40 e 19h20 de Brasília);
2. lê as notícias das últimas 36 h em fontes oficiais que liberam a reprodução com crédito (Agência Brasil, Agência
   Câmara, Agência Senado) — nada de foto de jornal/agência paga (Reuters, AFP, Getty...): dá derrubada por direito autoral;
3. a IA escolhe a notícia que mais interessa ao público da conta (bolso, impostos, gastos do governo, liberdade de
   expressão, Congresso), lê o texto da matéria e escreve capa + legenda SÓ com o que está na matéria;
4. monta o carrossel: capa chamativa (foto real da matéria, faixa, título grande em Anton) + o anúncio do PDF que combina
   (Seu Dinheiro Protegido ou Fale Sem Medo) e grava o post como "scheduled" para agora: o publisher do Studio posta.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY (opcional NEWS_MODEL).
Uso: python3 video/news.py            (rodada normal)
     python3 video/news.py --force    (posta uma agora, mesmo fora do horário)
     python3 video/news.py --local foto.jpg "TÍTULO com *destaque*" "KICKER"   (só desenha a capa em capa.jpg)
"""
import datetime as dt
import html
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "news_assets")
UA = "Mozilla/5.0 (compatible; StudioNoticias/1.0)"
BRT = dt.timezone(dt.timedelta(hours=-3))

FEEDS = [
    ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml"),
    ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml"),
    ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml"),
    ("Agência Câmara", "https://www.camara.leg.br/noticias/rss/ultimas-noticias"),
    ("Agência Senado", "https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS"),
]
# Foto de agência paga dentro dessas matérias não pode ir para o post
PAID = re.compile(r"reuters|afp|getty|associated press|\bap photo|\bap\b|efe|shutterstock|istock|folhapress|estad[aã]o", re.I)
SLOTS = {1: ["12:40"], 2: ["12:40", "19:20"], 3: ["08:10", "12:40", "19:20"], 4: ["08:10", "12:00", "16:00", "20:00"],
         5: ["07:40", "10:30", "13:00", "17:00", "20:30"]}
CTA = {"dinheiro": "cta-dinheiro.jpg", "fala": "cta-fala.jpg"}
CTA_TEXT = {
    "dinheiro": ("📘 No guia \"Seu Dinheiro Protegido\" eu mostro, passo a passo, como sair das dívidas caras, montar sua "
                 "reserva, usar o dólar a seu favor e pagar menos imposto dentro da lei.\n"
                 "👉 Toque no LINK DA BIO e garanta o seu hoje. Quem se prepara agora não paga a conta depois."),
    "fala": ("📕 No guia \"Fale Sem Medo\" você descobre o que pode postar sem ter a conta derrubada ou virar réu: o que a "
             "lei diz, o que dá processo e como se proteger.\n"
             "👉 Toque no LINK DA BIO e garanta o seu antes de postar a próxima opinião."),
}


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------------------------------------ Supabase

def sb():
    sys.path.insert(0, HERE)
    import worker  # noqa: E402 — só precisa das chaves na rodada de verdade

    return worker


def storage_upload(data, dest, ctype):
    w = sb()
    w.http("POST", f"{w.URL}/storage/v1/object/media/{dest}", data, {"Content-Type": ctype, "x-upsert": "true"}, raw=True)
    return f"{w.URL}/storage/v1/object/public/media/{dest}"


def track_ai(data):
    try:
        u = data.get("usage") or {}
        sb().rest("POST", "ai_usage", {"source": "noticias", "model": data.get("model"),
                                       "input_tokens": u.get("input_tokens") or 0, "output_tokens": u.get("output_tokens") or 0})
    except Exception:  # noqa: BLE001
        pass


# ------------------------------------------------------------------------------------------------ fontes

def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def clean(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def parse_date(s):
    from email.utils import parsedate_to_datetime

    try:
        d = parsedate_to_datetime(s)
        return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
    except Exception:  # noqa: BLE001
        try:
            return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:  # noqa: BLE001
            return None


def news_items(hours=36):
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
    out, seen = [], set()
    for source, url in FEEDS:
        try:
            root = ET.fromstring(fetch(url))
        except Exception as e:  # noqa: BLE001 — uma fonte fora do ar não para as outras
            log(f"  fonte {url}: {e}")
            continue
        n = 0
        for it in root.iter("item"):
            title = clean(it.findtext("title"))
            link = (it.findtext("link") or "").strip()
            when = parse_date(it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date") or "")
            if not title or not link or link in seen or (when and when < since):
                continue
            seen.add(link)
            out.append({"source": source, "title": title, "link": link, "summary": clean(it.findtext("description"))[:400],
                        "when": when.isoformat() if when else ""})
            n += 1
        log(f"  {source}: {n} notícias ({url.split('/')[2]})")
    return out


def article(url):
    """Texto, foto (og:image) e crédito da foto da matéria."""
    raw = fetch(url).decode("utf-8", errors="replace")
    m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', raw) or \
        re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image', raw)
    image = html.unescape(m.group(1)) if m else None
    paras = [clean(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", raw, re.S)]
    text = "\n".join(p for p in paras if len(p) > 60)[:9000]
    # Crédito: só no texto visível (sem <style>/<script>, que têm "img {" e afins) e com cara de nome
    visible = re.sub(r"<(style|script|noscript)[^>]*>.*?</\1>", " ", raw, flags=re.S | re.I)
    visible = clean(re.sub(r"<[^>]+>", "\n", visible))
    credit = None
    for c in re.findall(r"\b(?:Foto|Fotos|Imagem|Crédito)\s*:\s*([A-ZÀ-Ú][^\n|]{2,60})", visible):
        c = re.split(r"\s{2,}|\s[-–]\s(?=[A-Z][a-z]+ \d)", c.strip())[0].strip(" .,;")
        if re.fullmatch(r"[A-Za-zÀ-ÿ0-9 .,'/&()-]{3,60}", c) and not re.search(r"[{}<>#;]|\bimg\b|\.ps-|slide", c, re.I):
            credit = c
            break
    return {"text": text, "image": image, "credit": credit}


# ------------------------------------------------------------------------------------------------ IA

def claude(prompt, schema, max_tokens=4000):
    key = os.environ["ANTHROPIC_API_KEY"]
    model = os.environ.get("NEWS_MODEL") or "claude-sonnet-5-5"  # escolher e resumir notícia: modelo mais barato basta
    body = json.dumps({"model": model, "max_tokens": max_tokens,
                       "output_config": {"format": {"type": "json_schema", "schema": schema}},
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST", headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"IA (Anthropic) {e.code}: {e.read().decode(errors='replace')[:300]}") from None
    track_ai(data)
    for b in data.get("content", []):
        if b.get("type") == "text" and b.get("text", "").strip():
            return json.loads(b["text"])
    raise RuntimeError("a IA não respondeu")


AUDIENCE = (
    "Público da conta: brasileiros de direita/conservadores, 30 a 65 anos, preocupados com o próprio bolso (impostos, "
    "inflação, juros, dólar, gastos e contas do governo), com liberdade de expressão e com o que o governo Lula e o "
    "Congresso estão decidindo."
)


def pick(items, profile):
    listing = "\n".join(f"[{i}] ({x['source']}) {x['title']} — {x['summary'][:220]}" for i, x in enumerate(items))
    schema = {"type": "object", "additionalProperties": False, "required": ["ranking"],
              "properties": {"ranking": {"type": "array", "items": {"type": "integer"},
                                         "description": "índices das 5 melhores notícias, da melhor para a pior"}}}
    r = claude(
        f"Você é o editor de uma página de notícias no Instagram. {AUDIENCE}\n{profile}\n"
        "Escolha as 5 notícias abaixo com mais chance de engajar esse público (comentar, compartilhar): decisões que mexem "
        "no bolso, aumento de imposto ou gasto público, ações do governo federal, votações polêmicas no Congresso, "
        "liberdade de expressão. Evite notas burocráticas, agenda, esporte, cultura e notícias regionais pequenas.\n\n"
        f"{listing}", schema, 1000)
    return [i for i in r["ranking"] if 0 <= i < len(items)]


def write(item, art, profile):
    schema = {
        "type": "object", "additionalProperties": False,
        "required": ["ok", "kicker", "headline", "caption", "hashtags", "pdf"],
        "properties": {
            "ok": {"type": "boolean", "description": "false se a matéria não tem fatos suficientes para um post honesto"},
            "kicker": {"type": "string", "description": "1 a 2 palavras em maiúsculas para a faixa da capa: SEU BOLSO, IMPOSTOS, "
                                                         "BRASÍLIA, CONGRESSO, GOVERNO LULA, ATENÇÃO... URGENTE só se a matéria é de hoje e muda algo já"},
            "headline": {"type": "string", "description": "título da capa, 6 a 12 palavras, forte e chamativo mas 100% fiel à "
                                                          "matéria; marque 1 a 3 palavras-chave com *asteriscos* (ficam amarelas); "
                                                          "apelativo: mexa com o bolso, o medo de perder ou a indignação do leitor "
                                                          "(ex.: 'E QUEM PAGA É VOCÊ', 'SEU DINHEIRO NA MIRA'), sempre verdadeiro"},
            "caption": {"type": "string", "description": "legenda que VENDE: 1ª linha = gancho forte e emocional (🚨 "
                                                         "pode abrir); depois 3 a 5 linhas curtas com os fatos da matéria (números, "
                                                         "quem, quando); depois 2 linhas mostrando o impacto no bolso/na vida do "
                                                         "leitor e a urgência de se preparar (consequência lógica, sem número "
                                                         "inventado); termine com uma pergunta curta para comentar. Até 4 emojis. "
                                                         "Sem hashtags, sem link, sem crédito e sem falar do guia (a chamada do "
                                                         "guia entra depois)"},
            "hashtags": {"type": "array", "items": {"type": "string"}, "description": "5 a 8 hashtags sem #"},
            "pdf": {"type": "string", "enum": ["dinheiro", "fala"],
                    "description": "dinheiro = guia Seu Dinheiro Protegido (economia, imposto, inflação, governo e gastos); "
                                   "fala = guia Fale Sem Medo (censura, redes sociais, STF/processos por opinião, liberdade)"},
        },
    }
    return claude(
        f"Você escreve os posts de uma página de notícias no Instagram. {AUDIENCE}\n{profile}\n\n"
        "Regras que não podem ser quebradas:\n"
        "- Use SÓ fatos que estão no texto da matéria abaixo. Nada de número, fala, nome ou acontecimento que não esteja nela.\n"
        "- O tom pode ser crítico e opinativo (é uma página de direita), mas opinião vem como pergunta ou comentário, nunca "
        "como fato inventado. Nada de xingamento, acusação de crime sem condenação, chamado para violência ou para votar.\n"
        "- Seja APELATIVO e persuasivo, como página que vende: mexa com o bolso, o medo de perder dinheiro ou a "
        "liberdade, a indignação e a urgência. Mas o título e os fatos têm que ser verdadeiros (nada de 'BOMBA' ou número "
        "que a matéria não sustenta): o exagero derruba a página e a confiança de quem compraria.\n"
        "- Português do Brasil simples, frases curtas, sem clichê de IA.\n\n"
        f"Fonte: {item['source']}\nTítulo original: {item['title']}\nPublicada: {item['when']}\n\nTexto da matéria:\n{art['text']}",
        schema)


# ------------------------------------------------------------------------------------------------ capa

def font(name, size):
    from PIL import ImageFont

    return ImageFont.truetype(os.path.join(ASSETS, name), size)


def cover(photo_bytes, headline, kicker, credit, handle, out=None):
    """Capa 1080x1350: foto real, degradê escuro, faixa amarela e título grande em Anton (palavras *assim* em amarelo)."""
    from PIL import Image, ImageDraw, ImageFilter, ImageOps

    W, H = 1080, 1350
    YEL, WHITE, GREEN = (255, 214, 0), (255, 255, 255), (0, 156, 59)
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(photo_bytes))).convert("RGB")
    im = ImageOps.fit(im, (W, H), Image.LANCZOS, centering=(0.5, 0.35))
    # degradê de baixo para cima (o título fica legível em qualquer foto) + leve escurecida no topo
    shade = Image.new("L", (1, H))
    for y in range(H):
        top_dark = 0.22 * max(0.0, 1 - y / (H * 0.22))
        low_dark = min(0.96, 1.25 * max(0.0, (y - H * 0.32) / (H * 0.68)) ** 0.9)
        shade.putpixel((0, y), int(255 * max(top_dark, low_dark)))
    im = Image.composite(Image.new("RGB", (W, H), (5, 8, 14)), im, shade.resize((W, H)))
    d = ImageDraw.Draw(im)

    # título: palavras em maiúsculas, quebra automática, tamanho que cabe em até 4 linhas
    words = []
    for part in re.split(r"(\*[^*]+\*)", headline.strip()):
        hi = part.startswith("*") and part.endswith("*")
        for w in part.strip("*").split():
            words.append((w.upper(), hi))
    x0, maxw, bottom = 60, W - 120, H - 150
    for size in range(150, 66, -4):
        f = font("Anton-Regular.ttf", size)
        space = d.textlength(" ", font=f)
        lines, cur, cw = [], [], 0
        for w, hi in words:
            ww = d.textlength(w, font=f)
            if cur and cw + space + ww > maxw:
                lines.append(cur)
                cur, cw = [], 0
            cur.append((w, hi, ww))
            cw += (space if cw else 0) + ww
        if cur:
            lines.append(cur)
        if len(lines) <= 4 and all(sum(x[2] for x in ln) + space * (len(ln) - 1) <= maxw for ln in lines):
            break
    lh = int(size * 1.02)
    top = bottom - lh * len(lines)
    # faixa (kicker) logo acima do título
    kf = font("Anton-Regular.ttf", 46)
    k = (kicker or "NOTÍCIA").upper().strip()[:24]
    kw = d.textlength(k, font=kf)
    ky = top - 92
    d.rounded_rectangle((x0, ky, x0 + kw + 44, ky + 68), radius=8, fill=YEL)
    d.text((x0 + 22, ky + 6), k, font=kf, fill=(15, 15, 15))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for i, ln in enumerate(lines):
        x, y = x0, top + i * lh
        for w, hi, ww in ln:
            sd.text((x + 4, y + 5), w, font=f, fill=(0, 0, 0, 170))
            x += ww + space
    im.paste(shadow.filter(ImageFilter.GaussianBlur(6)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(im)
    for i, ln in enumerate(lines):
        x, y = x0, top + i * lh
        for w, hi, ww in ln:
            d.text((x, y), w, font=f, fill=YEL if hi else WHITE)
            x += ww + space

    # rodapé: @ da página, crédito da foto e "arraste"
    sf = font("Inter-Bold.otf", 30)
    cf = font("Inter-Bold.otf", 22)
    d.text((x0, H - 108), handle, font=sf, fill=WHITE)
    af = font("Anton-Regular.ttf", 36)
    d.text((W - 60 - d.textlength("ARRASTE", font=af) - 46, H - 114), "ARRASTE", font=af, fill=YEL)
    d.polygon([(W - 92, H - 106), (W - 60, H - 90), (W - 92, H - 74)], fill=YEL)
    if credit:
        c = f"Foto: {credit}"[:70]
        d.text((x0, H - 66), c, font=cf, fill=(200, 205, 212))
    # faixa verde e amarela embaixo (mesma das artes dos PDFs)
    d.rectangle((0, H - 22, W // 2, H), fill=GREEN)
    d.rectangle((W // 2, H - 22, W, H), fill=YEL)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    if out:
        with open(out, "wb") as fh:
            fh.write(buf.getvalue())
    return buf.getvalue()


# ------------------------------------------------------------------------------------------------ rodada

def due_today(acc, posts, force):
    """Quantos posts já deviam ter saído hoje x quantos saíram."""
    now = dt.datetime.now(BRT)
    per_day = int((acc.get("meta") or {}).get("news_per_day") or 3)
    slots = SLOTS.get(per_day, SLOTS[3])
    passed = sum(1 for s in slots if now.strftime("%H:%M") >= s)
    done = len(posts)
    log(f"  hoje: {done} post(s), {passed} horário(s) já passaram de {len(slots)}")
    return force or done < passed


def run_account(acc, force=False):
    w = sb()
    meta = acc.get("meta") or {}
    handle = f"@{acc.get('username') or 'conta'}"
    log(f"Conta {handle}")
    if meta.get("news_paused") and not force:
        log("  pausado em Contas")
        return
    start = dt.datetime.now(BRT).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(dt.timezone.utc)
    month = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)
    recent = w.rest("GET", f"posts?user_id=eq.{acc['user_id']}&created_at=gte.{month.strftime("%Y-%m-%dT%H:%M:%SZ")}"
                           "&select=id,created_at,status,options&order=created_at.desc&limit=400") or []
    mine = [p for p in recent if (p.get("options") or {}).get("brand") == "noticias"
            and ((p.get("options") or {}).get("account_ids") or {}).get("instagram") == acc["id"]]
    today = [p for p in mine if p["created_at"] >= start.isoformat()[:19]]
    if not due_today(acc, today, force):
        return
    used = {((p.get("options") or {}).get("news") or {}).get("url") for p in mine}
    used_titles = {((p.get("options") or {}).get("news") or {}).get("title") for p in mine}
    items = [x for x in news_items() if x["link"] not in used and x["title"] not in used_titles]
    if not items:
        log("  nenhuma notícia nova")
        return
    profile = f"Perfil da página: {meta['profile']}" if meta.get("profile") else ""
    order = pick(items[:60], profile)
    for i in order:
        item = items[i]
        log(f"  candidata: {item['title']}")
        try:
            art = article(item["link"])
        except Exception as e:  # noqa: BLE001
            log(f"    matéria não abriu: {e}")
            continue
        if not art["image"] or len(art["text"]) < 400:
            log("    sem foto ou texto curto")
            continue
        if art["credit"] and PAID.search(art["credit"]):
            log(f"    foto de agência paga ({art['credit']}): pula")
            continue
        post = write(item, art, profile)
        if not post.get("ok"):
            log("    a IA achou a matéria fraca")
            continue
        try:
            photo = fetch(art["image"], 60)
        except Exception as e:  # noqa: BLE001
            log(f"    foto não baixou: {e}")
            continue
        credit = art["credit"] or item["source"]
        if item["source"].split()[-1].lower() not in credit.lower():
            credit = f"{credit} / {item['source']}"
        img = cover(photo, post["headline"], post["kicker"], credit, handle)
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
        base = f"{acc['user_id']}/noticias"
        url1 = storage_upload(img, f"{base}/{stamp}.jpg", "image/jpeg")
        with open(os.path.join(ASSETS, CTA[post["pdf"]]), "rb") as fh:
            url2 = storage_upload(fh.read(), f"{base}/{CTA[post['pdf']]}", "image/jpeg")
        tags = " ".join(f"#{h.lstrip('#').replace(' ', '')}" for h in post["hashtags"][:8])
        caption = (f"{post['caption'].strip()}\n\n{CTA_TEXT[post['pdf']]}\n\n"
                   f"Fonte: {item['source']}. Foto: {credit}.\n\n{tags}")[:2150]
        row = w.rest("POST", "posts", {
            "user_id": acc["user_id"], "title": f"Notícias: {item['title'][:90]}", "kind": "carousel",
            "platforms": ["instagram"], "caption": caption,
            "media": [{"url": url1, "type": "image"}, {"url": url2, "type": "image"}],
            "scheduled_at": dt.datetime.now(dt.timezone.utc).isoformat(), "status": "scheduled", "created_by": "agent",
            "notes": f"Notícia: {item['link']}",
            "options": {"brand": "noticias", "account_ids": {"instagram": acc["id"]},
                        "news": {"url": item["link"], "title": item["title"], "source": item["source"], "pdf": post["pdf"]}},
        })
        log(f"  ✓ post criado ({row[0]['id'] if row else '?'}): {post['headline']}")
        return
    log("  nenhuma candidata serviu nesta rodada")


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--local":
        with open(sys.argv[2], "rb") as fh:
            cover(fh.read(), sys.argv[3] if len(sys.argv) > 3 else "Governo *aumenta* imposto e você *paga* a conta?",
                  sys.argv[4] if len(sys.argv) > 4 else "SEU BOLSO", "Fulano de Tal / Agência Brasil", "@lula__nao", "capa.jpg")
        print("capa.jpg")
        return
    force = "--force" in sys.argv
    w = sb()
    accs = w.rest("GET", "social_accounts?platform=eq.instagram&select=id,user_id,username,meta") or []
    accs = [a for a in accs if (a.get("meta") or {}).get("brand") == "noticias"]
    if not accs:
        log("Nenhuma conta do Instagram marcada como Notícias em Contas.")
        return
    for acc in accs:
        try:
            run_account(acc, force)
        except Exception as e:  # noqa: BLE001 — uma conta com erro não para as outras
            log(f"  erro: {e}")


if __name__ == "__main__":
    main()
