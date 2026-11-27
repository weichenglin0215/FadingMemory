// 讀劇本（tools/video/scripts/<遊戲>.json）並檢查有沒有寫錯，錯誤用中文說明哪一段、哪一個欄位。
import fs from 'node:fs';

const TYPES = ['play', 'wrongDrag', 'title', 'solve', 'ponder', 'tapOrder'];
// 「看完才動手」的段落：錄影長度由遊戲決定，合成時前面看的部分可以快轉，最後作答／猶豫維持原速
export const WATCH_TYPES = ['solve', 'ponder'];
const WATCH_CAP_SEC = 90;                        // 這種段落最多錄幾秒
const KNOWN = {
  top: ['game', 'name', 'output', 'seed', 'sound', 'finger', 'gameOptions', 'segments'],
  play: ['id', 'type', 'seconds', 'level', 'pickCells', 'dragSecPerCell', 'pauseSec', 'recordSeconds', 'clipStart', 'speed', 'zoom', 'bigGainText', 'caption'],
  wrongDrag: ['id', 'type', 'seconds', 'level', 'pathCells', 'backCells', 'dragSecPerCell', 'pauseSec', 'releaseAtEnd', 'recordSeconds', 'clipStart', 'speed', 'zoom', 'caption'],
  title: ['id', 'type', 'seconds', 'title', 'subtitle', 'background', 'caption'],
  solve: ['id', 'type', 'seconds', 'level', 'watchSpeed', 'introSec', 'thinkBeforeSec', 'tapGapSec', 'holdSec', 'zoom', 'caption'],
  ponder: ['id', 'type', 'seconds', 'level', 'watchSpeed', 'introSec', 'thinkSec', 'zoom', 'caption'],
  tapOrder: ['id', 'type', 'seconds', 'thinkSec', 'tapGapSec', 'maxTaps', 'zoom', 'caption']
};

const isNum = v => typeof v === 'number' && isFinite(v);
const isRange = (v, lo, hi) => Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] >= lo && v[1] <= hi && v[0] <= v[1];
const isRamp = v => (isNum(v) && v >= 0) || (Array.isArray(v) && v.length === 2 && v.every(x => isNum(x) && x >= 0));

export function loadScript(file) {
  if (!fs.existsSync(file)) throw new Error('找不到劇本：' + file);
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  let s;
  try { s = JSON.parse(text); }
  catch (e) {
    const m = /position (\d+)/.exec(e.message);
    const line = m ? text.slice(0, Number(m[1])).split('\n').length : null;
    throw new Error('劇本的 JSON 格式寫錯了' + (line ? '（大約在第 ' + line + ' 行；常見原因：少了逗號、多了逗號、引號沒有成對）' : '') + '\n  ' + e.message);
  }
  return s;
}

export function checkScript(s, gameId) {
  const bad = [], warn = [];
  const need = (ok, msg) => { if (!ok) bad.push(msg); };
  const extra = (obj, known, where) => Object.keys(obj).filter(k => !k.startsWith('_') && !known.includes(k)).forEach(k => warn.push(where + '有不認得的欄位「' + k + '」（打錯字了嗎？工具不會理它）'));
  extra(s, KNOWN.top, '劇本最外層');
  need(s.game === gameId, '「game」要寫 "' + gameId + '"（跟檔名一樣）');
  need(s.output && isNum(s.output.width) && isNum(s.output.height) && isNum(s.output.fps), '「output」要有 width、height、fps 三個數字');
  if (s.output) {
    need(s.output.height > s.output.width, '這個試錄版只支援直式（height 要比 width 大）');
    need(s.output.height / s.output.width >= 1.7, '直式的高度至少要是寬度的 1.7 倍，不然遊戲畫面放不下');
    need(s.output.fps >= 10 && s.output.fps <= 60, '「fps」要在 10～60 之間');
    need(s.output.width % 2 === 0 && s.output.height % 2 === 0, '寬、高要是偶數');
  }
  need(isNum(s.seed), '「seed」要是數字');
  need(Array.isArray(s.segments) && s.segments.length > 0, '「segments」至少要有一段');
  const ids = new Set();
  (s.segments || []).forEach((g, i) => {
    const w = '第 ' + (i + 1) + ' 段（' + (g.id || '沒有 id') + '）';
    need(typeof g.id === 'string' && /^[A-Za-z0-9_-]+$/.test(g.id), w + '「id」只能用英文、數字、底線');
    need(!ids.has(g.id), w + '「id」跟別段重複');
    ids.add(g.id);
    if (!TYPES.includes(g.type)) { bad.push(w + '「type」要是 ' + TYPES.join('、') + ' 其中一個'); return; }
    extra(g, KNOWN[g.type], w);
    need(isNum(g.seconds) && g.seconds > 0, w + '「seconds」要是大於 0 的數字');
    if (g.caption) {
      need(typeof g.caption.text === 'string' && (g.caption.positionY === undefined || (isNum(g.caption.positionY) && g.caption.positionY >= 0 && g.caption.positionY <= 1)), w + '「caption」要有 text；positionY 要在 0～1');
      need(g.caption.startSec === undefined || g.caption.startSec === 'think' || (isNum(g.caption.startSec) && g.caption.startSec >= 0), w + '字幕的「startSec」要是 0 以上的數字，或 "think"（開始猶豫時才出現）');
    }
    if (g.type === 'title') { need(typeof g.title === 'string', w + '要有「title」文字'); return; }
    if (g.zoom !== undefined) need(Array.isArray(g.zoom) && g.zoom.length === 2 && g.zoom.every(z => isNum(z) && z >= 1 && z <= 3), w + '「zoom」要是 [開頭, 結尾]，每個在 1～3');
    if (g.type !== 'tapOrder') need(Number.isInteger(g.level) && g.level >= 1 && g.level <= 90, w + '「level」要是 1～90 的整數');
    if (g.type === 'ponder' || g.type === 'tapOrder') need(isNum(g.thinkSec) && g.thinkSec >= 0.5 && g.thinkSec <= g.seconds - 1, w + '「thinkSec」（最後徘徊幾秒）要在 0.5 到 seconds − 1 之間');
    if (WATCH_TYPES.includes(g.type)) {
      need(g.watchSpeed === undefined || g.watchSpeed === 'fit' || (isNum(g.watchSpeed) && g.watchSpeed >= 0.5 && g.watchSpeed <= 8), w + '「watchSpeed」要是 "fit" 或 0.5～8');
      if (g.introSec !== undefined) need(isNum(g.introSec) && g.introSec > 0 && g.introSec < g.seconds, w + '「introSec」要大於 0、小於 seconds');
      if (g.thinkBeforeSec !== undefined) need(isNum(g.thinkBeforeSec) && g.thinkBeforeSec >= 0, w + '「thinkBeforeSec」要是 0 以上的數字');
      if (g.tapGapSec !== undefined) need(isNum(g.tapGapSec) && g.tapGapSec >= 0, w + '「tapGapSec」要是 0 以上的數字');
      if (g.holdSec !== undefined) need(isNum(g.holdSec) && g.holdSec >= 0 && g.holdSec <= 1.2, w + '「holdSec」要在 0～1.2（再久遊戲就跳到下一關了）');
      return;
    }
    if (g.type === 'tapOrder') {
      need(isRamp(g.tapGapSec), w + '「tapGapSec」要是數字或 [開頭, 結尾]');
      if (g.maxTaps !== undefined) need(Number.isInteger(g.maxTaps) && g.maxTaps >= 1, w + '「maxTaps」要是 1 以上的整數');
      return;
    }
    need(isRamp(g.dragSecPerCell), w + '「dragSecPerCell」要是數字或 [開頭, 結尾]');
    if (g.pauseSec !== undefined) need(isRamp(g.pauseSec), w + '「pauseSec」要是數字或 [開頭, 結尾]');
    if (g.speed !== undefined) need(isNum(g.speed) && g.speed >= 0.25 && g.speed <= 4, w + '「speed」要在 0.25～4');
    if (g.clipStart !== undefined) need(g.clipStart === 'auto' || (isNum(g.clipStart) && g.clipStart >= 0), w + '「clipStart」要是 "auto" 或 0 以上的數字');
    if (g.recordSeconds !== undefined) need(isNum(g.recordSeconds) && g.recordSeconds >= g.seconds * (g.speed || 1) + (isNum(g.clipStart) ? g.clipStart : 0), w + '「recordSeconds」不能比 seconds × speed 短（clipStart 填數字的話還要加上它）');
    if (g.type === 'play') need(isRange(g.pickCells, 2, 40), w + '「pickCells」要是 [最少, 最多]，在 2～40 之間');
    if (g.type === 'wrongDrag') {
      need(isRange(g.pathCells, 2, 40), w + '「pathCells」要是 [最少, 最多]，在 2～40 之間');
      need(isRange(g.backCells, 1, 39), w + '「backCells」要是 [最少, 最多]，在 1～39 之間');
    }
  });
  if (bad.length) throw new Error('劇本有 ' + bad.length + ' 個地方要改：\n  ・' + bad.join('\n  ・') + warn.map(x => '\n  （提醒）' + x).join(''));
  return warn;
}

// 這一段要錄幾張原始畫面（沒有寫 recordSeconds 就多錄半秒，讓之後微調 seconds 還夠用）
export function framesNeeded(script, seg) {
  if (WATCH_TYPES.includes(seg.type)) return WATCH_CAP_SEC * script.output.fps;
  const sec = seg.recordSeconds !== undefined ? seg.recordSeconds : seg.seconds * (seg.speed || 1) + (isNum(seg.clipStart) ? seg.clipStart : 0) + 0.5;
  return Math.ceil(sec * script.output.fps);
}

// 「改了就必須重錄」的欄位。合成時拿它跟錄影當時比對
export function recordKey(script, seg) {
  const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k] === undefined ? null : o[k]]));
  // 新段落種類才加這些欄位（舊劇本的比對字串不變，不用為此重錄）
  const more = WATCH_TYPES.includes(seg.type) || seg.type === 'tapOrder'
    ? { ...pick(seg, ['thinkBeforeSec', 'tapGapSec', 'holdSec', 'thinkSec', 'maxTaps']), length: seg.type === 'tapOrder' ? seg.seconds : null } : {};
  return JSON.stringify({
    ...more,
    ...pick(script, ['game', 'seed', 'output', 'finger', 'gameOptions']),
    ...pick(seg, ['type', 'level', 'pickCells', 'dragSecPerCell', 'pauseSec', 'pathCells', 'backCells', 'releaseAtEnd']),
    releaseTime: seg.releaseAtEnd ? seg.seconds * (seg.speed || 1) : null
  }, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([n]) => !n.startsWith('_'))) : v);
}
