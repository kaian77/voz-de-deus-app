// Gravação do treino: grava o próprio canvas (vídeo + esqueleto + placar) e guarda no IndexedDB do aparelho.

export interface Recording { id: string; date: number; title: string; mime: string; secs: number; blob: Blob }

const DB = "forma_rec";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("rec", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const q = fn(db.transaction("rec", mode).objectStore("rec"));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

export const recordings = {
  all: async () => ((await tx("readonly", (s) => s.getAll())) as Recording[]).sort((a, b) => b.date - a.date),
  put: (r: Recording) => tx("readwrite", (s) => s.put(r)),
  del: (id: string) => tx("readwrite", (s) => s.delete(id)),
};

export function pickMime(): string {
  const opts = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export class Recorder {
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private t0 = 0;
  mime = pickMime();

  start(canvas: HTMLCanvasElement, audio?: MediaStream | null) {
    if (!this.mime) return false;
    const stream = canvas.captureStream(30);
    audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
    try {
      this.mr = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 3_500_000 });
    } catch {
      return false;
    }
    this.chunks = [];
    this.mr.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.mr.start(1000);
    this.t0 = Date.now();
    return true;
  }

  get on() { return this.mr?.state === "recording" || this.mr?.state === "paused"; }
  pause() { if (this.mr?.state === "recording") this.mr.pause(); }
  resume() { if (this.mr?.state === "paused") this.mr.resume(); }

  stop(): Promise<{ blob: Blob; secs: number } | null> {
    const mr = this.mr;
    if (!mr || mr.state === "inactive") return Promise.resolve(null);
    return new Promise((res) => {
      mr.onstop = () => res({ blob: new Blob(this.chunks, { type: this.mime.split(";")[0] }), secs: Math.round((Date.now() - this.t0) / 1000) });
      mr.stop();
      this.mr = null;
    });
  }
}

export function extOf(mime: string) { return mime.includes("mp4") ? "mp4" : "webm"; }
