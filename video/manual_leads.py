#!/usr/bin/env python3
"""Leads da Montagem 3D (Renda Extra → Leads → "Manual ruim") — roda no workflow "Leads do Google Maps", depois do leads.py.

Fila: tabela manual_searches com source "maps" ou "etsy" (o Mercado Livre roda na function `ai`, _shared/manual-leads.ts).
- maps: lojas e fábricas de móveis no Google Maps de qualquer país (robô gosom, já no ar no workflow), lendo as avaliações;
- etsy: lojas do Etsy (API grátis, secret ETSY_API_KEY = "keystring:shared secret" do app em etsy.com/developers).
Cada avaliação que reclama do manual/montagem (mesmas palavras do manual-leads.ts) conta para a marca; grava em manual_leads.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, ETSY_API_KEY (opcional), SCRAPER_URL.
"""
import datetime as dt
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from worker import URL, http, rest
from leads import UA, jload, scrape, wait_scraper

TOPIC = re.compile(
    r"manual|instru[cç]|instructivo|diagram|passo a passo|paso a paso|montag|montar|mont[ae]i|armad|armar|arm[eé]|ensambl|assembl|put together|"
    r"fur[oa]|fura[cç]|agujer|\bholes?\b|parafus|tornill|screws?|pe[cç]as? falt|falt\w* (pe[cç]|parafus|piez|tornill)|"
    r"missing (part|piece|screw|hardware)|faltan? (piez|tornill)", re.I)
NEG = re.compile(
    r"dif[ií]cil|complicad|confus|ruim|p[eé]ssim|horr[ií]vel|errad|n[aã]o encaix|n[aã]o bat|falt(ou|ando|aram|an|[oó])|sem manual|sin manual|"
    r"n[aã]o vem|n[aã]o veio|n[aã]o tem manual|n[aã]o entend|mal explic|terrible|awful|confusing|unclear|missing|wrong|poor|hard to|difficult|"
    r"nightmare|didn'?t|did not|doesn'?t|useless|\bmal[oa]?\b|no encaj|no vien|no trae|no se entiende|horrible|incomplet|nada claro|pouco claro|poco claro", re.I)


def is_complaint(text, rate):
    if not text or not TOPIC.search(text):
        return False
    return (rate is not None and rate <= 3) or bool(NEG.search(text))


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn").lower()).strip()


def num(v, cast=float):
    try:
        return cast(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


# País inteiro não cabe numa busca do Maps (ela olha uns 15 km em volta): vira as maiores cidades dele
CITIES = {
    "US": ["New York NY", "Los Angeles CA", "Chicago IL", "Houston TX", "Miami FL", "Dallas TX"],
    "GB": ["London", "Manchester", "Birmingham UK"], "CA": ["Toronto", "Vancouver"], "AU": ["Sydney", "Melbourne"],
    "IE": ["Dublin"], "ES": ["Madrid", "Barcelona", "Valencia España"], "PT": ["Lisboa", "Porto"],
    "MX": ["Ciudad de México", "Guadalajara", "Monterrey"], "AR": ["Buenos Aires", "Córdoba Argentina"],
    "CO": ["Bogotá", "Medellín"], "CL": ["Santiago Chile"], "PE": ["Lima"], "UY": ["Montevideo"],
    "BR": ["São Paulo SP", "Rio de Janeiro RJ", "Belo Horizonte MG", "Curitiba PR"],
}


def geocode(place):
    """Cidade (ou país) em qualquer lugar do mundo -> (lat, lng, país ISO, é_país) ou None."""
    q = urllib.parse.urlencode({"format": "jsonv2", "limit": 3, "addressdetails": 1, "q": place})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{q}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        hits = json.loads(r.read())
    time.sleep(1)
    if not hits:
        return None
    h = max(hits, key=lambda h: float(h.get("importance") or 0))
    country = ((h.get("address") or {}).get("country_code") or "").upper() or None
    return float(h["lat"]), float(h["lon"]), country, h.get("addresstype") == "country" or int(h.get("place_rank") or 30) <= 4


def places_of(text):
    """"Miami FL" -> 1 lugar; "Estados Unidos, Inglaterra" -> cidades grandes de cada país. -> [(nome, lat, lng, país)]"""
    split = [p.strip() for p in re.split(r"[;,/]| e | y | and ", text) if p.strip()]
    first = geocode(split[0]) if len(split) > 1 else None
    # "Estados Unidos, Inglaterra" = vários países; "Miami, FL" = um lugar só
    whole = None if first and first[3] else geocode(text)
    parts = [text] if whole and not whole[3] else split
    out = []
    for part in parts[:4]:
        g = whole if part == text else geocode(part)
        if not g:
            print(f"  não achei \"{part}\" no mapa")
            continue
        lat, lng, country, is_country = g
        if is_country:
            for city in CITIES.get(country or "", [])[:3]:
                c = geocode(city)
                if c:
                    out.append((city, c[0], c[1], country))
        else:
            out.append((part, lat, lng, country))
    return out[:6]


def save(search, brands):
    rows = []
    for b in brands:
        if b["complaints"] <= 0:
            continue
        rows.append({
            "user_id": search["user_id"], "search_id": search["id"], "source": search["source"], "key": b["key"][:200],
            "name": b["name"][:120], "country": b.get("country"), "url": b.get("url"), "rating": b.get("rating"),
            "reviews_read": b["read"], "complaints": b["complaints"], "samples": b["samples"][:6],
            "contact": b.get("contact"), "updated_at": now(),
        })
    if rows:
        http("POST", f"{URL}/rest/v1/manual_leads?on_conflict=user_id,source,key", rows, {"Prefer": "resolution=merge-duplicates,return=minimal"})
    return len(rows)


def run_maps(search):
    places = places_of(search["place"])
    if not places:
        raise RuntimeError(f"não achei \"{search['place']}\" no mapa; escreva cidade e país (ex.: Miami FL, Madrid España)")
    lang = search.get("site") if search.get("site") in ("pt", "en", "es") else "en"
    queries = [x.strip() for x in search["query"].split(",") if x.strip()][: 2 if len(places) > 2 else 3]
    jobs = [(q, p) for p in places for q in queries][:6]
    brands, scanned, seen_places, errors = [], 0, set(), []
    for q, (name, lat, lng, country) in jobs:
        cell = {"lat": f"{lat:.6f}", "lon": f"{lng:.6f}", "radius": 15000, "zoom": 12}
        try:
            rows = scrape(f"{q} {name}", cell, 3, lang=lang, extra_reviews=True)
        except Exception as e:  # uma cidade que falha não perde as outras
            errors.append(str(e))
            print(f"  {q} em {name}: {e}")
            continue
        print(f"  {q} em {name}: {len(rows)} lugares")
        for row in rows:
            pid = row.get("place_id") or row.get("cid") or row.get("link")
            if pid in seen_places:
                continue
            seen_places.add(pid)
            reviews = (jload(row.get("user_reviews_extended")) or []) + (jload(row.get("user_reviews")) or [])
            seen, b = set(), {"key": row.get("place_id") or row.get("cid") or row.get("link") or norm(row.get("title")),
                             "name": (row.get("title") or "").strip(), "country": country, "url": (row.get("link") or "")[:500] or None,
                             "rating": num(row.get("review_rating")), "read": 0, "complaints": 0, "samples": [],
                             "contact": {"site": (row.get("website") or "").strip() or None, "phone": (row.get("phone") or "").strip() or None}}
            if not b["name"]:
                continue
            for v in reviews:
                text = ((v or {}).get("Description") or "").strip()
                if not text or text in seen:
                    continue
                seen.add(text)
                rate = num(v.get("Rating"), int)
                b["read"] += 1
                if is_complaint(text, rate):
                    b["complaints"] += 1
                    if len(b["samples"]) < 6:
                        b["samples"].append({"text": text[:280], "rate": rate, "product": row.get("category") or "", "url": b["url"]})
            scanned += b["read"]
            brands.append(b)
    if not brands and errors:
        raise RuntimeError(errors[-1])
    return brands, scanned


def etsy(path):
    key = os.environ.get("ETSY_API_KEY", "").strip()
    if not key:
        raise RuntimeError("falta o secret ETSY_API_KEY (grátis: crie um app em etsy.com/developers e cadastre \"keystring:shared secret\" em Settings → Secrets → Actions)")
    req = urllib.request.Request(f"https://openapi.etsy.com/v3/application{path}", headers={"x-api-key": key, "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Etsy respondeu {e.code}: {e.read()[:200].decode(errors='replace')}") from None


def run_etsy(search):
    shops = {}
    for q in [x.strip() for x in search["query"].split(",") if x.strip()][:3]:
        r = etsy(f"/listings/active?{urllib.parse.urlencode({'keywords': q, 'limit': 100, 'sort_on': 'score'})}")
        for it in r.get("results") or []:
            shops.setdefault(it.get("shop_id"), it.get("title") or "")
    brands, scanned = [], 0
    for shop_id in [s for s in shops if s][:30]:
        try:
            shop = etsy(f"/shops/{shop_id}")
            reviews = etsy(f"/shops/{shop_id}/reviews?limit=100").get("results") or []
        except RuntimeError as e:
            print(f"  loja {shop_id}: {e}")
            continue
        b = {"key": str(shop_id), "name": shop.get("shop_name") or str(shop_id), "country": None, "url": shop.get("url"),
             "rating": num(shop.get("review_average")), "read": 0, "complaints": 0, "samples": [], "contact": {"site": shop.get("url")}}
        for v in reviews:
            text = (v.get("review") or "").strip()
            if not text:
                continue
            b["read"] += 1
            if is_complaint(text, v.get("rating")):
                b["complaints"] += 1
                if len(b["samples"]) < 6:
                    b["samples"].append({"text": text[:280], "rate": v.get("rating"), "product": shops[shop_id][:90], "url": shop.get("url")})
        scanned += b["read"]
        brands.append(b)
        time.sleep(0.2)  # Etsy: até 10 requisições por segundo
    return brands, scanned


def main():
    searches = rest("GET", "manual_searches?status=eq.queued&source=in.(maps,etsy)&order=created_at&limit=10&select=*") or []
    if any(s["source"] == "maps" for s in searches):
        wait_scraper()
    for s in searches:
        print(f"▶ manual ruim · {s['source']} · {s['query']} {s.get('place') or ''}")
        rest("PATCH", f"manual_searches?id=eq.{s['id']}", {"status": "running", "error": None, "updated_at": now()})
        try:
            brands, scanned = run_maps(s) if s["source"] == "maps" else run_etsy(s)
            found = save(s, brands)
            print(f"  {found} marcas com reclamação de manual/montagem ({scanned} avaliações lidas)")
            rest("PATCH", f"manual_searches?id=eq.{s['id']}", {"status": "done", "found": found, "scanned": scanned, "updated_at": now()})
        except Exception as e:
            print(f"  ✗ {e}")
            rest("PATCH", f"manual_searches?id=eq.{s['id']}", {"status": "failed", "error": str(e)[:500], "updated_at": now()})


if __name__ == "__main__":
    main()
