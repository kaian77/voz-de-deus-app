// Grava a cena 3D (scene.html) quadro a quadro: node render.cjs <timeline.json> <saida.mp4>
// Sobe um servidor estático na raiz do repositório (o three.js vem do node_modules).
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

(async () => {
  const [tlPath, out] = process.argv.slice(2);
  const tl = JSON.parse(fs.readFileSync(tlPath, "utf8"));
  const root = path.resolve(__dirname, "../..");
  const port = 8800 + Math.floor(Math.random() * 100);
  const srv = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1200));
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
    p.on("pageerror", (e) => console.error("página:", e.message));
    await p.goto(`http://127.0.0.1:${port}/video/lowpoly/scene.html?t=${tl.topic || "damper"}`);
    await p.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
    await p.evaluate((x) => window.setTL(x), tl);
    const FPS = 30, N = Math.ceil(tl.total * FPS);
    const only = process.env.FRAMES ? process.env.FRAMES.split(",").map(Number) : null;
    if (only) {  // teste: só alguns instantes, em JPG
      for (const s of only) {
        await p.evaluate((t) => window.render(t), s);
        await p.screenshot({ path: `${out}-${s}.jpg`, type: "jpeg", quality: 85 });
      }
      return;
    }
    const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", out]);
    for (let f = 0; f < N; f++) {
      await p.evaluate((t) => window.render(t), f / FPS);
      const buf = await p.screenshot({ type: "jpeg", quality: 90 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 150 === 0) console.log(`quadro ${f}/${N}`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on("close", r));
  } finally {
    await b.close();
    srv.kill();
  }
})();
