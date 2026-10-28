"""Piloto do Desafio da Bíblia (workflow quiz-video.yml): a IA cria episódios novos (tema + 5 perguntas conferidas
com o versículo), video/quiz.py renderiza e o vídeo vai para o storage; o Studio (Renda extra → Desafio da Bíblia)
mostra para baixar e copiar a legenda.

Mantém `brand_settings.quiz_buffer` episódios prontos e não postados (se `quiz_autopilot`) + o pedido do botão
"Fazer mais agora" (`quiz_request`). Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, CLAUDE_MODEL.
"""
import datetime as dt
import json
import os
import random
import shutil
import tempfile
import urllib.error
import urllib.request

import quiz
from worker import URL, http, rest

HERE = os.path.dirname(os.path.abspath(__file__))
THEMES = [
    "Milagres de Jesus", "Mulheres da Bíblia", "Reis de Israel", "Profetas", "Números da Bíblia", "Animais da Bíblia",
    "Parábolas de Jesus", "Gênesis", "Êxodo e Moisés", "Davi", "Apóstolos", "Natal e o nascimento de Jesus",
    "Páscoa", "Salmos e Provérbios", "Cidades da Bíblia", "Pais e filhos na Bíblia", "Heróis da fé", "Livro de Atos",
    "Anjos na Bíblia", "Comidas da Bíblia", "Família de Jesus", "Elias e Eliseu", "José do Egito", "Daniel",
]


def log(*a):
    print(*a, flush=True)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def track_ai(data):
    try:
        u = data.get("usage") or {}
        rest("POST", "ai_usage", {"source": "desafio-da-biblia", "model": data.get("model"),
                                  "input_tokens": u.get("input_tokens") or 0, "output_tokens": u.get("output_tokens") or 0})
    except Exception:  # noqa: BLE001
        pass


def claude(prompt, schema, max_tokens=12000):
    body = json.dumps({"model": os.environ.get("CLAUDE_MODEL") or "claude-opus-5-5", "max_tokens": max_tokens,
                       "output_config": {"format": {"type": "json_schema", "schema": schema}},
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST", headers={
        "x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"IA (Anthropic) {e.code}: {e.read().decode(errors='replace')[:300]}") from None
    track_ai(data)
    for block in data.get("content", []):
        if block.get("type") == "text" and block.get("text", "").strip():
            return json.loads(block["text"])
    raise RuntimeError("a IA não respondeu")


Q = {"type": "object", "additionalProperties": False, "required": ["q", "opts", "a", "ref", "exp"], "properties": {
    "q": {"type": "string", "description": "pergunta, até 90 caracteres"},
    "opts": {"type": "array", "items": {"type": "string"}, "description": "3 opções curtas (até 26 caracteres)"},
    "a": {"type": "integer", "description": "índice (0, 1 ou 2) da opção certa"},
    "ref": {"type": "string", "description": "livro capítulo:versículo, ex. Gênesis 7:12"},
    "exp": {"type": "string", "description": "explicação de 1 a 2 frases, até 140 caracteres, só com o que o versículo diz"},
}}
EPISODES = {"type": "object", "additionalProperties": False, "required": ["episodes"], "properties": {"episodes": {"type": "array", "items": {
    "type": "object", "additionalProperties": False, "required": ["theme", "questions"],
    "properties": {"theme": {"type": "string"}, "questions": {"type": "array", "items": Q}}}}}}
REVIEW = {"type": "object", "additionalProperties": False, "required": ["checks"], "properties": {"checks": {"type": "array", "items": {
    "type": "object", "additionalProperties": False, "required": ["episode", "question", "ok", "problem"],
    "properties": {"episode": {"type": "integer"}, "question": {"type": "integer"}, "ok": {"type": "boolean"}, "problem": {"type": "string"}}}}}}

RULES = """Regras (muito importantes, o público confere na Bíblia):
- Português do Brasil, simples, para pessoas mais velhas. Pergunta curta e clara (até 90 caracteres).
- Exatamente 3 opções curtas (até 26 caracteres cada), só UMA certa e as outras plausíveis mas claramente erradas.
- Fato bíblico sem discussão: nada de datas fora do texto, tradições, interpretações, nem coisas que mudam entre
  traduções ou entre Bíblia católica e evangélica (ex.: número de livros, menor versículo, apócrifos).
- "ref" = o versículo exato que comprova a resposta (livro capítulo:versículo, nomes como na Almeida: Gênesis, Êxodo,
  1 Samuel, Mateus, João...). "exp" = 1 ou 2 frases curtas só com o que o versículo diz.
- Mistura de dificuldade: 2 fáceis, 2 médias, 1 mais difícil. Nada de pergunta repetida das anteriores."""


def generate(n, themes_used, previous):
    pool = [t for t in THEMES if t not in themes_used[-12:]] or THEMES
    themes = random.sample(pool, min(n, len(pool)))
    prompt = (f"Crie {n} episódios do 'Desafio da Bíblia', um quiz em vídeo para Facebook e Kwai. Cada episódio tem um tema e "
              f"5 perguntas sobre esse tema. Temas, nesta ordem: {', '.join(themes)}.\n{RULES}\n"
              f"Perguntas que já saíram (não repita nem parecidas):\n" + "\n".join(f"- {q}" for q in previous[-150:]))
    eps = claude(prompt, EPISODES)["episodes"]
    eps = [e for e in eps if len(e["questions"]) >= 5 and all(len(q["opts"]) == 3 and 0 <= q["a"] <= 2 for q in e["questions"][:5])]
    for e in eps:
        e["questions"] = e["questions"][:5]
    if not eps:
        return []
    # segunda leitura: confere cada pergunta com o versículo; episódio com erro é descartado
    listing = json.dumps([{"episode": i, "questions": e["questions"]} for i, e in enumerate(eps)], ensure_ascii=False)
    review = claude("Você é um revisor bíblico rigoroso. Confira cada pergunta deste quiz: o versículo citado existe e "
                    "comprova a resposta marcada (índice 'a' em 'opts')? Só uma opção está certa? A explicação é fiel ao texto? "
                    "É fato sem discussão entre traduções e entre católicos e evangélicos? Marque ok=false se houver qualquer "
                    f"dúvida.\n{listing}", REVIEW, 6000)["checks"]
    bad = {c["episode"] for c in review if not c["ok"]}
    for c in review:
        if not c["ok"]:
            log(f"  revisão descartou ep {c['episode']} q{c['question']}: {c['problem']}")
    return [e for i, e in enumerate(eps) if i not in bad]


def shuffle(q):
    """A resposta certa não fica sempre na mesma letra."""
    order = [0, 1, 2]
    random.shuffle(order)
    return {**q, "opts": [q["opts"][i] for i in order], "a": order.index(q["a"])}


def main():
    s = (rest("GET", "brand_settings?select=user_id,quiz_autopilot,quiz_buffer,quiz_request&limit=1") or [None])[0]
    if not s:
        log("sem brand_settings")
        return
    user = s["user_id"]
    rows = rest("GET", "quiz_episodes?select=id,number,theme,questions,status,updated_at&order=number") or []
    if not rows:  # 1ª vez: os episódios feitos à mão entram primeiro
        for e in json.load(open(os.path.join(HERE, "quiz_episodes.json"))):
            rest("POST", "quiz_episodes", {"user_id": user, "number": e["id"], "theme": e.get("theme"), "questions": e["questions"]})
        rows = rest("GET", "quiz_episodes?select=id,number,theme,questions,status,updated_at&order=number") or []
    # workflow que caiu no meio: volta para a fila
    stuck = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)).isoformat()
    for r in rows:
        if r["status"] == "rendering" and r["updated_at"] < stuck:
            rest("PATCH", f"quiz_episodes?id=eq.{r['id']}", {"status": "queued"})
            r["status"] = "queued"
    waiting = sum(r["status"] in ("queued", "ready") for r in rows)
    want = int(s.get("quiz_request") or 0) + (max(0, int(s.get("quiz_buffer") or 3) - waiting) if s.get("quiz_autopilot", True) else 0)
    want = min(want, 6)
    if want:
        log(f"criando {want} episódio(s)")
        made = []
        for _ in range(3):
            if len(made) >= want:
                break
            made += generate(want - len(made), [r["theme"] for r in rows if r["theme"]] + [e["theme"] for e in made],
                             [q["q"] for r in rows for q in r["questions"]] + [q["q"] for e in made for q in e["questions"]])
        number = max([r["number"] for r in rows] or [0])
        for e in made[:want]:
            number += 1
            rest("POST", "quiz_episodes", {"user_id": user, "number": number, "theme": e["theme"][:60],
                                           "questions": [shuffle(q) for q in e["questions"]]})
        rest("PATCH", f"brand_settings?user_id=eq.{user}", {"quiz_request": 0})
    for r in rest("GET", "quiz_episodes?status=eq.queued&order=number&limit=8&select=*") or []:
        rest("PATCH", f"quiz_episodes?id=eq.{r['id']}", {"status": "rendering", "updated_at": now(), "error": None})
        work = tempfile.mkdtemp()
        try:
            ep = {"id": r["number"], "theme": r.get("theme"), "questions": r["questions"]}
            mp4, total = quiz.build(ep, work)
            with open(mp4, "rb") as f:
                dest = f"{user}/quiz/desafio-da-biblia-{r['number']}-{r['id'][:8]}.mp4"
                http("POST", f"{URL}/storage/v1/object/media/{dest}", f.read(), {"Content-Type": "video/mp4", "x-upsert": "true"}, raw=True)
            rest("PATCH", f"quiz_episodes?id=eq.{r['id']}", {
                "status": "ready", "video_url": f"{URL}/storage/v1/object/public/media/{dest}", "duration": round(total, 1),
                "caption": quiz.caption(ep), "updated_at": now()})
            rest("POST", "notifications", {"user_id": user, "title": f"Desafio da Bíblia #{r['number']} pronto",
                                           "body": "Baixe o vídeo e copie a legenda no Studio.", "url": "/studio/desafio"})
            log(f"  #{r['number']} pronto ({total:.0f}s)")
        except Exception as e:  # noqa: BLE001 — um episódio com erro não para os outros
            log(f"  #{r['number']} falhou: {e}")
            rest("PATCH", f"quiz_episodes?id=eq.{r['id']}", {"status": "failed", "error": str(e)[:500], "updated_at": now()})
        finally:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
