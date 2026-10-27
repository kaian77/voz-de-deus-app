const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.goto('file://' + process.cwd() + '/tut.html');
  await p.evaluate(() => window.ready);
  const END = await p.evaluate(() => window.END);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', 'silent.mp4']);
  for (let f = 0; f < END * 30; f++) {
    await p.evaluate(t => render(t), f / 30);
    const buf = await p.locator('#c').screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
})();
