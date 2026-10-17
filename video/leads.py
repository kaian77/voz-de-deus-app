#!/usr/bin/env python3
"""Leads do Google Maps para a prospecção (Renda Extra) — roda no GitHub Actions (workflow "Leads do Google Maps").

Fila: tabela lead_searches (status "queued"), criada pela tela Leads do Studio. Para cada busca
("nutricionista" em "Sobradinho DF", N leads):
- acha a área no OpenStreetMap (Nominatim, grátis) e guarda o retângulo para o mapa do Studio;
- roda o robô open source gosom/google-maps-scraper (sobe como container no workflow, API em localhost:8080),
  dividindo a área em pedaços quando pedem muitos leads (o Google Maps mostra no máximo ~120 por busca);
- fica só com empresas SEM site (Instagram/Facebook/link de WhatsApp contam como "sem site") e COM celular;
- ignora quem já está na lista (mesmo lugar ou mesmo número) e grava até N leads novos na tabela leads.

Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, SCRAPER_URL (padrão http://localhost:8080).
Uso: python3 video/leads.py [--check]
"""
import csv
import datetime as dt
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from worker import URL, http, rest

SCRAPER = os.environ.get("SCRAPER_URL", "http://localhost:8080").rstrip("/")
UA = "BraxStudio-leads/1.0 (https://github.com/kaian77/voz-de-deus-app)"
# Endereços que não são site próprio: quem só tem isso continua sendo um bom lead
NOT_A_SITE = re.compile(r"instagram\.com|facebook\.com|fb\.com|wa\.me|whatsapp\.com|linktr\.ee|linkbio|bio\.link|beacons\.ai|business\.site|ifood\.com|tiktok\.com", re.I)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def requeue_stuck():
    """Busca interrompida (ex.: job cancelado) volta para a fila depois de 90 minutos."""
    limit = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=90)).isoformat()
    rest("PATCH", f"lead_searches?status=eq.running&updated_at=lt.{urllib.parse.quote(limit)}", {"status": "queued"})


def queued():
    return rest("GET", "lead_searches?status=eq.queued&order=created_at&limit=5&select=*") or []


def geocode(place):
    """Área pesquisada no OpenStreetMap -> (lat, lng, [sul, norte, oeste, leste]) ou None."""
    q = urllib.parse.urlencode({"format": "json", "limit": 1, "countrycodes": "br", "q": place})
    req = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{q}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        hits = json.loads(r.read())
    time.sleep(1)  # Nominatim pede no máximo 1 requisição por segundo
    if not hits:
        return None
    h = hits[0]
    return float(h["lat"]), float(h["lon"]), [float(x) for x in h["boundingbox"]]


def around(lat, lng, bbox, km):
    """Área da busca: quadrado de lado 2*km em volta do centro, sem passar do limite do lugar no OpenStreetMap.
    (Regiões administrativas como "Sobradinho" são enormes; o que interessa é o miolo, onde ficam as empresas.)"""
    dlat = km / 111.0
    dlng = km / (111.0 * math.cos(math.radians(lat)))
    s, n, w, e = bbox
    return [max(s, lat - dlat), min(n, lat + dlat), max(w, lng - dlng), min(e, lng + dlng)]


def cells(bbox, n):
    """Divide a área em n x n pedaços -> [{lat, lon, radius, zoom}] (uma busca no Maps por pedaço)."""
    s, nn, w, e = bbox
    dlat, dlon = (nn - s) / n, (e - w) / n
    m_per_deg = 6371000 * math.pi / 180
    out = []
    for i in range(n):
        for j in range(n):
            lat, lon = s + (i + 0.5) * dlat, w + (j + 0.5) * dlon
            cos = math.cos(math.radians(lat))
            width = max(1.0, dlon * m_per_deg * cos)
            diag = math.hypot(dlat * m_per_deg, width)
            zoom = round(math.log2(156543.03 * cos * 1000 / width))
            out.append({"lat": f"{lat:.6f}", "lon": f"{lon:.6f}", "radius": max(1000, math.ceil(1.15 * diag / 2)), "zoom": min(17, max(12, zoom))})
    # do centro para fora: os primeiros pedaços são os mais relevantes quando já dá para parar
    cy, cx = (s + nn) / 2, (w + e) / 2
    return sorted(out, key=lambda c: (float(c["lat"]) - cy) ** 2 + (float(c["lon"]) - cx) ** 2)


def scraper(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(SCRAPER + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"robô respondeu {e.code}: {e.read()[:200].decode(errors='replace')}") from None


def wait_scraper():
    for _ in range(60):
        try:
            scraper("GET", "/api/v1/jobs")
            return
        except Exception:
            time.sleep(3)
    raise RuntimeError("o robô do Google Maps não subiu")


def scrape(keyword, cell, depth):
    """Uma busca no robô -> linhas do CSV dele (title, phone, website, category, address, latitude, longitude...)."""
    body = {"name": "studio", "keywords": [keyword], "lang": "pt", "fast_mode": False, "depth": depth,
            "email": False, "max_time": 600, **cell}
    job = json.loads(scraper("POST", "/api/v1/jobs", body)).get("id")
    if not job:
        raise RuntimeError("o robô não criou a busca")
    for _ in range(150):
        status = json.loads(scraper("GET", f"/api/v1/jobs/{job}")).get("Status")
        if status == "ok":
            break
        if status == "failed":
            raise RuntimeError("o Google Maps recusou a busca (limite de acesso); tente de novo mais tarde")
        time.sleep(8)
    else:
        raise RuntimeError("a busca demorou demais")
    raw = scraper("GET", f"/api/v1/jobs/{job}/download")
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8", "replace"))))


def mobile(phone):
    """Celular brasileiro (provável WhatsApp) -> 55DDD9XXXXXXXX; fixo ou inválido -> None."""
    d = re.sub(r"\D", "", phone or "")
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    d = d.lstrip("0")
    return f"55{d}" if len(d) == 11 and d[2] == "9" else None


def to_lead(row, search):
    site = (row.get("website") or "").strip()
    if site and not NOT_A_SITE.search(site):
        return None
    wa = mobile(row.get("phone"))
    place = row.get("place_id") or row.get("cid") or row.get("link")
    if not wa or not place or not (row.get("title") or "").strip():
        return None

    def num(k, cast):
        try:
            return cast(str(row.get(k) or "").replace(",", "."))
        except ValueError:
            return None

    return {
        "user_id": search["user_id"], "search_id": search["id"], "place_id": place[:300],
        "name": row["title"].strip()[:200], "category": (row.get("category") or "").strip()[:120] or None,
        "phone": (row.get("phone") or "").strip()[:40], "whatsapp": wa, "social": site[:300] or None,
        "address": (row.get("address") or "").strip()[:300] or None,
        "lat": num("latitude", float), "lng": num("longitude", float),
        "rating": num("review_rating", float), "reviews": num("review_count", lambda v: int(float(v))),
        "maps_url": (row.get("link") or "")[:500] or None,
    }


def inside(lead, bbox, margin=0.15):
    """O Maps devolve lugares fora da área pesquisada; fica só quem está nela (com uma folga). Sem coordenada: fica."""
    if lead["lat"] is None or lead["lng"] is None:
        return True
    s, n, w, e = bbox
    my, mx = (n - s) * margin, (e - w) * margin
    return s - my <= lead["lat"] <= n + my and w - mx <= lead["lng"] <= e + mx


def known(user_id):
    rows = rest("GET", f"leads?user_id=eq.{user_id}&select=place_id,whatsapp&limit=20000") or []
    return {r["place_id"] for r in rows}, {r["whatsapp"] for r in rows if r.get("whatsapp")}


def run(search):
    rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"status": "running", "error": None, "updated_at": now()})
    area = geocode(search["place"])
    if not area:
        raise RuntimeError(f"não achei \"{search['place']}\" no mapa; escreva bairro e cidade (ex.: Sobradinho DF)")
    lat, lng, bbox = area
    wanted = max(1, min(int(search["wanted"]), 200))
    bbox = around(lat, lng, bbox, 2.5 if wanted <= 30 else 4)
    rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"lat": lat, "lng": lng, "bbox": bbox, "updated_at": now()})

    # Só uns 30-50% das empresas não têm site e têm celular: pede bem mais do que o necessário
    n = 1 if wanted <= 15 else 2 if wanted <= 60 else 3
    depth = 5 if wanted <= 30 else 10
    keyword = f"{search['query']} em {search['place']}"
    places, phones = known(search["user_id"])
    found, errors = 0, []
    for i, cell in enumerate(cells(bbox, n), 1):
        try:
            rows = scrape(keyword, cell, depth)
        except Exception as e:  # um pedaço que falha não perde os outros
            errors.append(str(e))
            print(f"  pedaço {i}: {e}")
            continue
        fresh = []
        for row in rows:
            lead = to_lead(row, search)
            if lead and inside(lead, bbox) and lead["place_id"] not in places and lead["whatsapp"] not in phones:
                places.add(lead["place_id"])
                phones.add(lead["whatsapp"])
                fresh.append(lead)
        fresh = fresh[: wanted - found]
        if fresh:
            http("POST", f"{URL}/rest/v1/leads?on_conflict=user_id,place_id", fresh, {"Prefer": "resolution=ignore-duplicates,return=minimal"})
            found += len(fresh)
        print(f"  pedaço {i}: {len(rows)} lugares, {len(fresh)} leads novos ({found}/{wanted})")
        rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"found": found, "updated_at": now()})
        if found >= wanted:
            break
    if not found and errors:
        raise RuntimeError(errors[-1])
    rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"status": "done", "found": found, "updated_at": now()})


def main():
    if "--check" in sys.argv:
        if "--retry-failed" in sys.argv:  # rodada manual: buscas que falharam voltam para a fila
            rest("PATCH", "lead_searches?status=eq.failed", {"status": "queued", "error": None})
        requeue_stuck()
        print("queued" if queued() else "empty")
        return
    wait_scraper()
    while True:
        batch = queued()
        if not batch:
            break
        for search in batch:
            print(f"▶ {search['query']} em {search['place']} ({search['wanted']} leads)")
            try:
                run(search)
            except Exception as e:
                print(f"  ✗ {e}")
                rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"status": "failed", "error": str(e)[:500], "updated_at": now()})


if __name__ == "__main__":
    main()
