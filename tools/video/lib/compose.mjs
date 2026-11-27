// 合成：把各段原始畫面照劇本剪接、加上字幕／片頭／推近／大字分數，配上聲音，用 ffmpeg 做成 MP4。
//   這一步不會重新玩遊戲，所以只改字幕、剪接點之類的時候很快。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { openBrowser, setViewport } from './browser.mjs';
import { startServer } from './server.mjs';
import { framesNeeded, recordKey, WATCH_TYPES } from './script.mjs';

const GAIN_SEC = 0.75;                            // 大字分數停留幾秒

export function loadMeta(rawDir, id) {
  const f = path.join(rawDir, id, 'meta.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

// 檢查原始畫面能不能直接用；不能用就回傳原因
export function staleReason(script, seg, meta) {
  if (!meta) return '還沒錄過';
  if (meta.recordKey !== recordKey(script, seg)) return '錄影之後改過「需要重錄」的欄位';
  if (WATCH_TYPES.includes(seg.type)) return meta.marks && meta.marks.ready !== undefined ? null : '還沒錄過';
  const need = seg.seconds * (seg.speed || 1) + (typeof seg.clipStart === 'number' ? seg.clipStart : 0);
  if (Math.ceil(need * script.output.fps - 1e-6) > meta.frames) return '原始畫面只有 ' + (meta.frames / meta.fps).toFixed(1) + ' 秒，不夠剪 ' + need.toFixed(1) + ' 秒（要錄 ' + (framesNeeded(script, seg) / script.output.fps).toFixed(1) + ' 秒）';
  return null;
}

// clipStart：從原始畫面第幾秒開始剪
export function clipStartOf(seg, meta) {
  const len = meta.frames / meta.fps, use = seg.seconds * (seg.speed || 1), last = Math.max(0, len - use);
  if (seg.clipStart === 'auto') {
    // 得分最高（同分比格數、再比誰比較後面）的那一串：放開手指的時間點放在片段稍微過半的地方。
    //   優先挑「前面夠長」的，片段一開始手指就在動，不會從靜止的開局盤面開始
    const roomy = meta.gains.filter(g => g.t >= use * 0.55 + 0.5 && g.t <= len - use * 0.45);
    const best = (roomy.length ? roomy : meta.gains).reduce((a, g) => (!a || g.gain > a.gain || (g.gain === a.gain && g.cells >= a.cells) ? g : a), null);
    return best ? Math.min(last, Math.max(0, best.t - use * 0.55)) : 0;
  }
  return Math.min(last, seg.clipStart || 0);
}

// 一段的「時間對照」：src(成品第幾秒) → 原始畫面第幾秒；out(原始第幾秒) → 成品第幾秒（剪掉的回傳 null）
//   看完才動手的段落分兩截：前面「看」（亮出球／星星、移動）照 speed 播，最後「作答或猶豫」固定原速。
//   watchSpeed "fit"＝從頭看起，自動快轉到剛好塞得下；填數字＝照那個倍速，只放得下「開始作答前」的最後一段
export function timeMap(seg, meta) {
  if (WATCH_TYPES.includes(seg.type)) {
    const ready = meta.marks.ready, want = seg.type === 'ponder' ? seg.thinkSec : meta.marks.end - ready;
    const tail = Math.max(0, Math.min(want, seg.seconds - 0.5)), head = seg.seconds - tail;
    const fit = seg.watchSpeed === undefined || seg.watchSpeed === 'fit';
    let speed = fit ? ready / head : seg.watchSpeed;
    let from = ready - head * speed;
    if (from < 0) { from = 0; speed = ready / head; }
    // 「看」的部分切成兩段：[from, knee] 播 intro 秒、[knee, ready] 播剩下的時間。沒有指定 introSec 就是同一個速度（兩段斜率一樣）
    let knee = from + (ready - from) / 2, intro = head / 2;
    const move = meta.marks.move;
    if (fit && seg.introSec !== undefined && move !== undefined && move > 0.05) { knee = move; intro = Math.min(seg.introSec, head - 0.3); }
    const introSpeed = (knee - from) / intro, moveSpeed = (ready - knee) / (head - intro);
    return {
      from, speed: moveSpeed, introSpeed, intro, head, tail, ready, cut: want - tail > 0.05, think: head,
      src: tau => (tau < intro ? from + tau * introSpeed : tau < head ? knee + (tau - intro) * moveSpeed : ready + (tau - head)),
      out: t => (t < from - 1e-6 ? null : t < knee ? (t - from) / introSpeed : t < ready ? intro + (t - knee) / moveSpeed : (t - ready < tail - 1e-6 ? head + (t - ready) : null))
    };
  }
  const clip = clipStartOf(seg, meta), speed = seg.speed || 1;
  return {
    from: clip, speed, think: seg.thinkSec !== undefined ? seg.seconds - seg.thinkSec : null,
    src: tau => clip + tau * speed,
    out: t => (t >= clip - 1e-6 && t < clip + seg.seconds * speed - 1e-6 ? (t - clip) / speed : null)
  };
}

// 算出成品每一格要畫什麼，以及聲音事件。scale：輸出大小相對於劇本 output 的倍率（即時預覽是 0.5）
export function buildPlan(script, metas, scale = 1) {
  const fps = script.output.fps, plan = [], audio = [], info = [];
  let startFrame = 0, acc = 0;
  const srcOf = (id, frame) => '/__raw/' + id + '/' + String(frame).padStart(5, '0') + '.jpg';
  const frameAt = (meta, sec) => Math.max(0, Math.min(meta.frames - 1, Math.round(sec * fps)));
  const playable = i => script.segments[i] && script.segments[i].type !== 'title';

  script.segments.forEach((seg, i) => {
    acc += seg.seconds;
    const count = Math.round(acc * fps) - startFrame, t0 = startFrame / fps;
    const map = seg.type === 'title' ? null : timeMap(seg, metas[seg.id]);
    const caption = tau => {
      const c = seg.caption;
      if (!c) return [];
      const start = c.startSec === 'think' ? ((map && map.think) || 0) : (c.startSec || 0);
      if (tau < start - 1e-6) return [];
      return [{ kind: 'caption', text: c.text, size: c.size || 80, positionY: c.positionY === undefined ? 0.065 : c.positionY, appear: Math.min(1, Math.max(0, tau - start) / 0.22) }];
    };
    if (seg.type === 'title') {
      // 背景：下一段的第一個畫面；後面沒有就用前一段的最後畫面
      let bg = null;
      const next = script.segments.findIndex((s, j) => j > i && playable(j));
      if (next >= 0) { const s = script.segments[next], m = metas[s.id]; bg = srcOf(s.id, frameAt(m, timeMap(s, m).src(0))); }
      else for (let j = i - 1; j >= 0 && !bg; j--) if (playable(j)) { const s = script.segments[j], m = metas[s.id]; bg = srcOf(s.id, frameAt(m, timeMap(s, m).src(s.seconds))); }
      for (let k = 0; k < count; k++) {
        const tau = k / fps;
        plan.push({ src: seg.background === 'blur' ? bg : null, blur: seg.background === 'blur' ? 16 : 0, layers: [{ kind: 'title', title: seg.title, subtitle: seg.subtitle, p: Math.min(1, tau / 0.25) }, ...caption(tau)] });
      }
      info.push({ id: seg.id, at: t0, seconds: count / fps });
    } else {
      const meta = metas[seg.id], speed = map.speed, clip = map.from;
      // 大字分數：成品時間軸上的出現時刻
      const pops = seg.bigGainText ? meta.gains.map(g => ({ at: (g.t - clip) / speed, value: g.gain })).filter(p => p.at >= -0.1 && p.at < seg.seconds) : [];
      for (let k = 0; k < count; k++) {
        const tau = k / fps, p = count > 1 ? k / (count - 1) : 0;
        const zoom = seg.zoom ? seg.zoom[0] + (seg.zoom[1] - seg.zoom[0]) * (p * p * (3 - 2 * p)) : 1;
        const layers = [];
        const pop = pops.filter(q => tau >= q.at && tau < q.at + GAIN_SEC).pop();   // 同時只顯示最新的一個
        if (pop) layers.push({ kind: 'gain', value: pop.value, p: (tau - pop.at) / GAIN_SEC, y: (meta.board.cy - meta.board.height * 0.12) * scale });
        layers.push(...caption(tau));
        plan.push({ src: srcOf(seg.id, frameAt(meta, map.src(tau))), zoom, focus: { x: meta.board.cx * scale, y: meta.board.cy * scale }, layers });
      }
      const dur = count / fps;
      meta.sounds.forEach(e => { const at = map.out(e.t); if (at !== null && at < dur) audio.push({ t: t0 + at, name: e.name }); });
      info.push({ id: seg.id, at: t0, seconds: dur, clipStart: clip, speed, watch: WATCH_TYPES.includes(seg.type) ? { tail: map.tail, ready: map.ready, cut: map.cut, intro: map.intro, introSpeed: map.introSpeed } : null });
    }
    startFrame += count;
  });
  if (script.sound && script.sound.gameSfx === false) audio.length = 0;
  return { plan, audio, info, total: startFrame / fps };
}

function readBody(req) {
  return new Promise((res, rej) => { const parts = []; req.on('data', d => parts.push(d)); req.on('end', () => res(Buffer.concat(parts))); req.on('error', rej); });
}

// preview＝true：即時預覽版——輸出一半大小、編碼求快（畫質差一點沒關係）
export async function compose(root, script, rawDir, outFile, preview = false) {
  const metas = {};
  for (const seg of script.segments) if (seg.type !== 'title') metas[seg.id] = loadMeta(rawDir, seg.id);
  const { fps } = script.output;
  const width = preview ? Math.round(script.output.width / 4) * 2 : script.output.width;
  const height = preview ? Math.round(script.output.height / 4) * 2 : script.output.height;
  const { plan, audio, info, total } = buildPlan(script, metas, width / script.output.width);
  const wav = path.join(rawDir, 'audio.wav');

  let ffmpeg = null, ffErr = '';
  const server = await startServer(root, [
    { prefix: '/__raw/', handle: (req, res, rest) => {
      const m = /^([A-Za-z0-9_-]+)\/(\d{5}\.jpg)$/.exec(rest);
      if (!m) { res.writeHead(404); return res.end(); }
      fs.readFile(path.join(rawDir, m[1], m[2]), (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': 'image/jpeg' }); res.end(err ? '' : data); });
    } },
    { prefix: '/__audio', handle: async (req, res) => { fs.writeFileSync(wav, await readBody(req)); res.writeHead(200); res.end('ok'); } },
    { prefix: '/__out', handle: async (req, res) => {
      const body = Buffer.from((await readBody(req)).toString('latin1'), 'base64');   // 頁面送來的是 base64 文字
      if (!ffmpeg || ffmpeg.exitCode !== null) { res.writeHead(500); return res.end(); }
      const done = () => { res.writeHead(200); res.end('ok'); };
      if (ffmpeg.stdin.write(body)) done(); else ffmpeg.stdin.once('drain', done);
    } }
  ]);
  const b = await openBrowser();
  try {
    await setViewport(b, width, height, 1);
    await b.send('Page.navigate', { url: server.url + '/tools/video/lib/compose.html' });
    for (let i = 0; i < 200; i++) { if (await b.evalJs('!!window.composeInit').catch(() => false)) break; await new Promise(r => setTimeout(r, 50)); }
    const allText = script.segments.map(s => (s.title || '') + (s.subtitle || '') + ((s.caption && s.caption.text) || '')).join('') || '字';
    await b.evalJs(`composeInit(${width}, ${height}, ${JSON.stringify(allText)})`);
    await b.evalJs(`renderAudio(${JSON.stringify(audio)}, ${total})`);

    // 配樂（可省略）
    const sound = script.sound || {}, music = sound.musicFile ? path.resolve(root, sound.musicFile) : '';
    if (music && !fs.existsSync(music)) throw new Error('找不到配樂檔案：' + music);
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-i', wav];
    // 瀏覽器給的 JPEG 是「全範圍、BT.601」，影片平台預期「有限範圍、BT.709」：轉換一下，顏色才不會跑掉
    let filter = `[0:v]scale=in_range=full:out_range=limited:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p[v]`;
    if (music) {
      args.push('-stream_loop', '-1', '-i', music);
      const vol = sound.musicVolume === undefined ? 0.3 : sound.musicVolume;
      filter += `;[2:a]volume=${vol},atrim=0:${total},afade=t=out:st=${Math.max(0, total - 0.8)}:d=0.8[m];[1:a][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`;
    }
    args.push('-filter_complex', filter, '-map', '[v]', '-map', music ? '[a]' : '1:a', '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '23' : '18',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), '-movflags', '+faststart', outFile);
    ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    ffmpeg.stderr.on('data', d => { ffErr += d; });
    ffmpeg.stdin.on('error', () => { });
    const finished = new Promise((res, rej) => { ffmpeg.on('error', rej); ffmpeg.on('close', code => code === 0 ? res() : rej(new Error('ffmpeg 失敗：' + ffErr.slice(-800)))); });
    finished.catch(() => { });

    for (let i = 0; i < plan.length; i++) {
      await b.evalJs(`composeFrame(${JSON.stringify(plan[i])})`);
      if (i % 30 === 29 || i === plan.length - 1) process.stdout.write('\r  合成中 ' + (i + 1) + '／' + plan.length + ' 張');
    }
    process.stdout.write('\n');
    ffmpeg.stdin.end();
    await finished;
  } finally { b.close(); server.close(); }
  return { info, audio, total, frames: plan.length };
}

// 成品檢查：用 ffprobe 讀回實際的大小、格數、長度、有沒有聲音
export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffprobe 讀不到成品：' + r.stderr);
  return JSON.parse(r.stdout);
}
