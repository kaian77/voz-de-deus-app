import { useEffect, useRef, useState } from "react";
import { Camera, Check, Circle, Download, FlipHorizontal2, Loader2, Play, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { api } from "../lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: string;
  onUseRecording: (video: Blob) => Promise<void>;
};

type Word = { word: string; start: number; end: number };
type Caption = { start: number; end: number; text: string; emoji: string; words: Word[] };
type CaptionStyle = "viral" | "box" | "minimal";

const EMOJIS = ["✨", "🔥", "😍", "😱", "💡", "💰", "🚀", "✅", "❤️", "😂", "👏", "🎯", ""];
const STYLES: { id: CaptionStyle; label: string; sample: string }[] = [
  { id: "viral", label: "Destaque", sample: "Branca + palavra amarela" },
  { id: "box", label: "Caixa", sample: "Fundo escuro arredondado" },
  { id: "minimal", label: "Clean", sample: "Branca com sombra" },
];

function recordingType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function emojiFor(text: string) {
  const t = text.toLocaleLowerCase("pt-BR");
  if (/amor|gosta|apaixon|linda|lindo|incr[ií]vel/.test(t)) return "😍";
  if (/dinheiro|venda|vende|lucro|pre[cç]o|r\$/.test(t)) return "💰";
  if (/dica|aprend|como|segredo|sabia|aten[cç][aã]o/.test(t)) return "💡";
  if (/resultado|consegui|funciona|sucesso|melhor/.test(t)) return "🔥";
  if (/come[cç]|agora|fa[cç]a|vai|bora/.test(t)) return "🚀";
  return "✨";
}

function groupWords(words: Word[]): Caption[] {
  const result: Caption[] = [];
  let group: Word[] = [];
  const flush = () => {
    if (!group.length) return;
    const text = group.map((word) => word.word.trim()).join(" ").replace(/\s+([,.!?;:])/g, "$1");
    result.push({ start: group[0].start, end: group[group.length - 1].end, text, emoji: emojiFor(text), words: group });
    group = [];
  };
  for (const word of words) {
    group.push(word);
    const last = word.word.trim();
    if (group.length >= 4 || /[.!?]$/.test(last)) flush();
  }
  flush();
  return result;
}

function drawCaption(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, caption: Caption | undefined, time: number, style: CaptionStyle, emojis: boolean) {
  if (!caption) return;
  const words = caption.text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const fontSize = style === "minimal" ? 44 : 50;
  ctx.font = `900 ${fontSize}px system-ui, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines: string[][] = [];
  let line: string[] = [];
  for (const word of words) {
    const candidate = [...line, word].join(" ");
    if (line.length && ctx.measureText(candidate).width > canvas.width - 100) {
      lines.push(line);
      line = [word];
    } else line.push(word);
  }
  if (line.length) lines.push(line);
  const emoji = emojis ? ` ${caption.emoji}` : "";
  const y = canvas.height * 0.76;
  const lineHeight = fontSize * 1.2;
  const blockHeight = lines.length * lineHeight;
  if (style === "box") {
    const width = Math.min(canvas.width - 52, Math.max(...lines.map((part) => ctx.measureText(part.join(" ")).width)) + 48);
    ctx.fillStyle = "rgba(10, 10, 10, .82)";
    roundRect(ctx, (canvas.width - width) / 2, y - blockHeight / 2 - 12, width, blockHeight + 24, 20);
    ctx.fill();
  }
  lines.forEach((parts, row) => {
    const lineText = parts.join(" ");
    const baseline = y - blockHeight / 2 + row * lineHeight;
    if (style === "minimal") {
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(0,0,0,.75)";
      ctx.strokeText(lineText + (row === lines.length - 1 ? emoji : ""), canvas.width / 2, baseline);
    } else if (style === "box") {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.strokeText(lineText + (row === lines.length - 1 ? emoji : ""), canvas.width / 2, baseline);
    } else {
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(0,0,0,.88)";
      ctx.strokeText(lineText + (row === lines.length - 1 ? emoji : ""), canvas.width / 2, baseline);
    }
    const activeWord = caption.words.findIndex((word) => time >= word.start && time <= word.end);
    let x = canvas.width / 2 - ctx.measureText(lineText + (row === lines.length - 1 ? emoji : "")).width / 2;
    parts.forEach((part) => {
      const wordIndex = caption.words.findIndex((word) => word.word.trim().toLocaleLowerCase() === part.toLocaleLowerCase());
      const isActive = wordIndex === activeWord;
      ctx.fillStyle = style === "viral" && isActive ? "#ffe600" : "#fff";
      const piece = `${part} `;
      const width = ctx.measureText(piece).width;
      ctx.textAlign = "left";
      ctx.fillText(piece, x, baseline);
      x += width;
    });
    if (row === lines.length - 1 && emoji) {
      ctx.textAlign = "left";
      ctx.fillText(emoji, x, baseline);
    }
    ctx.textAlign = "center";
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

async function renderCaptionedVideo(source: Blob, url: string, captions: Caption[], style: CaptionStyle, emojis: boolean) {
  const video = document.createElement("video");
  video.src = url;
  video.playsInline = true;
  video.muted = false;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Não consegui abrir o vídeo para aplicar as legendas."));
  });
  if (!video.captureStream && !(video as HTMLVideoElement & { webkitCaptureStream?: () => MediaStream }).webkitCaptureStream) {
    throw new Error("Este navegador não consegue exportar o vídeo com áudio e legendas. Tente no Chrome atualizado.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.captureStream) throw new Error("Este navegador não oferece a exportação de vídeo necessária.");
  const canvasStream = canvas.captureStream(30);
  const sourceStream = video.captureStream?.() ?? (video as HTMLVideoElement & { webkitCaptureStream: () => MediaStream }).webkitCaptureStream();
  const audioTracks = sourceStream.getAudioTracks();
  const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
  const type = recordingType() || "video/webm";
  const recorder = new MediaRecorder(outputStream, { mimeType: type, videoBitsPerSecond: 3_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("A exportação das legendas foi interrompida. Tente novamente."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || type }));
  });
  const draw = () => {
    if (video.paused || video.ended) return;
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const time = video.currentTime;
    drawCaption(ctx, canvas, captions.find((caption) => time >= caption.start && time <= caption.end), time, style, emojis);
    requestAnimationFrame(draw);
  };
  recorder.start(500);
  try {
    await video.play();
    draw();
    await new Promise<void>((resolve) => { video.onended = () => resolve(); });
    recorder.stop();
    return await done;
  } catch (error) {
    if (recorder.state === "recording") recorder.stop();
    throw error;
  } finally {
    sourceStream.getTracks().forEach((track) => track.stop());
    canvasStream.getTracks().forEach((track) => track.stop());
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

export default function TeleprompterRecorder({ open, onOpenChange, script, onUseRecording }: Props) {
  const cameraRef = useRef<HTMLVideoElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const speedRef = useRef(32);
  const animationRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [cameraError, setCameraError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [fontSize, setFontSize] = useState(25);
  const [speed, setSpeed] = useState(32);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("viral");
  const [useEmojis, setUseEmojis] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameraError("");
    setRecordedVideo(null);
    setCaptions([]);
    setPreviewUrl("");
    setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Este navegador não liberou acesso à câmera. Abra o app no Chrome ou Safari atualizado e permita o uso da câmera.");
      return;
    }
    void navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: { ideal: facing }, width: { ideal: 720 }, height: { ideal: 1280 } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (cameraRef.current) { cameraRef.current.srcObject = stream; void cameraRef.current.play().catch(() => undefined); }
      }).catch((error: unknown) => {
        const name = error instanceof DOMException ? error.name : "";
        setCameraError(name === "NotAllowedError" ? "Permita o acesso à câmera e ao microfone nas configurações do navegador e tente novamente." : name === "NotFoundError" ? "Não encontrei uma câmera ou um microfone neste aparelho." : "Não consegui abrir a câmera. Confira as permissões do navegador e tente novamente.");
      });
    return () => {
      cancelled = true;
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      if (recorderRef.current?.state === "recording") { discardRef.current = true; recorderRef.current.stop(); }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (cameraRef.current) cameraRef.current.srcObject = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, [open, facing]);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    if (!recording) return;
    let last = performance.now();
    const tick = (now: number) => { const elapsed = now - last; last = now; if (promptRef.current) promptRef.current.scrollTop += speedRef.current * elapsed / 1000; animationRef.current = requestAnimationFrame(tick); };
    animationRef.current = requestAnimationFrame(tick);
    return () => { if (animationRef.current !== null) cancelAnimationFrame(animationRef.current); animationRef.current = null; };
  }, [recording]);
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === "undefined") { setCameraError("Este navegador não oferece gravação de vídeo. Atualize o Chrome ou Safari e tente novamente."); return; }
    try {
      const mimeType = recordingType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 1_500_000 } : { videoBitsPerSecond: 1_500_000 });
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (discardRef.current) return;
        const type = recorder.mimeType || chunksRef.current[0]?.type || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 1000) { setCameraError("O vídeo ficou vazio. Confira as permissões da câmera e grave novamente."); return; }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setRecordedVideo(blob);
        setRecording(false);
      };
      recorder.onerror = () => { setRecording(false); setCameraError("A gravação foi interrompida pelo navegador. Tente novamente."); };
      recorderRef.current = recorder;
      if (promptRef.current) promptRef.current.scrollTop = 0;
      setSeconds(0);
      setRecording(true);
      recorder.start(1000);
    } catch { setCameraError("Não consegui iniciar a gravação neste navegador. Tente novamente."); }
  };

  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const discardRecording = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl("");
    setRecordedVideo(null);
    setCaptions([]);
    setSeconds(0);
    if (promptRef.current) promptRef.current.scrollTop = 0;
  };
  const useRecording = async (withCaptions = false) => {
    if (!recordedVideo) return;
    setSaving(true);
    setSaveError("");
    try {
      const finalVideo = withCaptions ? await renderCaptionedVideo(recordedVideo, previewUrl, captions, captionStyle, useEmojis) : recordedVideo;
      await onUseRecording(finalVideo);
      onOpenChange(false);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Não consegui salvar o vídeo. Tente novamente."); }
    finally { setSaving(false); }
  };
  const createCaptions = async () => {
    if (!recordedVideo) return;
    if (recordedVideo.size > 25 * 1024 * 1024) { setSaveError("Este vídeo passou de 25 MB. Grave em qualidade menor ou use um trecho mais curto para criar legendas."); return; }
    setTranscribing(true);
    setSaveError("");
    try {
      const result = await api.transcribeVideo(recordedVideo);
      const grouped = groupWords(result.words ?? []);
      if (!grouped.length) throw new Error(result.text ? "A transcrição veio sem tempo para sincronizar as falas." : "Não encontrei fala neste vídeo. Confira o áudio ou use o vídeo sem legenda.");
      setCaptions(grouped);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Não consegui criar as legendas. Tente novamente."); }
    finally { setTranscribing(false); }
  };
  const switchCamera = () => {
    if (recording || saving) return;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setFacing((value) => value === "user" ? "environment" : "user");
  };
  const formattedTime = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!recording && !saving && !transcribing) onOpenChange(next); }}>
      <DialogContent className="max-h-[96dvh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Teleprompter e câmera</DialogTitle>
          <DialogDescription>Leia o roteiro enquanto grava. Depois, você escolhe se quer legendas automáticas no vídeo.</DialogDescription>
        </DialogHeader>
        {cameraError ? (
          <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>{cameraError}</p><div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button></div></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-black">
              {previewUrl ? <video src={previewUrl} className="aspect-[9/16] max-h-[62dvh] w-full object-contain" controls playsInline /> : <>
                <video ref={cameraRef} className={`aspect-[9/16] max-h-[62dvh] w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} autoPlay muted playsInline />
                <div ref={promptRef} className="absolute inset-x-3 top-[14%] bottom-[14%] overflow-y-auto rounded-xl border border-white/20 bg-black/55 px-4 py-5 text-center text-white shadow-lg [scrollbar-width:none]"><p className="whitespace-pre-wrap font-semibold leading-relaxed drop-shadow" style={{ fontSize: `${fontSize}px` }}>{script || "Seu roteiro aparecerá aqui."}</p></div>
                {recording && <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-sm font-semibold text-white"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> REC {formattedTime}</div>}
              </>}
            </div>
            <div className="space-y-4">
              {!previewUrl && <>
                <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="teleprompter-speed">Velocidade</Label><span className="text-xs text-muted-foreground">{speed}</span></div><Slider id="teleprompter-speed" min={10} max={70} step={2} value={[speed]} onValueChange={(value) => setSpeed(value[0] ?? 32)} /><p className="text-xs text-muted-foreground">Ajuste para acompanhar sua fala.</p></div>
                <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="teleprompter-size">Tamanho do texto</Label><span className="text-xs text-muted-foreground">{fontSize}px</span></div><Slider id="teleprompter-size" min={18} max={38} step={1} value={[fontSize]} onValueChange={(value) => setFontSize(value[0] ?? 25)} /></div>
                <Button type="button" variant="outline" className="w-full" onClick={switchCamera} disabled={recording}><FlipHorizontal2 /> Usar câmera {facing === "user" ? "traseira" : "frontal"}</Button>
              </>}

              {previewUrl && recordedVideo && <div className="space-y-3 rounded-xl border p-3">
                <div><p className="text-sm font-semibold">Legenda automática</p><p className="mt-1 text-xs text-muted-foreground">A IA transcreve sua fala e sincroniza os trechos no vídeo.</p></div>
                {!captions.length ? <Button type="button" variant="outline" className="w-full" onClick={createCaptions} disabled={transcribing || saving}>{transcribing ? <Loader2 className="animate-spin" /> : <Sparkles />} {transcribing ? "Ouvindo e sincronizando…" : "Criar legendas"}</Button> : <>
                  <div className="space-y-2"><Label>Estilo da legenda</Label><div className="grid grid-cols-3 gap-1.5">{STYLES.map((style) => <button key={style.id} type="button" onClick={() => setCaptionStyle(style.id)} className={`rounded-lg border p-2 text-left ${captionStyle === style.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}><span className="block text-xs font-semibold">{style.label}</span><span className="mt-1 block text-[10px] leading-tight text-muted-foreground">{style.sample}</span></button>)}</div></div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-secondary/50 p-2.5 text-sm"><input type="checkbox" checked={useEmojis} onChange={(event) => setUseEmojis(event.target.checked)} /> Emojis automáticos pela fala</label>
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1"><Label>Revise as falas e escolha emojis</Label>{captions.map((caption, index) => <div key={`${caption.start}-${index}`} className="flex gap-1.5"><input aria-label={`Legenda ${index + 1}`} className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs" value={caption.text} onChange={(event) => setCaptions((current) => current.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} /><select aria-label={`Emoji da legenda ${index + 1}`} className="w-14 rounded-md border bg-background px-1 text-sm" value={caption.emoji} onChange={(event) => setCaptions((current) => current.map((item, i) => i === index ? { ...item, emoji: event.target.value } : item))}>{EMOJIS.map((emoji, i) => <option key={`${emoji}-${i}`} value={emoji}>{emoji || "—"}</option>)}</select></div>)}</div>
                </>}
                <p className="text-[11px] text-muted-foreground">As legendas ficam gravadas no arquivo final, prontas para baixar ou postar.</p>
              </div>}

              <div className="flex flex-wrap gap-2">
                {!previewUrl && !recording && <Button type="button" className="min-h-12 flex-1" onClick={startRecording}><Circle className="fill-red-500 text-red-500" /> Gravar</Button>}
                {!previewUrl && recording && <Button type="button" variant="destructive" className="min-h-12 flex-1" onClick={stopRecording}><Square className="fill-current" /> Parar</Button>}
                {previewUrl && <>
                  <Button asChild type="button" variant="outline" className="flex-1" disabled={saving || transcribing}><a href={previewUrl} download={`reel-${Date.now()}.${recordedVideo?.type.includes("mp4") ? "mp4" : "webm"}`}><Download /> Baixar vídeo</a></Button>
                  <Button type="button" variant="outline" className="flex-1" onClick={discardRecording} disabled={saving || transcribing}><RotateCcw /> Gravar de novo</Button>
                  {!captions.length && <Button type="button" className="min-h-12 flex-1" onClick={() => void useRecording()} disabled={saving || transcribing}>{saving ? <Loader2 className="animate-spin" /> : <Play />} {saving ? "Salvando…" : "Usar sem legenda"}</Button>}
                  {captions.length > 0 && <Button type="button" className="min-h-12 flex-1" onClick={() => void useRecording(true)} disabled={saving || transcribing}>{saving ? <Loader2 className="animate-spin" /> : <Check />} {saving ? "Aplicando e salvando…" : "Aplicar e salvar"}</Button>}
                </>}
                {!recording && !previewUrl && <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={() => onOpenChange(false)}><X /></Button>}
              </div>
              {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
              {previewUrl && <p className="text-xs text-muted-foreground">Se escolher “Usar sem legenda”, o vídeo original vai para o rascunho. Com “Aplicar e salvar”, a cópia legendada será anexada.</p>}
              <p className="text-xs text-muted-foreground">O vídeo fica salvo no rascunho e não será publicado automaticamente.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
