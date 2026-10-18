#!/usr/bin/env python3
"""Achadinhos (Renda extra) — vídeos de produtos da Shopee com o link de afiliado do dono, para o Shopee Vídeo.

Fluxo: lê o feed de produtos da Shopee Afiliados (CSV enorme, atualizado todo dia) em pedaços espalhados pelo
arquivo, filtra produtos baratos, bem avaliados e permitidos no Shopee Vídeo, escolhe os mais curtidos (um por
categoria), a IA escreve o texto, o motor cinema.py faz o vídeo de 15 s e tudo vai para a tabela deals.
A Shopee não tem API de postagem: o dono baixa o vídeo no Studio (Renda extra → Achadinhos) e posta pelo app.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, SHOPEE_FEED_OFICIAL / SHOPEE_FEED_BR (links dos
feeds), SHOPEE_AFFILIATE_ID, DEALS_COUNT (padrão 3). Uso: python3 deals.py [--check]
"""
import csv
import datetime as dt
import io
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

from worker import URL, download_photo, http, rest
import youtube as yt

HERE = os.path.dirname(os.path.abspath(__file__))
CINEMA = os.path.join(HERE, "engine", "scripts", "cinema.py")
AFF_ID = os.environ.get("SHOPEE_AFFILIATE_ID") or ""
COUNT = int(os.environ.get("DEALS_COUNT") or 3)
CHUNKS, CHUNK = 36, 1_500_000  # pedaços lidos do feed (bytes)
# Cores da Shopee (laranja) no vídeo, não as da Brax
COLORS = {"primary": "#EE4D2D", "secondary": "#1A0A06", "accent": "#FFD43B", "text": "#FFFFFF"}

# Política do Shopee Vídeo (produtos proibidos/restritos) + o que não combina com achadinho
BAD_CATEGORIES = ("vehicle", "automobile", "motorcycle", "health", "medic", "food", "beverage", "alcohol", "tobacco",
                  "ticket", "voucher", "service", "book", "magazine", "pet", "garden", "plant")
BAD_WORDS = re.compile(
    # palavras inteiras
    r"\b(faca|facas|facão|punhal|canivete|navalha|arma|armas|airsoft|munição|estilingue|besta|taser|pod|seda|isqueiro|"
    r"fósforo|veneno|remédio|suplemento|moeda|moedas|cédula|aposta|escuta|sex|usado|usada|seminovo|extintor)\b"
    # começos de palavra (pegam plural e feminino)
    r"|\b(lâmina|soco ingl|spray de pimenta|cigarr|vape|narguil|tabac|maçaric|inflamáve|inseticid|raticid|minoxidil|"
    r"medicament|fitoterápic|emagrec|termogênic|anaboliz|hormôni|lente de contato|aparelho auditivo|clarea|"
    r"teste de covid|teste de gravidez|preservativ|sexual|erótic|lingerie|íntim|caixa misteriosa|caixa surpresa|"
    r"mistério|espiã|espionagem|bloqueador de sinal|clonage|placa de carro|recondicionad|reborn)", re.I)
ROW_START = re.compile(r"^\d(?:\.\d+)?,\d{6,},", re.M)  # começo de uma linha do feed (shop_rating,itemid,...)


def log(*a):
    print(*a, flush=True)


def now():
    return dt.datetime.now(dt.timezone.utc)


def num(v, default=0.0):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return default


# ------------------------------------------------------------------------------------------------ feed

def _get(url, start, end):
    req = urllib.request.Request(url, headers={"User-Agent": "BraxStudio/1.0", "Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read(), r.headers.get("Content-Range", ""), r.geturl()


def feed_rows(url):
    """Linhas do feed lidas em pedaços espalhados pelo arquivo (ele vem ordenado por categoria e é enorme)."""
    first, crange, final = _get(url, 0, CHUNK)
    total = int(crange.rsplit("/", 1)[-1]) if "/" in crange and crange.rsplit("/", 1)[-1].isdigit() else len(first)
    text = first.decode("utf-8-sig", errors="ignore")
    header = next(csv.reader(io.StringIO(text.split("\n", 1)[0])))
    log(f"  feed: {total / 1e6:.0f} MB, {len(header)} colunas")
    starts = [0] + sorted(random.sample(range(CHUNK, max(CHUNK + 1, total - CHUNK)), min(CHUNKS - 1, max(0, total // CHUNK - 1))))
    for i, start in enumerate(starts):
        if i:
            try:
                raw, _, _ = _get(final, start, start + CHUNK)
            except Exception as e:  # noqa: BLE001 — pedaço que falhou não derruba a escolha
                log(f"  pedaço {i}: {e}")
                continue
            text = raw.decode("utf-8", errors="ignore")
        m = ROW_START.search(text, 1 if i == 0 else 0)
        if not m:
            continue
        rows = list(csv.reader(io.StringIO(text[m.start():])))[:-1]  # a última linha vem cortada
        for r in rows:
            if len(r) == len(header):
                yield dict(zip(header, r))


def good(p, used):
    title = p.get("title") or ""
    cats = " ".join(p.get(k) or "" for k in ("global_category1", "global_category2", "global_category3")).lower()
    price = num(p.get("sale_price") or p.get("price"))
    return (p.get("itemid") and p["itemid"] not in used and (p.get("condition") or "New") == "New"
            and 9 <= price <= 80 and num(p.get("item_rating")) >= 4.7 and num(p.get("shop_rating")) >= 4.6
            and p.get("image_link") and p.get("product_link")
            and not any(b in cats for b in BAD_CATEGORIES) and not BAD_WORDS.search(title))


def pick(feed_urls, used, n):
    seen, cands = set(), []
    for url in feed_urls:
        for p in feed_rows(url):
            if p["itemid"] in seen or not good(p, used):
                continue
            seen.add(p["itemid"])
            score = num(p.get("like")) * (1 + num(p.get("discount_percentage")) / 100) * (num(p.get("item_rating")) / 5) ** 2
            cands.append((score, p))
    cands.sort(key=lambda c: -c[0])
    log(f"  {len(cands)} produtos passaram no filtro")
    out, cats = [], set()
    for _, p in cands:
        cat = p.get("global_category1") or ""
        if cat in cats:
            continue
        cats.add(cat)
        out.append(p)
        if len(out) >= n:
            break
    return out


def aff_link(product_link, itemid):
    """Link de afiliado no formato do guia da Shopee (an_redir + affiliate_id + sub_id)."""
    return (f"https://s.shopee.com.br/an_redir?origin_link={urllib.parse.quote(product_link, safe='')}"
            f"&affiliate_id={AFF_ID}&sub_id=achadinhos-{itemid}")


# ------------------------------------------------------------------------------------------------ IA

def write_brief(p):
    """Claude escreve o texto do vídeo e a legenda (saída estruturada = JSON garantido)."""
    key = os.environ["ANTHROPIC_API_KEY"]
    model = os.environ.get("CLAUDE_MODEL") or "claude-sonnet-5-5"
    schema = {
        "type": "object", "additionalProperties": False,
        "required": ["name", "hook", "hook_sub", "features", "title", "subtitle", "cta", "caption"],
        "properties": {
            "name": {"type": "string", "description": "nome curto do produto, até 4 palavras"},
            "hook": {"type": "string", "description": "gancho da 1ª cena, até 6 palavras, com 1 *palavra* em destaque entre asteriscos"},
            "hook_sub": {"type": "string", "description": "complemento do gancho, até 7 palavras"},
            "features": {"type": "array", "items": {"type": "string"}, "description": "3 vantagens reais, até 5 palavras cada"},
            "title": {"type": "string", "description": "nome do produto para a cena principal, até 5 palavras"},
            "subtitle": {"type": "string", "description": "preço no formato 'De R$ X por R$ Y' ou 'Por só R$ Y'"},
            "cta": {"type": "string", "description": "chamada final, até 5 palavras, ex.: 'Toque no produto abaixo'"},
            "caption": {"type": "string", "description": "legenda do Shopee Vídeo: 2 frases curtas + 4 a 6 hashtags"},
        },
    }
    price, sale = num(p.get("price")), num(p.get("sale_price") or p.get("price"))
    prompt = (
        "Você escreve vídeos curtos de 'achadinhos da Shopee' que vendem, em português do Brasil, linguagem simples e animada.\n"
        "Regras: só diga o que o anúncio permite afirmar; nada de promessa milagrosa, cura, emagrecimento ou alegação de saúde; "
        "não fale de cupom, frete grátis nem prazo que não estejam no anúncio; sem 'link na bio'.\n"
        f"Produto: {p.get('title')}\nCategoria: {p.get('global_category1')} > {p.get('global_category2')}\n"
        f"Preço: de R$ {price:.2f} por R$ {sale:.2f} ({int(num(p.get('discount_percentage')))}% off)\n"
        f"Nota: {p.get('item_rating')} · Loja: {p.get('shop_name')}\nDescrição: {(p.get('description') or '')[:1500]}"
    )
    body = json.dumps({"model": model, "max_tokens": 1200, "output_config": {"format": {"type": "json_schema", "schema": schema}},
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST", headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"IA (Anthropic) {e.code}: {e.read().decode(errors='replace')[:300]}") from None
    for block in data.get("content", []):
        if block.get("type") == "text" and block.get("text", "").strip():
            return json.loads(block["text"])
    raise RuntimeError("a IA não escreveu o texto")


# ------------------------------------------------------------------------------------------------ vídeo

def render(p, brief, user_id, row_id):
    with tempfile.TemporaryDirectory() as tmp:
        photos = []
        for i, url in enumerate([p.get("image_link"), p.get("image_link_3")]):
            if not url:
                continue
            name = f"photo{i}.jpg"
            try:
                download_photo(url, os.path.join(tmp, name))
                photos.append(name)
            except Exception as e:  # noqa: BLE001
                if not photos and i == 1:
                    raise
                log(f"    foto {i + 1}: {e}")
        if not photos:
            raise RuntimeError("produto sem foto")
        spec = {"photos": photos, "name": brief["name"], "hook": brief["hook"], "hook_sub": brief["hook_sub"],
                "features": brief["features"][:3], "title": brief["title"], "subtitle": brief["subtitle"],
                "cta": brief["cta"], "urgency": f"-{int(num(p.get('discount_percentage')))}%" if num(p.get("discount_percentage")) >= 10 else "",
                "handle": "", "brand": "", "colors": COLORS}
        with open(os.path.join(tmp, "spec.json"), "w", encoding="utf-8") as f:
            json.dump(spec, f, ensure_ascii=False)
        r = subprocess.run([sys.executable, CINEMA, "spec.json", "raw.mp4"], cwd=tmp, capture_output=True, text=True, timeout=900)
        if r.returncode != 0 or not os.path.exists(os.path.join(tmp, "raw.mp4")):
            raise RuntimeError(f"render falhou: {(r.stderr or r.stdout)[-400:]}")
        # Arquivo menor (o storage grátis tem 1 GB) e capa
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "raw.mp4", "-c:v", "libx264", "-preset", "medium", "-crf", "26",
                        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "video.mp4"], cwd=tmp, check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "3", "-i", "video.mp4", "-frames:v", "1", "-vf", "scale=540:-2",
                        "thumb.jpg"], cwd=tmp, check=True)
        key = f"{user_id}/deals/{row_id}"
        video = yt.storage_upload(os.path.join(tmp, "video.mp4"), key + ".mp4", "video/mp4")
        thumb = yt.storage_upload(os.path.join(tmp, "thumb.jpg"), key + ".jpg", "image/jpeg")
    return video, thumb


# ------------------------------------------------------------------------------------------------ limpeza

def cleanup():
    """Todo vídeo sai do storage 24 h depois de feito (postado ou não): o que não foi postado vira 'pulado'."""
    day = urllib.parse.quote((now() - dt.timedelta(hours=23)).isoformat())  # 23 h: a rodada diária pega os da véspera
    rest("PATCH", f"deals?status=in.(ready,rendering)&created_at=lt.{day}", {"status": "skipped"})
    rows = rest("GET", f"deals?video_url=not.is.null&created_at=lt.{day}&select=id,video_url,thumb_url&limit=200") or []
    marker = "/storage/v1/object/public/media/"
    paths = [u.split(marker, 1)[1] for r in rows for u in (r.get("video_url"), r.get("thumb_url")) if u and marker in u]
    if paths:
        http("DELETE", f"{URL}/storage/v1/object/media", {"prefixes": paths})
        rest("PATCH", f"deals?id=in.({','.join(r['id'] for r in rows)})", {"video_url": None, "thumb_url": None})
        log(f"  limpeza: {len(rows)} vídeo(s) antigos apagados do storage")


# ------------------------------------------------------------------------------------------------ principal

def owner():
    row = (rest("GET", "brand_settings?select=user_id&limit=1") or [None])[0]
    if not row:
        raise SystemExit("sem dono (brand_settings vazio)")
    return row["user_id"]


def main():
    feeds = [u for u in (os.environ.get("SHOPEE_FEED_OFICIAL"), os.environ.get("SHOPEE_FEED_BR")) if u]
    if "--check" in sys.argv:
        print("go" if feeds and AFF_ID else "off")
        return
    if not feeds or not AFF_ID:
        raise SystemExit("Cadastre os secrets SHOPEE_FEED_OFICIAL/SHOPEE_FEED_BR e o ID de afiliado")
    cleanup()
    user_id = owner()
    used = {r["itemid"] for r in rest("GET", f"deals?user_id=eq.{user_id}&select=itemid&limit=5000") or []}
    log(f"▶ escolhendo {COUNT} achadinhos ({len(used)} já usados)")
    products = pick(list(dict.fromkeys(feeds)), used, COUNT)
    if not products:
        raise SystemExit("nenhum produto passou no filtro")
    made = 0
    for p in products:
        price, sale = num(p.get("price")), num(p.get("sale_price") or p.get("price"))
        row = rest("POST", "deals", {
            "user_id": user_id, "itemid": p["itemid"], "title": p.get("title")[:300], "price": price, "sale_price": sale,
            "discount": int(num(p.get("discount_percentage"))), "rating": num(p.get("item_rating")), "likes": int(num(p.get("like"))),
            "shop_name": p.get("shop_name"), "category": p.get("global_category1"), "image_url": p.get("image_link"),
            "product_link": p["product_link"], "aff_link": aff_link(p["product_link"], p["itemid"]), "status": "rendering",
        })[0]
        log(f"  • {p.get('title')[:70]} — R$ {sale:.2f} ({int(num(p.get('like')))} curtidas)")
        try:
            brief = write_brief(p)
            video, thumb = render(p, brief, user_id, row["id"])
            rest("PATCH", f"deals?id=eq.{row['id']}", {
                "name": brief["name"], "brief": brief, "caption": brief["caption"], "video_url": video, "thumb_url": thumb,
                "status": "ready", "updated_at": now().isoformat()})
            made += 1
        except Exception as e:  # noqa: BLE001 — um produto com problema não derruba os outros
            log(f"    ✗ {e}")
            rest("PATCH", f"deals?id=eq.{row['id']}", {"status": "failed", "error": str(e)[:500], "updated_at": now().isoformat()})
    log(f"✓ {made} achadinho(s) pronto(s)")
    if made:
        rest("POST", "notifications", {"user_id": user_id, "title": f"🛍️ {made} achadinho(s) pronto(s) para postar",
                                       "body": "Os vídeos somem em 24 h. Baixe e poste no Shopee Vídeo.", "url": "/studio/achadinhos"})


if __name__ == "__main__":
    main()
