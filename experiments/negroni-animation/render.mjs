// Frame-exact export: loads index.html in headless Chromium, calls render(t)
// for every frame, saves PNGs and encodes them to an H.264 MP4 with ffmpeg.
//
//   node render.mjs                 -> frames + negroni.mp4 + contact-sheet.png
//   node render.mjs --sheet         -> only the 1-frame-per-second contact sheet
//
// Env: FFMPEG (ffmpeg binary, default "ffmpeg"), PLAYWRIGHT (module path, default "playwright").
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const here = dirname(fileURLToPath(import.meta.url));
const sheetOnly = process.argv.includes('--sheet');
const framesDir = process.env.FRAMES_DIR || join(here, '.frames');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'index.html')).href + '?export=1');
await page.evaluate(() => window.ready);
const { DURATION, FPS } = await page.evaluate(() => ({ DURATION: window.DURATION, FPS: window.FPS }));

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const total = DURATION * FPS;
const step = sheetOnly ? FPS : 1;
const started = Date.now();
let written = 0;
for (let f = 0; f < total; f += step) {
  const t = sheetOnly ? f / FPS + 0.5 : f / FPS; // sheet samples mid-second
  const b64 = await page.evaluate(t => { window.render(t); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, t);
  writeFileSync(join(framesDir, `f${String(written).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
  written++;
}
await browser.close();
console.log(`rendered ${written} frames in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const run = args => execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

if (sheetOnly) {
  // 30 frames (t = 0.5s, 1.5s, ...) tiled 6x5, left-to-right, for visual QA
  run(['-framerate', '1', '-i', join(framesDir, 'f%04d.png'),
    '-vf', 'scale=320:320,tile=6x5:padding=4:color=white',
    '-frames:v', '1', join(here, 'contact-sheet.png')]);
  console.log('wrote contact-sheet.png');
} else {
  run(['-framerate', String(FPS), '-i', join(framesDir, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    join(here, 'negroni.mp4')]);
  run(['-i', join(here, 'negroni.mp4'),
    '-vf', 'select=not(mod(n\\,30)),scale=320:320,tile=6x5:padding=4:color=white',
    '-frames:v', '1', '-fps_mode', 'vfr', join(here, 'contact-sheet.png')]);
  console.log('wrote negroni.mp4 + contact-sheet.png');
}
rmSync(framesDir, { recursive: true, force: true });
