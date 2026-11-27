// 宣傳影片錄影工具。在專案根目錄執行：
//   node tools/video/record.mjs sumten                     整支重錄＋合成
//   node tools/video/record.mjs sumten --only challenge    只重錄某一段（多段用逗號隔開），然後合成
//   node tools/video/record.mjs sumten --compose           不重錄，只用現有的原始畫面重新合成
//   上面三種都可以加 --live：即時錄影（快速預覽：畫面較糊、輸出一半大小）。不加＝逐格截圖（正式成品）。
//   兩種的原始畫面分開放（raw_live／raw），互不影響。
// 劇本：tools/video/scripts/<遊戲>.json；成品與原始畫面：tools/video/out/<遊戲>/（說明見 tools/video/README.md）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openBrowser } from './lib/browser.mjs';
import { startServer } from './lib/server.mjs';
import { loadScript, checkScript, framesNeeded, recordKey, WATCH_TYPES } from './lib/script.mjs';
import { prepareBrowser, recordSegment } from './lib/recorder.mjs';
import { compose, loadMeta, staleReason, probe } from './lib/compose.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

function parseArgs(argv) {
  const o = { game: null, only: null, composeOnly: false, live: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--compose') o.composeOnly = true;
    else if (a === '--live') o.live = true;
    else if (a === '--only') o.only = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a.startsWith('--')) throw new Error('不認得的選項：' + a);
    else if (!o.game) o.game = a;
    else throw new Error('多給了一個參數：' + a);
  }
  if (!o.game || !/^[a-z0-9]+$/.test(o.game)) throw new Error('用法：node tools/video/record.mjs <遊戲代號> [--live] [--only 段落代號] [--compose]\n  例如：node tools/video/record.mjs sumten --live');
  if (o.composeOnly && o.only) throw new Error('--only（重錄某一段）跟 --compose（不重錄）不能一起用');
  if (o.only && !o.only.length) throw new Error('--only 後面要接段落代號');
  return o;
}

function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const script = loadScript(path.join(HERE, 'scripts', args.game + '.json'));
  checkScript(script, args.game).forEach(w => console.log('提醒：' + w));
  for (const tool of ['ffmpeg', 'ffprobe']) if (spawnSync(tool, ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('找不到 ' + tool + '（要裝好並加到 PATH）');

  const started = Date.now(), flag = args.live ? ' --live' : '';
  const outDir = path.join(HERE, 'out', args.game), rawDir = path.join(outDir, args.live ? 'raw_live' : 'raw');
  console.log(args.live ? '模式：即時錄影（快速預覽）' : '模式：逐格截圖（正式成品；想快速試內容可以加 --live）');
  fs.mkdirSync(rawDir, { recursive: true });
  const playable = script.segments.filter(s => s.type !== 'title');
  if (args.only) for (const id of args.only) if (!playable.some(s => s.id === id)) throw new Error('沒有可以重錄的段落「' + id + '」。可以用的代號：' + playable.map(s => s.id).join('、') + '（片頭不用錄，改完用 --compose）');
  const toRecord = args.composeOnly ? [] : playable.filter(s => !args.only || args.only.includes(s.id));

  // 沒有要重錄的段落，原始畫面必須還能用——先檢查，免得錄了半天才發現不能合成
  const stale = playable.filter(s => !toRecord.includes(s)).map(s => ({ s, why: staleReason(script, s, loadMeta(rawDir, s.id)) })).filter(x => x.why);
  if (stale.length) throw new Error('下面這幾段要重錄：\n' + stale.map(x => '  ・' + x.s.id + '：' + x.why).join('\n') + '\n請執行：node tools/video/record.mjs ' + args.game + flag + ' --only ' + stale.map(x => x.s.id).join(','));

  const outsideHosts = [];
  if (toRecord.length) {
    const driverFile = path.join(HERE, 'lib', 'games', args.game + '.mjs');
    if (!fs.existsSync(driverFile)) throw new Error('這款遊戲還沒有自動玩家（' + driverFile + '）');
    const driver = (await import(pathToFileURL(driverFile).href)).default;
    const unsupported = toRecord.find(s => typeof driver[s.type] !== 'function');
    if (unsupported) throw new Error('「' + (script.name || args.game) + '」的自動玩家不支援段落種類 "' + unsupported.type + '"（' + unsupported.id + '）');
    const server = await startServer(ROOT);
    const b = await openBrowser();
    try {
      await prepareBrowser(b, ROOT, script.output);
      for (const seg of toRecord) {
        const frames = framesNeeded(script, seg), t0 = Date.now();
        const what = [seg.level ? '第 ' + seg.level + ' 關' : '', WATCH_TYPES.includes(seg.type) ? '' : (frames / script.output.fps).toFixed(1) + ' 秒'].filter(Boolean).join('，');
        process.stdout.write('錄影 ' + seg.id + '（' + what + '）…');
        const meta = await recordSegment(b, { script, segment: seg, driver, rawDir, baseUrl: server.url, frames, live: args.live });
        meta.recordKey = recordKey(script, seg);
        meta.recordedAt = new Date().toISOString();
        fs.writeFileSync(path.join(rawDir, seg.id, 'meta.json'), JSON.stringify(meta, null, 1));
        const good = meta.moves.filter(m => !m.wrong).length, wrong = meta.moves.length - good;
        const cells = meta.moves.map(m => m.cells);
        console.log(' 完成（花 ' + ((Date.now() - t0) / 1000).toFixed(0) + ' 秒；' + (meta.note ? meta.note + '；原始畫面 ' + (meta.frames / meta.fps).toFixed(1) + ' 秒' : (good ? '成功 ' + good + ' 串' : '故意拖錯 ' + wrong + ' 次')) +
          (cells.length ? '，每串 ' + Math.min(...cells) + '～' + Math.max(...cells) + ' 格' : '') +
          (meta.distinctFrames !== null ? '；收到 ' + meta.distinctFrames + ' 張不同的畫面' : '') + '）');
        if (meta.errors.length) console.log('  警告：遊戲頁面出現錯誤：' + meta.errors[0]);
      }
      outsideHosts.push(...b.outside);
    } finally { b.close(); server.close(); }
  }

  const outFile = path.join(outDir, args.game + (args.live ? '_live_' : '_') + stamp() + '.mp4');
  console.log('合成…');
  const result = await compose(ROOT, script, rawDir, outFile, args.live);

  const p = probe(outFile), v = p.streams.find(s => s.codec_type === 'video'), a = p.streams.find(s => s.codec_type === 'audio');
  console.log('\n成品：' + outFile);
  console.log('  畫面 ' + v.width + '×' + v.height + '、每秒 ' + v.avg_frame_rate.split('/').reduce((x, y) => x / y) + ' 格、' + Number(p.format.duration).toFixed(2) + ' 秒；聲音 ' + (a ? a.codec_name + '（' + result.audio.length + ' 個音效）' : '沒有'));
  result.info.forEach(s => {
    const times = x => Math.round(x * 100) / 100;
    let more = '';
    if (s.watch) more = '（看的部分' + (Math.abs(s.watch.introSpeed - s.speed) > 0.01 ? '：開頭 ' + times(s.watch.intro) + ' 秒 ' + times(s.watch.introSpeed) + ' 倍速、移動 ' : ' ') + times(s.speed) + ' 倍速' + (s.clipStart > 0.05 ? '、從原始第 ' + s.clipStart.toFixed(1) + ' 秒起' : '、從頭看') + '；最後 ' + s.watch.tail.toFixed(1) + ' 秒原速）';
    else if (s.clipStart !== undefined) more = '（原始畫面第 ' + s.clipStart.toFixed(2) + ' 秒起' + (s.speed !== 1 ? '，' + s.speed + ' 倍速' : '') + '）';
    console.log('  ' + s.at.toFixed(2).padStart(5) + ' 秒起 ' + s.id + more);
    if (s.watch && s.speed > 3.5) console.log('        ⚠ 快轉 ' + times(s.speed) + ' 倍，觀眾可能看不清楚：把這段 seconds 加長、level 調低、introSec 調短，或 watchSpeed 改填數字（只看最後一段）');
    if (s.watch && s.watch.cut) console.log('        ⚠ 作答／猶豫比這段還長，最後面被剪掉了：把 seconds 加長');
  });
  if (toRecord.length) console.log('  連到外部網站的次數（字型除外）：' + outsideHosts.length + (outsideHosts.length ? '（都已被瀏覽器擋下：' + [...new Set(outsideHosts)].join('、') + '）' : ''));
  console.log('  總共花了 ' + ((Date.now() - started) / 1000).toFixed(0) + ' 秒');
  if (args.live) console.log('  這是預覽版。內容滿意後，拿掉 --live 再跑一次整支，就是正式成品：node tools/video/record.mjs ' + args.game);
}

main().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
