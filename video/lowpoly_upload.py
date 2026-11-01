"""Sobe os vídeos 3D low-poly prontos (branch lowpoly-preview) no canal de bonequinhos em inglês (StickWise) e
corrige o nome do canal no Studio com o título atual do YouTube.

Uso (workflow lowpoly-upload.yml): python3 lowpoly_upload.py <pasta com tema.mp4> <horas entre vídeos> tema1 tema2 ...
O 1º vai público na hora; os outros ficam agendados (privados até a hora). Tema já enviado não sobe de novo.
"""
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request

import youtube as yt
from worker import rest

HERE = os.path.dirname(os.path.abspath(__file__))


def channel():
    rows = rest("GET", "yt_channels?style=eq.stickman&language=eq.en&select=id,user_id,title&order=created_at") or []
    if not rows:
        sys.exit("canal de bonequinhos em inglês não encontrado")
    return rows[0]


def refresh_title(ch, token):
    req = urllib.request.Request("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
                                 headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        items = json.loads(r.read()).get("items") or []
    if not items:
        return ch["title"]
    sn = items[0]["snippet"]
    thumb = ((sn.get("thumbnails") or {}).get("high") or (sn.get("thumbnails") or {}).get("default") or {}).get("url")
    rest("PATCH", f"yt_channels?id=eq.{ch['id']}", {"title": sn["title"], **({"thumbnail": thumb} if thumb else {}), "updated_at": yt.now()})
    print(f"canal: {ch['title']} -> {sn['title']}")
    return sn["title"]


def main():
    folder, gap, topics = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
    ch = channel()
    token = yt.google_token(ch["id"])
    refresh_title(ch, token)
    start = dt.datetime.now(dt.timezone.utc)
    for n, topic in enumerate(topics):
        spec = json.load(open(os.path.join(HERE, "lowpoly", "topics", f"{topic}.json")))
        title = spec["title"][:100]
        if rest("GET", f"yt_videos?channel_ref=eq.{ch['id']}&title=eq.{urllib.parse.quote(title)}&select=id"):
            print(f"já enviado: {title}")
            continue
        when = start + dt.timedelta(hours=gap * n)
        future = n > 0
        meta = {
            "snippet": {"title": title, "description": spec["caption"], "categoryId": "27",
                        "tags": ["engineering", "how it works", "science", "explained", "shorts"],
                        "defaultLanguage": "en", "defaultAudioLanguage": "en"},
            "status": {"privacyStatus": "private" if future else "public",
                       **({"publishAt": when.isoformat().replace("+00:00", "Z")} if future else {}),
                       "selfDeclaredMadeForKids": False, "embeddable": True},
        }
        path = os.path.join(folder, f"{topic}.mp4")
        up = yt.upload_video(token, path, meta)
        rest("POST", "yt_videos", {"user_id": ch["user_id"], "channel_ref": ch["id"], "kind": "short", "status": "uploaded",
                                   "topic": title, "title": title, "youtube_id": up["id"], "publish_at": when.isoformat(),
                                   "angle": "3D low-poly (feito à mão)"})
        print(f"✓ {title}: https://youtu.be/{up['id']} ({'agora' if not future else when.isoformat()})")


if __name__ == "__main__":
    main()
