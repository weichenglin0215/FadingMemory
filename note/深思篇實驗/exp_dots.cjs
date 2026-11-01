// 實驗 4：點格子（3x3 格，24 條邊）能不能「完全解開」？
// 能完全解開 = 電腦可以給「必勝殘局」並保證玩家最優解存在；也能用「失誤率」調難度。
const BW = 3, BH = 3; // 格數
// 邊編號：橫邊 (BH+1) 列 x BW 條，直邊 BH 列 x (BW+1) 條
const hIdx = (r, c) => r * BW + c;                 // r:0..BH, c:0..BW-1
const vIdx = (r, c) => (BH + 1) * BW + r * (BW + 1) + c; // r:0..BH-1, c:0..BW
const E = (BH + 1) * BW + BH * (BW + 1);
console.log('邊數', E);
const boxMask = []; // 每個格子的 4 條邊
for (let r = 0; r < BH; r++) for (let c = 0; c < BW; c++) {
  boxMask.push((1 << hIdx(r, c)) | (1 << hIdx(r + 1, c)) | (1 << vIdx(r, c)) | (1 << vIdx(r, c + 1)));
}
// 每條邊相鄰的格子
const edgeBoxes = []; for (let e = 0; e < E; e++) edgeBoxes.push([]);
boxMask.forEach((m, b) => { for (let e = 0; e < E; e++) if (m & (1 << e)) edgeBoxes[e].push(b); });

const FULL = (1 << E) - 1;
const memo = new Int8Array(1 << E).fill(-128);
let visited = 0;
// 回傳：輪到的人，從此局面到結束，自己領先對方的格數（最佳下法）
function V(state) {
  if (state === FULL) return 0;
  const m = memo[state]; if (m !== -128) return m;
  visited++;
  let best = -100;
  for (let e = 0; e < E; e++) {
    if (state & (1 << e)) continue;
    const ns = state | (1 << e);
    let got = 0; for (const b of edgeBoxes[e]) if ((ns & boxMask[b]) === boxMask[b]) got++;
    const v = got > 0 ? got + V(ns) : -V(ns);
    if (v > best) best = v;
  }
  memo[state] = best; return best;
}
const t0 = Date.now();
const r = V(0);
console.log('3x3 格點格子：雙方都完美下，先手淨勝 ' + r + ' 格（負數代表先手輸）  用時 ' + (Date.now() - t0) + 'ms，算過 ' + visited + ' 個局面');
// 統計：隨機走到「已畫 k 條邊」的局面，輪到的人有必勝(>0)的比例
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rand = rnd(7);
for (const k of [8, 10, 12]) { // 沒有任何格子被畫到第三條邊時，最多只能畫約 12 條邊，更多會抽不到
  let win = 0, N = 400, used = 0, attempts = 0;
  while (used < N && attempts++ < 200000) {
    let st = 0, n = 0, ok = true;
    // 隨機畫 k 條邊，但避免提早出現可吃的格子（模擬雙方都謹慎的前半盤）
    let guard = 0;
    while (n < k && guard++ < 500) {
      const e = Math.floor(rand() * E); if (st & (1 << e)) continue;
      const ns = st | (1 << e); let third = false;
      for (const b of edgeBoxes[e]) { const left = boxMask[b] & ~ns; if ((left & (left - 1)) === 0) third = true; }
      if (third) continue; st = ns; n++;
    }
    if (n < k) continue; used++;
    if (V(st) > 0) win++;
  }
  console.log('已畫 ' + k + ' 邊（沒有人被送吃）的局面：輪到的人能領先的比例 ' + (win / N * 100).toFixed(0) + '%');
}
