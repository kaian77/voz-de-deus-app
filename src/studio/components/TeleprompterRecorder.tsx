import { useEffect, useRef, useState } from "react";
import { Camera, Circle, Download, FlipHorizontal2, Loader2, Play, RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: string;
  onUseRecording: (video: Blob) => Promise<void>;
};

function recordingType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
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
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameraError("");
    setRecordedVideo(null);
    setPreviewUrl("");
    setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Este navegador não liberou acesso à câmera. Abra o app no Chrome ou Safari atualizado e permita o uso da câmera.");
      return;
    }
    void navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: { ideal: facing }, width: { ideal: 720 }, height: { ideal: 1280 } },
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (cameraRef.current) {
        cameraRef.current.srcObject = stream;
        void cameraRef.current.play().catch(() => undefined);
      }
    }).catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : "";
      setCameraError(name === "NotAllowedError"
        ? "Permita o acesso à câmera e ao microfone nas configurações do navegador e tente novamente."
        : name === "NotFoundError"
          ? "Não encontrei uma câmera ou um microfone neste aparelho."
          : "Não consegui abrir a câmera. Confira as permissões do navegador e tente novamente.");
    });
    return () => {
      cancelled = true;
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      if (recorderRef.current?.state === "recording") {
        discardRef.current = true;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (cameraRef.current) cameraRef.current.srcObject = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, [open, facing]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    if (!recording) return;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      if (promptRef.current) promptRef.current.scrollTop += speedRef.current * elapsed / 1000;
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [recording]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === "undefined") {
      setCameraError("Este navegador não oferece gravação de vídeo. Atualize o Chrome ou Safari e tente novamente.");
      return;
    }
    try {
      const mimeType = recordingType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_000_000 } : { videoBitsPerSecond: 2_000_000 });
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (discardRef.current) return;
        const type = recorder.mimeType || chunksRef.current[0]?.type || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 1000) {
          setCameraError("O vídeo ficou vazio. Confira as permissões da câmera e grave novamente.");
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setRecordedVideo(blob);
        setRecording(false);
      };
      recorder.onerror = () => {
        setRecording(false);
        setCameraError("A gravação foi interrompida pelo navegador. Tente novamente.");
      };
      recorderRef.current = recorder;
      if (promptRef.current) promptRef.current.scrollTop = 0;
      setSeconds(0);
      setRecording(true);
      recorder.start(1000);
    } catch {
      setCameraError("Não consegui iniciar a gravação neste navegador. Tente novamente.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const discardRecording = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl("");
    setRecordedVideo(null);
    setSeconds(0);
    if (promptRef.current) promptRef.current.scrollTop = 0;
  };

  const useRecording = async () => {
    if (!recordedVideo) return;
    setSaving(true);
    setSaveError("");
    try {
      await onUseRecording(recordedVideo);
      onOpenChange(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não consegui salvar o vídeo. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const switchCamera = () => {
    if (recording || saving) return;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setFacing((value) => value === "user" ? "environment" : "user");
  };

  const formattedTime = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!recording && !saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[96dvh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Teleprompter e câmera</DialogTitle>
          <DialogDescription>Leia o roteiro na tela enquanto grava. A gravação não inclui o texto sobreposto.</DialogDescription>
        </DialogHeader>

        {cameraError ? (
          <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{cameraError}</p>
            <div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button></div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-black">
              {previewUrl ? (
                <video src={previewUrl} className="aspect-[9/16] max-h-[62dvh] w-full object-contain" controls playsInline />
              ) : (
                <>
                  <video ref={cameraRef} className={`aspect-[9/16] max-h-[62dvh] w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} autoPlay muted playsInline />
                  <div ref={promptRef} className="absolute inset-x-3 top-[14%] bottom-[14%] overflow-y-auto rounded-xl border border-white/20 bg-black/55 px-4 py-5 text-center text-white shadow-lg [scrollbar-width:none]">
                    <p className="whitespace-pre-wrap font-semibold leading-relaxed drop-shadow" style={{ fontSize: `${fontSize}px` }}>{script || "Seu roteiro aparecerá aqui."}</p>
                  </div>
                  {recording && <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-sm font-semibold text-white"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> REC {formattedTime}</div>}
                </>
              )}
            </div>

            <div className="space-y-4">
              {!previewUrl && <>
                <div className="space-y-2">
                  <div className="flex justify-between"><Label htmlFor="teleprompter-speed">Velocidade</Label><span className="text-xs text-muted-foreground">{speed}</span></div>
                  <Slider id="teleprompter-speed" min={10} max={70} step={2} value={[speed]} onValueChange={(value) => setSpeed(value[0] ?? 32)} />
                  <p className="text-xs text-muted-foreground">Ajuste para acompanhar sua fala.</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between"><Label htmlFor="teleprompter-size">Tamanho do texto</Label><span className="text-xs text-muted-foreground">{fontSize}px</span></div>
                  <Slider id="teleprompter-size" min={18} max={38} step={1} value={[fontSize]} onValueChange={(value) => setFontSize(value[0] ?? 25)} />
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={switchCamera} disabled={recording}><FlipHorizontal2 /> Usar câmera {facing === "user" ? "traseira" : "frontal"}</Button>
              </>}

              <div className="flex flex-wrap gap-2">
                {!previewUrl && !recording && <Button type="button" className="min-h-12 flex-1" onClick={startRecording}><Circle className="fill-red-500 text-red-500" /> Gravar</Button>}
                {!previewUrl && recording && <Button type="button" variant="destructive" className="min-h-12 flex-1" onClick={stopRecording}><Square className="fill-current" /> Parar</Button>}
                {previewUrl && <>
                  <Button asChild type="button" variant="outline" className="flex-1" disabled={saving}>
                    <a href={previewUrl} download={`reel-${Date.now()}.${recordedVideo?.type.includes("mp4") ? "mp4" : "webm"}`}><Download /> Baixar vídeo</a>
                  </Button>
                  <Button type="button" variant="outline" className="flex-1" onClick={discardRecording} disabled={saving}><RotateCcw /> Gravar de novo</Button>
                  <Button type="button" className="min-h-12 flex-1" onClick={useRecording} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Play />} {saving ? "Salvando…" : "Usar vídeo"}</Button>
                </>}
                {!recording && !previewUrl && <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={() => onOpenChange(false)}><X /></Button>}
              </div>
              {previewUrl && <p className="text-xs text-muted-foreground">Confira o vídeo. Ao tocar em “Usar vídeo”, ele será enviado ao rascunho do Reel.</p>}
              {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
              <p className="text-xs text-muted-foreground">Dica: apoie o celular na altura dos olhos. A gravação será salva no app e não será publicada automaticamente.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
