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
# Agenda online (Doctoralia, Boa Consulta...), link de bio e encurtador também não são site próprio: a pessoa ainda precisa de um.
NOT_A_SITE = re.compile(
    r"instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|wa\.link|whatsapp\.com|linktr\.ee|linkbio|bio\.link|beacons\.ai|business\.site|"
    r"ifood\.com|tiktok\.com|doctoralia|boaconsulta|agendar|agendamento|calendly|linkme|lnk\.bio|taplink|instabio|linkin\.bio|"
    r"bit\.ly|encurtador|zenklub|psicologiaviva|g\.page|maps\.app\.goo|google\.com/maps|youtube\.com|tuasaude|minhavida",
    re.I,
)


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


DAYS = [("seg", "segunda", "monday"), ("ter", "terça", "terca", "tuesday"), ("qua", "quarta", "wednesday"), ("qui", "quinta", "thursday"),
        ("sex", "sexta", "friday"), ("sáb", "sábado", "sabado", "saturday"), ("dom", "domingo", "sunday")]
SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]


def jload(v):
    try:
        return json.loads(v) if v else None
    except ValueError:
        return None


def hours_text(raw):
    """{"segunda-feira": ["08:00–18:00"], "domingo": ["Fechado"]} -> "Seg a sex: 8h às 18h · Sáb: 8h às 12h"."""
    if not isinstance(raw, dict) or not raw:
        return None
    by_day = [None] * 7
    for k, v in raw.items():
        key = k.lower().replace("-feira", "").strip()
        i = next((i for i, names in enumerate(DAYS) if key in names or key[:3] == names[0][:3]), None)
        if i is not None:
            by_day[i] = ", ".join(v) if isinstance(v, list) else str(v)

    def fmt(t):
        if not t or re.search(r"fechad|closed", t, re.I):
            return None
        t = re.sub(r"\b0?(\d{1,2}):00\b", r"\1h", t)
        t = re.sub(r"\b0?(\d{1,2}):(\d{2})\b", r"\1h\2", t)
        return re.sub(r"\s*[–-]\s*", " às ", t)

    out, i = [], 0
    while i < 7:
        t = fmt(by_day[i])
        j = i
        while j + 1 < 7 and fmt(by_day[j + 1]) == t:
            j += 1
        if t:
            days = SHORT[i] if i == j else f"{SHORT[i]} a {SHORT[j].lower()}" if j - i > 1 else f"{SHORT[i]} e {SHORT[j].lower()}"
            out.append(f"{days}: {t}")
        i = j + 1
    return " · ".join(out) or None


def details(row):
    """Extras do Maps para a landing page: horário, fotos grandes, categoria e descrição."""
    photos = []
    for img in jload(row.get("images")) or []:
        url = (img or {}).get("image") or ""
        if not url.startswith("http") or re.search(r"street|v[ií]deo", (img.get("title") or ""), re.I):
            continue
        url = re.sub(r"=w\d+-h\d+[^/]*$", "=w1200-h1200-k-no", url)
        if url not in photos:
            photos.append(url)
    raw = jload(row.get("open_hours"))
    return {
        "hours": hours_text(raw), "open_hours": raw or None, "photos": photos[:10],
        "category": (row.get("category") or "").strip() or None, "description": (row.get("descriptions") or "").strip()[:800] or None,
    }


def reject_reason(row):
    """Por que o lugar não vira lead (None = vira). Fica no log para entender buscas que voltam vazias."""
    site = (row.get("website") or "").strip()
    if site and not NOT_A_SITE.search(site):
        return "site"
    if not mobile(row.get("phone")):
        return "sem celular"
    if not (row.get("place_id") or row.get("cid") or row.get("link")) or not (row.get("title") or "").strip():
        return "sem dados"
    return None


def to_lead(row, search):
    if reject_reason(row):
        return None
    site = (row.get("website") or "").strip()
    wa = mobile(row.get("phone"))
    place = row.get("place_id") or row.get("cid") or row.get("link")

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
        "details": details(row), "details_status": "done",
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


def same_place(row, lead):
    ids = {row.get("place_id"), row.get("cid"), row.get("link")} - {None, ""}
    return lead["place_id"] in ids or (row.get("title") or "").strip().casefold() == lead["name"].casefold()


def enrich():
    """Lead antigo (de antes dos extras) pedido por uma landing page: busca o lugar de novo e guarda os extras."""
    for lead in rest("GET", "leads?details_status=eq.queued&order=updated_at&limit=20&select=id,place_id,name,address,lat,lng") or []:
        print(f"▶ dados do Maps: {lead['name']}")
        rest("PATCH", f"leads?id=eq.{lead['id']}", {"details_status": "running"})
        try:
            cell = {"lat": f"{lead['lat']:.6f}", "lon": f"{lead['lng']:.6f}", "radius": 2000, "zoom": 16} if lead.get("lat") is not None else {}
            rows = scrape(f"{lead['name']} {lead.get('address') or ''}".strip(), cell, 1)
            row = next((r for r in rows if same_place(r, lead)), None)
            if not row:
                raise RuntimeError("o lugar não apareceu na busca")
            rest("PATCH", f"leads?id=eq.{lead['id']}", {"details": details(row), "details_status": "done"})
        except Exception as e:
            print(f"  ✗ {e}")
            rest("PATCH", f"leads?id=eq.{lead['id']}", {"details_status": "failed"})


def run(search):
    rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"status": "running", "error": None, "updated_at": now()})
    area = geocode(search["place"])
    if not area:
        raise RuntimeError(f"não achei \"{search['place']}\" no mapa; escreva bairro e cidade (ex.: Sobradinho DF)")
    lat, lng, region = area
    wanted = max(1, min(int(search["wanted"]), 200))
    base = 2.5 if wanted <= 30 else 4
    places, phones = known(search["user_id"])
    found, errors, i = int(search.get("found") or 0), [], 0  # tentar de novo continua de onde parou
    # 1ª rodada: o miolo do lugar. Se vier pouco (nichos pequenos, poucas empresas sem site), a 2ª rodada
    # amplia a área (até ~2,4x) e varre em 4 pedaços buscando só o tema, para o Maps mostrar o que está perto de cada um.
    rounds = [(base, 1 if wanted <= 15 else 2, f"{search['query']} em {search['place']}"), (base * 2.4, 2, search["query"])]
    for km, n, keyword in rounds:
        if found >= wanted:
            break
        bbox = around(lat, lng, region, km)
        rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"lat": lat, "lng": lng, "bbox": bbox, "updated_at": now()})
        depth = 5 if wanted <= 30 and km == base else 10
        for cell in cells(bbox, n):
            i += 1
            try:
                rows = scrape(keyword, cell, depth)
            except Exception as e:  # um pedaço que falha não perde os outros
                errors.append(str(e))
                print(f"  pedaço {i}: {e}")
                continue
            fresh, why, sites = [], {}, []
            for row in rows:
                reason = reject_reason(row)
                lead = None if reason else to_lead(row, search)
                if lead and not inside(lead, bbox):
                    reason = "fora da área"
                elif lead and (lead["place_id"] in places or lead["whatsapp"] in phones):
                    reason = "já na lista"
                if reason:
                    why[reason] = why.get(reason, 0) + 1
                    if reason == "site" and len(sites) < 4:
                        sites.append(re.sub(r"^https?://(www\.)?", "", (row.get("website") or ""))[:40])
                    continue
                places.add(lead["place_id"])
                phones.add(lead["whatsapp"])
                fresh.append(lead)
            fresh = fresh[: wanted - found]
            if fresh:
                http("POST", f"{URL}/rest/v1/leads?on_conflict=user_id,place_id", fresh, {"Prefer": "resolution=ignore-duplicates,return=minimal"})
                found += len(fresh)
            print(f"  pedaço {i} ({km:g} km): {len(rows)} lugares, {len(fresh)} leads novos ({found}/{wanted})"
                  + (f" · descartados: {', '.join(f'{n} {k}' for k, n in why.items())}" if why else "")
                  + (f" · sites: {', '.join(sites)}" if sites else ""))
            rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"found": found, "updated_at": now()})
            if found >= wanted:
                break
    if not found and errors:
        raise RuntimeError(errors[-1])
    rest("PATCH", f"lead_searches?id=eq.{search['id']}", {"status": "done", "found": found, "updated_at": now()})


def main():
    if "--check" in sys.argv:
        if "--retry-failed" in sys.argv:  # rodada manual: buscas que falharam ou vieram incompletas voltam para a fila
            rest("PATCH", "lead_searches?status=eq.failed", {"status": "queued", "error": None})
            for r in rest("GET", "lead_searches?status=eq.done&select=id,found,wanted") or []:
                if r["found"] < r["wanted"]:
                    rest("PATCH", f"lead_searches?id=eq.{r['id']}", {"status": "queued"})
        requeue_stuck()
        print("queued" if queued() or rest("GET", "leads?details_status=in.(queued,running)&select=id&limit=1") else "empty")
        return
    wait_scraper()
    rest("PATCH", "leads?details_status=eq.running", {"details_status": "queued"})  # rodada anterior interrompida
    enrich()
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
