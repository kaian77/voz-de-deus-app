// Tela do treino: câmera + esqueleto + placar, séries, descanso, voz e gravação.
// O placar e o esqueleto são desenhados no mesmo canvas que é gravado, então o vídeo sai com tudo.
import { EXERCISES, store, today, uid, type ExLog, type PlanItem, type Session, type SetLog, records } from "./data";
import { makeAnalyzer, type Analyzer, type CoachOut } from "./coach";
import { BONES, loadPose, Smoother, type Pt } from "./pose";
import { audio, beep, numberWord, recDest, say, setVoice } from "./voice";
import { Recorder, recordings, extOf } from "./rec";
import { drawTonhao, intro, TONHAO } from "./tonhao";

interface Rect { x: number; y: number; w: number; h: number }
type Phase = "loading" | "prep" | "work" | "rest" | "done";

const GREEN = "#3dff8a", RED = "#ff3b4a", LIME = "#d4ff3f";

export interface WorkoutOpts { name: string; items: PlanItem[]; onClose: () => void }

export async function startWorkout(o: WorkoutOpts) {
  const prefs = store.prefs();
  setVoice(prefs.voice);
  audio();
  const root = document.createElement("div");
  root.className = "ws";
  root.innerHTML = `
    <video playsinline muted autoplay></video>
    <canvas></canvas>
    <div class="ws-top">
      <button data-a="close" class="ws-btn" aria-label="Encerrar">✕</button>
      <span class="ws-rec" hidden>● REC</span>
      <button data-a="flip" class="ws-btn" aria-label="Trocar câmera">🔄</button>
    </div>
    <div class="ws-bottom">
      <button data-a="minus" class="ws-btn">−1</button>
      <button data-a="pause" class="ws-btn ws-wide">⏸ Pausar</button>
      <button data-a="skip" class="ws-btn ws-wide">⏭ Próxima</button>
      <button data-a="plus" class="ws-btn">+1</button>
    </div>
    <div class="ws-modal" hidden></div>`;
  document.body.appendChild(root);
  document.body.classList.add("noscroll");
  const video = root.querySelector("video")!;
  const canvas = root.querySelector("canvas")!;
  const g = canvas.getContext("2d")!;
  const modal = root.querySelector<HTMLDivElement>(".ws-modal")!;
  const recBadge = root.querySelector<HTMLSpanElement>(".ws-rec")!;
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-a="pause"]')!;

  let facing: "user" | "environment" = "user";
  let stream: MediaStream | null = null;
  let phase: Phase = "loading";
  let status = "Abrindo a câmera…";
  let paused = false;
  let alive = true;
  let wake: { release: () => Promise<void> } | null = null;

  // progresso do treino
  let ei = 0, setNo = 1, reps = 0, good = 0, secs = 0;
  let setIssues = new Set<string>();
  const logs: ExLog[] = o.items.map((it) => ({ ex: it.ex, target: it.reps, kg: it.kg, sets: [] }));
  let analyzer: Analyzer = makeAnalyzer(o.items[0].ex, prefs);
  let timer = 0; // fim do descanso / contagem (ms)
  let lastOut: CoachOut | null = null;
  let feedback = "", feedbackAt = 0, feedbackBad = false;
  let flash = 0;
  let unseenSince = 0;
  let lastTick = -1;
  let lastHold = 0;
  let pipUntil = 0;
  let introduced = false;
  const started = Date.now();
  const smoother = new Smoother();
  const rec = new Recorder();
  let pts: Pt[] | null = null;

  const item = () => o.items[ei];
  const info = () => EXERCISES[item().ex];

  function show(text: string, bad = false) { feedback = text; feedbackAt = Date.now(); feedbackBad = bad; if (bad && phase === "work") pipUntil = Date.now() + 4500; }

  async function openCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch {
      status = "Sem acesso à câmera. Libere a câmera no navegador ou use os botões +1.";
      return false;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    await new Promise((r) => (video.readyState >= 2 ? r(0) : (video.onloadeddata = () => r(0))));
    fitCanvas();
    return true;
  }

  function announce(first: boolean) {
    const it = item(), inf = info();
    const unit = inf.timed ? "segundos" : "repetições";
    if (first) {
      say(`${intro(inf.name, inf.tips, !introduced)} ${it.sets} séries de ${it.reps} ${unit}. Deixa o celular de ${inf.view === "lado" ? "lado" : "frente"} para você, pegando o corpo inteiro.`, { now: true });
      introduced = true;
    }
    phase = "prep";
    timer = Date.now() + (first ? Math.max(5, prefs.countdown) * 1000 + 12000 : 3000);
    lastTick = -1;
  }

  function startSet() {
    phase = "work";
    reps = 0; good = 0; secs = 0; setIssues = new Set();
    analyzer = makeAnalyzer(item().ex, prefs);
    beep("go");
    say("Vai!", { now: true });
    show("Vai!");
  }

  function finishSet() {
    const s: SetLog = { reps, good, issues: [...setIssues] };
    if (info().timed) s.secs = Math.round(secs);
    logs[ei].sets.push(s);
    beep("done");
    const it = item();
    const lastSet = setNo >= it.sets;
    const lastEx = ei >= o.items.length - 1;
    if (lastSet && lastEx) return finish();
    const quality = !info().timed && reps ? Math.round((good / reps) * 100) : 100;
    const praise = quality >= 90 ? "Forma perfeita!" : quality >= 60 ? "Boa!" : "Atenção na forma na próxima.";
    if (lastSet) { ei++; setNo = 1; } else setNo++;
    phase = "rest";
    timer = Date.now() + it.rest * 1000;
    lastTick = -1;
    say(`Série completa! ${praise} Descanso de ${it.rest} segundos.`, { now: true });
  }

  function onCoach(out: CoachOut) {
    lastOut = out;
    if (!out.visible) {
      if (!unseenSince) unseenSince = Date.now();
      if (Date.now() - unseenSince > 1500) {
        show("Afaste o celular: preciso ver o corpo inteiro", true);
        say("Afaste o celular, preciso ver seu corpo inteiro", { gap: 7000 });
      }
      return;
    }
    unseenSince = 0;
    if (out.cue && !out.rep) { show(out.cue, out.bad.size > 0); say(out.cue, { gap: 4000 }); }
    if (out.rep) {
      for (const i of out.rep.issues) setIssues.add(i);
      if (out.rep.counted) {
        reps++;
        if (out.rep.good) good++;
        flash = Date.now();
        beep(out.rep.good ? "rep" : "bad");
        const left = item().reps - reps;
        if (out.rep.good) {
          say(left === 3 ? `${numberWord(reps)}. Faltam três!` : left === 1 ? `${numberWord(reps)}. Última!` : numberWord(reps), { now: true });
          show(reps % 5 === 0 ? "Isso! Continua assim" : "Boa!");
        } else {
          const why = out.rep.issues[0] ?? "";
          say(`${numberWord(reps)}. ${why}`, { now: true });
          show(why || "Contou, mas capricha na forma", true);
        }
        if (reps >= item().reps) finishSet();
      } else {
        beep("bad");
        const why = out.rep.issues[out.rep.issues.length - 1] ?? "Não contou";
        say(`Não contou. ${why}`, { now: true });
        show(`Não contou · ${why}`, true);
      }
    }
    if (info().timed && phase === "work") {
      const now = performance.now();
      if (out.hold) {
        secs += lastHold ? Math.min(0.2, (now - lastHold) / 1000) : 0;
        const left = Math.ceil(item().reps - secs);
        if (left !== lastTick && (left === 10 || left <= 3) && left > 0) { lastTick = left; say(left === 10 ? "Dez segundos" : numberWord(left), { now: true }); }
        if (secs >= item().reps) finishSet();
      } else if (out.cue) setIssues.add(out.cue);
      lastHold = out.hold ? now : 0;
    }
  }

  async function finish() {
    if (phase === "done") return;
    phase = "done";
    say("Treino concluído! Mandou muito bem.", { now: true });
    beep("done");
    const before = records(store.history());
    const session: Session = { id: uid(), date: today(), started, ended: Date.now(), name: o.name, exercises: logs.filter((l) => l.sets.length) };
    if (session.exercises.length) store.addSession(session);
    const after = records(store.history());
    const prs = Object.entries(after).filter(([k, v]) => (v ?? 0) > ((before as Record<string, number>)[k] ?? 0) && (before as Record<string, number>)[k] !== undefined);
    // segura 1 s para o vídeo pegar o "Treino concluído"
    await new Promise((r) => setTimeout(r, 1200));
    const video = rec.on ? await rec.stop() : null;
    let recId = "";
    if (video && video.blob.size > 1000) {
      recId = uid();
      await recordings.put({ id: recId, date: Date.now(), title: `${o.name} · ${new Date().toLocaleDateString("pt-BR")}`, mime: video.blob.type, secs: video.secs, blob: video.blob }).catch(() => {});
    }
    let total = 0, ok = 0;
    for (const e of session.exercises) for (const s of e.sets) { total += s.reps; ok += s.good; }
    const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
    modal.hidden = false;
    modal.innerHTML = `
      <div class="sum">
        <div class="sum-emoji">🏆</div>
        <h2>Treino concluído!</h2>
        <div class="sum-grid">
          <div><b>${total}</b><span>repetições</span></div>
          <div><b>${total ? Math.round((ok / total) * 100) : 0}%</b><span>forma certa</span></div>
          <div><b>${mins}</b><span>minutos</span></div>
        </div>
        ${prs.length ? `<div class="sum-pr">🔥 Novo recorde: ${prs.map(([k, v]) => `${EXERCISES[k as keyof typeof EXERCISES].name} (${v})`).join(", ")}</div>` : ""}
        <ul class="sum-list">${session.exercises.map((e) => `<li><span>${EXERCISES[e.ex].emoji} ${EXERCISES[e.ex].name}</span><span>${e.sets.map((s) => (EXERCISES[e.ex].timed ? `${s.secs}s` : `${s.good}/${s.reps}`)).join(" · ")}</span></li>`).join("")}</ul>
        ${session.exercises.flatMap((e) => e.sets.flatMap((s) => s.issues)).length ? `<div class="sum-tip"><b>Para melhorar:</b> ${[...new Set(session.exercises.flatMap((e) => e.sets.flatMap((s) => s.issues)))].slice(0, 3).join(" · ")}</div>` : ""}
        ${recId ? `<button class="btn" data-a="save">🎬 Salvar o vídeo no celular</button>` : ""}
        <button class="btn ghost" data-a="exit">Fechar</button>
      </div>`;
    if (recId && video) {
      modal.querySelector('[data-a="save"]')!.addEventListener("click", () => shareVideo(video.blob, o.name));
    }
    modal.querySelector('[data-a="exit"]')!.addEventListener("click", close);
  }

  function close() {
    alive = false;
    rec.stop();
    stream?.getTracks().forEach((t) => t.stop());
    try { speechSynthesis.cancel(); } catch { /* */ }
    wake?.release().catch(() => {});
    root.remove();
    document.body.classList.remove("noscroll");
    o.onClose();
  }

  root.addEventListener("click", async (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
    if (!a) return;
    if (a === "close") {
      if (phase === "done") return close();
      if (logs.some((l) => l.sets.length) || reps) {
        if (confirm("Encerrar o treino e salvar o que você já fez?")) {
          if (phase === "work" && (reps || secs)) logs[ei].sets.push({ reps, good, secs: info().timed ? Math.round(secs) : undefined, issues: [...setIssues] });
          finish();
        }
      } else if (confirm("Sair do treino?")) close();
    }
    if (a === "flip") { facing = facing === "user" ? "environment" : "user"; smoother.reset(); await openCamera(); }
    if (a === "pause") {
      paused = !paused;
      pauseBtn.textContent = paused ? "▶ Continuar" : "⏸ Pausar";
      if (paused) { rec.pause(); say("Pausado", { now: true }); } else { rec.resume(); say("Continuando", { now: true }); if (phase === "rest") timer = Date.now() + 10000; }
    }
    if (a === "skip") {
      if (phase === "work") finishSet();
      else if (phase === "rest" || phase === "prep") { timer = 0; }
    }
    if (a === "plus" && phase === "work") onCoach({ bad: new Set(), visible: true, progress: 1, rep: { counted: true, good: true, issues: [] } });
    if (a === "minus" && phase === "work" && reps > 0) { reps--; good = Math.min(good, reps); }
  });

  // ---- desenho ----
  /** Canvas no formato da tela (em pé no celular), até 1080 de largura: é o que vai para o vídeo. */
  function fitCanvas() {
    const sw = innerWidth, sh = innerHeight;
    const k = Math.min(1080 / Math.min(sw, sh), 2.5);
    canvas.width = Math.round(sw * k / 2) * 2;
    canvas.height = Math.round(sh * k / 2) * 2;
  }
  addEventListener("resize", () => { if (alive && !rec.on) fitCanvas(); });
  function drawSkeleton(p: Pt[], out: CoachOut | null, mirror: boolean, W: number, aspect: number, r: Rect) {
    const X = (pt: Pt) => { const x = r.x + (pt.x / aspect) * r.w; return mirror ? W - x : x; };
    const Y = (pt: Pt) => r.y + pt.y * r.h;
    const lw = Math.max(4, W / 110);
    g.lineCap = "round";
    for (const [a, b] of BONES) {
      if (p[a].v < 0.35 || p[b].v < 0.35) continue;
      const bad = out?.bad.has(a) || out?.bad.has(b);
      g.strokeStyle = "rgba(0,0,0,.45)";
      g.lineWidth = lw + 4;
      g.beginPath(); g.moveTo(X(p[a]), Y(p[a])); g.lineTo(X(p[b]), Y(p[b])); g.stroke();
      g.strokeStyle = bad ? RED : GREEN;
      g.lineWidth = lw;
      g.shadowColor = bad ? RED : GREEN;
      g.shadowBlur = 12;
      g.beginPath(); g.moveTo(X(p[a]), Y(p[a])); g.lineTo(X(p[b]), Y(p[b])); g.stroke();
      g.shadowBlur = 0;
    }
    for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      if (p[i].v < 0.35) continue;
      const bad = out?.bad.has(i);
      g.fillStyle = bad ? RED : "#fff";
      g.beginPath(); g.arc(X(p[i]), Y(p[i]), lw * (bad ? 1.3 : 0.9), 0, Math.PI * 2); g.fill();
      if (bad) { g.strokeStyle = "rgba(255,59,74,.5)"; g.lineWidth = 3; g.beginPath(); g.arc(X(p[i]), Y(p[i]), lw * 3 + Math.sin(Date.now() / 120) * lw, 0, Math.PI * 2); g.stroke(); }
    }
  }

  function rr(x: number, y: number, w: number, h: number, r: number) {
    g.beginPath(); g.roundRect(x, y, w, h, r);
  }

  function text(t: string, x: number, y: number, size: number, color = "#fff", align: CanvasTextAlign = "left", weight = 800) {
    g.font = `${weight} ${size}px "Inter Tight", system-ui, sans-serif`;
    g.textAlign = align;
    g.fillStyle = color;
    g.fillText(t, x, y);
  }

  function wrap(t: string, maxW: number, size: number): string[] {
    g.font = `800 ${size}px "Inter Tight", system-ui, sans-serif`;
    const out: string[] = []; let line = "";
    for (const w of t.split(" ")) { const tl = line ? line + " " + w : w; if (g.measureText(tl).width > maxW && line) { out.push(line); line = w; } else line = tl; }
    if (line) out.push(line);
    return out;
  }

  function drawHud(W: number, H: number) {
    const u = Math.min(W, H) / 100; // unidade
    const it = item(), inf = info();
    // faixa de cima
    if (phase === "work") {
      const grad = g.createLinearGradient(0, 0, 0, u * 44);
      grad.addColorStop(0, "rgba(0,0,0,.75)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad; g.fillRect(0, 0, W, u * 44);
      text(`${inf.name.toUpperCase()}`, u * 5, u * 31, u * 6.5);
      text(`SÉRIE ${Math.min(setNo, it.sets)}/${it.sets}${it.kg ? ` · ${it.kg} KG` : ""}`, u * 5, u * 38, u * 3.8, LIME, "left", 800);
    }
    text("FORMA", W / 2, H - u * 3, u * 3, "rgba(255,255,255,.55)", "center", 900);

    if (phase === "work") {
      // contador grande
      const pop = Math.max(0, 1 - (Date.now() - flash) / 300);
      const size = u * (20 + pop * 6);
      const val = inf.timed ? `${Math.floor(secs)}` : `${reps}`;
      g.save();
      g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 20;
      text(val, W - u * 6, H - u * 34, size, pop > 0 ? LIME : "#fff", "right", 900);
      g.restore();
      text(`/ ${it.reps}${inf.timed ? "s" : ""}`, W - u * 6, H - u * 28, u * 4.5, "rgba(255,255,255,.85)", "right", 700);
      if (!inf.timed && reps) text(`${good} perfeitas`, W - u * 6, H - u * 23.5, u * 3.2, GREEN, "right", 700);
      // barra de amplitude
      const prog = lastOut?.progress ?? 0;
      const bh = H * 0.35, bx = u * 4, by = H * 0.33;
      rr(bx, by, u * 3, bh, u * 1.5); g.fillStyle = "rgba(0,0,0,.45)"; g.fill();
      rr(bx, by + bh * (1 - prog), u * 3, bh * prog, u * 1.5); g.fillStyle = prog > 0.85 ? GREEN : LIME; g.fill();
      if (lastOut?.metric) text(lastOut.metric, bx, by + bh + u * 5, u * 2.8, "rgba(255,255,255,.8)", "left", 600);
      if (inf.timed && lastOut) {
        text(lastOut.hold ? "✓ NA POSIÇÃO" : "FORA DA POSIÇÃO", W / 2, u * 36, u * 4.5, lastOut.hold ? GREEN : RED, "center", 900);
      }
    }

    // Tonhão no canto mostrando o jeito certo quando você erra
    if (phase === "work" && Date.now() < pipUntil) {
      const S = Math.min(W, H) * 0.34;
      const px = W - S - u * 4, py = u * 50;
      drawTonhao(g, it.ex, { time: performance.now() / 1000, x: px, y: py, size: S, bg: true });
      rr(px, py - u * 6.5, S, u * 6, u * 2); g.fillStyle = LIME; g.fill();
      text(`${TONHAO}: assim ó! 👇`, px + S / 2, py - u * 2.2, u * 3.4, "#111", "center", 900);
    }

    // mensagem do personal
    if (feedback && Date.now() - feedbackAt < 2600 && (phase === "work" || phase === "prep")) {
      const lines = wrap(feedback, W - u * 16, u * 5);
      const h = lines.length * u * 6.4 + u * 4;
      const y = H - u * 18 - h;
      rr(u * 5, y, W - u * 10, h, u * 3);
      g.fillStyle = feedbackBad ? "rgba(255,59,74,.92)" : "rgba(61,255,138,.92)"; g.fill();
      lines.forEach((l, i) => text(l, W / 2, y + u * 6.5 + i * u * 6.4, u * 5, feedbackBad ? "#fff" : "#06230f", "center", 900));
    }

    if (phase === "prep" || phase === "rest" || phase === "loading") {
      g.fillStyle = phase === "loading" ? "rgba(10,12,14,.85)" : "rgba(10,12,14,.62)";
      g.fillRect(0, 0, W, H);
      if (phase === "loading") {
        wrap(status, W - u * 14, u * 5).forEach((l, i) => text(l, W / 2, H / 2 + i * u * 6.5, u * 5, "#fff", "center", 700));
        return;
      }
      const left = Math.max(0, Math.ceil((timer - Date.now()) / 1000));
      const nx = item(), ninf = info();
      const demo = phase === "prep" && setNo === 1;
      text(phase === "rest" ? "DESCANSO" : demo ? `O ${TONHAO.toUpperCase()} MOSTRA COMO FAZ` : "PREPARE-SE", W / 2, u * 31, u * (demo ? 4.6 : 6), LIME, "center", 900);
      const S = Math.min(W * 0.7, H * (demo ? 0.34 : 0.26));
      const fy = u * 36;
      drawTonhao(g, nx.ex, { time: performance.now() / 1000, x: W / 2 - S / 2, y: fy, size: S, bg: true });
      let y = fy + S + u * 18;
      const mm = phase === "rest" && left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : String(left);
      text(mm, W / 2, y, u * 18, "#fff", "center", 900);
      y += u * 8;
      text(`${phase === "rest" ? "A seguir: " : ""}${ninf.name} · série ${setNo}/${nx.sets}`, W / 2, y, u * 4.2, "#fff", "center", 700);
      y += u * 6;
      text(`${nx.reps} ${ninf.timed ? "segundos" : "repetições"} · celular de ${ninf.view}`, W / 2, y, u * 3.6, "rgba(255,255,255,.75)", "center", 600);
      y += u * 8;
      ninf.tips.slice(0, 3).forEach((t, i) => text(`✓ ${t}`, W / 2, y + i * u * 5.2, u * 3.4, "rgba(255,255,255,.9)", "center", 600));
    }
    if (paused) {
      g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, 0, W, H);
      text("PAUSADO", W / 2, H / 2, u * 10, "#fff", "center", 900);
    }
  }

  // ---- laço principal ----
  let lastVideoTime = -1;
  const loop = async () => {
    if (!alive) return;
    requestAnimationFrame(loop);
    const W = canvas.width, H = canvas.height;
    const mirror = facing === "user";
    const vw = video.videoWidth || 720, vh = video.videoHeight || 1280;
    // vídeo inteiro na tela (o corpo não pode ser cortado); a sobra é o próprio vídeo ampliado e escurecido
    const sc = Math.min(W / vw, H / vh);
    const r: Rect = { w: vw * sc, h: vh * sc, x: (W - vw * sc) / 2, y: (H - vh * sc) / 2 };
    if (video.readyState >= 2) {
      g.save();
      if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
      if (r.w < W - 1 || r.h < H - 1) {
        const cs = Math.max(W / vw, H / vh);
        g.drawImage(video, (W - vw * cs) / 2, (H - vh * cs) / 2, vw * cs, vh * cs);
        g.fillStyle = "rgba(8,10,12,.78)"; g.fillRect(0, 0, W, H);
      }
      g.drawImage(video, r.x, r.y, r.w, r.h);
      g.restore();
    } else { g.fillStyle = "#0b0d10"; g.fillRect(0, 0, W, H); }
    const aspect = vw / vh;
    if (landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime && !paused) {
      lastVideoTime = video.currentTime;
      const res = landmarker.detectForVideo(video, performance.now());
      const lm = res.landmarks?.[0];
      if (lm) {
        pts = smoother.push(lm.map((q) => ({ x: q.x * aspect, y: q.y, v: q.visibility ?? 1 })));
        if (phase === "work") onCoach(analyzer.update(pts));
        else lastOut = null;
      } else {
        pts = null;
        if (phase === "work") onCoach({ bad: new Set(), visible: false, progress: 0 });
      }
    }
    if (pts) drawSkeleton(pts, phase === "work" ? lastOut : null, mirror, W, aspect, r);

    // tempo das fases
    if (!paused && (phase === "prep" || phase === "rest")) {
      const left = Math.ceil((timer - Date.now()) / 1000);
      if (left !== lastTick) {
        lastTick = left;
        if (phase === "rest" && left === 10) say("Dez segundos", { now: true });
        if (left <= 3 && left > 0) { beep("tick"); if (phase === "prep") say(numberWord(left), { now: true }); }
      }
      if (Date.now() >= timer) {
        if (phase === "rest") {
          const firstOfEx = setNo === 1;
          if (firstOfEx) announce(true); else startSet();
        } else startSet();
      }
    }
    drawHud(W, H);
  };

  let landmarker: Awaited<ReturnType<typeof loadPose>> | null = null;
  requestAnimationFrame(loop);
  try { wake = await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* */ }
  const camOk = await openCamera();
  if (camOk) {
    try {
      landmarker = await loadPose((s) => (status = s));
    } catch {
      status = "Não consegui carregar a visão do corpo. Confira a internet. Os botões +1 continuam funcionando.";
    }
  }
  if (!alive) return;
  if (prefs.record && camOk) {
    if (rec.start(canvas, recDest?.stream)) recBadge.hidden = false;
  }
  announce(true);
}

export async function shareVideo(blob: Blob, name: string) {
  const file = new File([blob], `forma-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${today()}.${extOf(blob.type)}`, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Meu treino no FORMA" }); return; } catch { /* cancelou */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
