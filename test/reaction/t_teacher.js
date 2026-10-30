const { game } = require('./load.js');
const G = game('reaction_teacher.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線（線性）
ok(near(T.pSay(1), T.P_SAY_START) && near(T.pSay(T.RAMP_N), T.P_SAY_END) && near(T.limitFor(1), T.TIME_START) && near(T.limitFor(T.RAMP_N), T.TIME_END) && near(T.limitFor(99), T.TIME_END), 'ramps（跟著檔案裡的參數走）');
ok(near(T.limitFor(16) - T.limitFor(15), T.limitFor(2) - T.limitFor(1), 1e-9), 'limit is linear');
// 答案
const c = (say, dir, opposite) => ({ say, dir, opposite });
ok(T.expectedAction(c(true, 'left', false)) === 'left' && T.expectedAction(c(true, 'left', true)) === 'right' && T.expectedAction(c(true, 'up', true)) === 'down' && T.expectedAction(c(false, 'left', false)) === null && T.expectedAction(c(false, 'up', true)) === null, 'expectedAction');
ok(T.textOf(c(true, 'left', false)).prefix === '老師說' && T.textOf(c(true, 'left', false)).action === '點左邊' && T.textOf(c(false, 'up', true)).prefix === '' && T.textOf(c(false, 'up', true)).action === '點上面的相反', 'text（V1.25：「點上面的相反」，不是「點相反的上面」）');
ok(T.textOf(c(true, 'left', true)).action === '點左邊的相反' && !/點相反的/.test(T.textOf(c(true, 'right', true)).action), '相反指令的寫法：點左邊的相反');
// 大量產生：比例、連續沒說上限、開頭、不重複、相反指令解鎖點
let sayCount = [0, 0], tot = [0, 0], maxNoSay = 0, openBad = 0, repeats = 0, oppEarly = 0, oppLate = 0, lateTot = 0, wrongAns = 0;
let dblEarly = 0, dblBadShape = 0, dblWithOpp = 0, dblN = [0, 0], dblTot = [0, 0], dblSay = 0, dblSayN = 0;
for (let g = 0; g < 4000; g++) {
  const hist = []; let run = 0;
  for (let i = 1; i <= 40; i++) {
    const cmd = T.makeCommand(i, hist);
    if (hist.length && T.sameCmd(cmd, hist[hist.length - 1])) repeats++;
    if (i === 2 && !hist[0].say && !cmd.say) openBad++;
    run = cmd.say ? 0 : run + 1; maxNoSay = Math.max(maxNoSay, run);
    if (cmd.opposite && i < T.OPPOSITE_FROM) oppEarly++;
    // 「相反」的比例只看不是「兩個方向」的題目（兩個方向的題不會同時是相反）
    if (i >= T.OPPOSITE_FROM && !T.isDouble(cmd)) { lateTot++; if (cmd.opposite) oppLate++; }
    if (T.isDouble(cmd)) {
      if (i < T.DOUBLE_FROM) dblEarly++;
      if (cmd.opposite) dblWithOpp++;
      if (!cmd.dir2 || cmd.dir2 === cmd.dir || T.DIRS.indexOf(cmd.dir2) < 0) dblBadShape++;
      dblSayN++; if (cmd.say) dblSay++;
    }
    if (i >= T.DOUBLE_FROM) { const k2 = i <= 22 ? 0 : 1; dblTot[k2]++; if (T.isDouble(cmd)) dblN[k2]++; }
    const k = i <= 15 ? 0 : 1; tot[k]++; if (cmd.say) sayCount[k]++;
    const ex = T.expectedAction(cmd); if (cmd.say !== (ex !== null)) wrongAns++;
    hist.push(cmd);
  }
}
ok(repeats === 0, 'no identical consecutive commands (' + repeats + ')');
ok(openBad === 0, 'the first two commands are never both without 老師說');
ok(maxNoSay <= T.NO_SAY_RUN_MAX, 'no-say run ≤ ' + T.NO_SAY_RUN_MAX + ' (got ' + maxNoSay + ')');
ok(oppEarly === 0 && oppLate / lateTot > 0.25 && oppLate / lateTot < 0.45, 'opposite only from the unlock point (late ' + (oppLate / lateTot).toFixed(3) + ')');
// V1.39.0：「同時點兩個方向」只從第 DOUBLE_FROM 題開始、兩個方向不同、不會同時是相反、機率越後面越高、有沒有「老師說」都可能
ok(dblEarly === 0, '同時點兩個方向：第 ' + T.DOUBLE_FROM + ' 題以前不會出現（' + dblEarly + '）');
ok(dblBadShape === 0 && dblWithOpp === 0, '兩個方向一定不同、而且不會同時是「相反」（' + dblBadShape + '／' + dblWithOpp + '）');
ok(dblN[0] / dblTot[0] > 0.2 && dblN[1] / dblTot[1] > dblN[0] / dblTot[0] && dblN[1] / dblTot[1] < 0.5, '同時點兩個方向的比例隨題號上升：' + (dblN[0] / dblTot[0]).toFixed(3) + ' → ' + (dblN[1] / dblTot[1]).toFixed(3));
ok(dblSay / dblSayN > 0.4 && dblSay / dblSayN < 0.8, '兩個方向的題目也有一部分沒說「老師說」（說的比例 ' + (dblSay / dblSayN).toFixed(2) + '）');
ok(sayCount[0] / tot[0] > 0.55 && sayCount[1] / tot[1] > 0.45 && sayCount[0] / tot[0] > sayCount[1] / tot[1], 'say ratio falls: ' + (sayCount[0] / tot[0]).toFixed(3) + ' -> ' + (sayCount[1] / tot[1]).toFixed(3));
ok(sayCount[1] / tot[1] >= 0.5 - 0.02, 'say ratio never below 50% in the late part');
ok(wrongAns === 0, 'say ↔ has an expected action');
// 說明文字
ok(T.why(c(false, 'left', false), 'nosay').indexOf('沒有「老師說」') >= 0 && T.why(c(true, 'left', true), 'wrong', 'left').indexOf('所以要點右邊') >= 0 && T.why(c(true, 'up', false), 'wrong', 'down').indexOf('你點了下面') >= 0, 'explanations');
// 同時點兩個方向：文字、答案、說明、限時、不分先後算同一個指令
{
  const d = (say, a, b) => ({ say, dir: a, dir2: b, opposite: false });
  ok(T.textOf(d(true, 'left', 'up')).action === '點左邊跟上面' && T.textOf(d(true, 'up', 'down')).action === '點上面跟下面' && T.textOf(d(true, 'left', 'up')).prefix === '老師說', '文字：點左邊跟上面／點上面跟下面');
  ok(T.textOf(d(false, 'right', 'down')).prefix === '' && T.textOf(d(false, 'right', 'down')).action === '點右邊跟下面', '沒說老師說的兩個方向');
  const ex = T.expectedAction(d(true, 'left', 'up'));
  ok(Array.isArray(ex) && ex.length === 2 && ex.indexOf('left') >= 0 && ex.indexOf('up') >= 0, '答案是兩個方向的陣列');
  ok(T.expectedAction(d(false, 'left', 'up')) === null, '沒說老師說＝不用點');
  ok(T.sameCmd(d(true, 'left', 'up'), d(true, 'up', 'left')) && !T.sameCmd(d(true, 'left', 'up'), d(true, 'left', 'down')) && !T.sameCmd(d(true, 'left', 'up'), d(false, 'left', 'up')) && !T.sameCmd(d(true, 'left', 'up'), c(true, 'left', false)), '兩個方向不分先後算同一個，跟單一方向的指令不同');
  ok(T.isDouble(d(true, 'left', 'up')) && !T.isDouble(c(true, 'left', false)), 'isDouble');
  ok(T.why(d(true, 'left', 'up'), 'wrong', 'down') === '老師說點左邊跟上面，你點了下面' && T.why(d(true, 'left', 'up'), 'half', 'left').indexOf('兩個都點到') >= 0 && T.why(d(true, 'left', 'up'), 'late').indexOf('來不及') >= 0, '失敗說明（點錯方向／只點到一個／來不及）');
  ok(near(T.limitFor(20, true) - T.limitFor(20), T.DOUBLE_EXTRA_S) && near(T.limitFor(20, false), T.limitFor(20)), '兩個方向的題目限時多 ' + T.DOUBLE_EXTRA_S + ' 秒');
  ok(T.pDouble(T.DOUBLE_FROM - 1) === 0 && near(T.pDouble(T.RAMP_N), T.P_DOUBLE_END) && T.pDouble(T.DOUBLE_FROM) >= T.P_DOUBLE_START - 1e-9, 'pDouble：解鎖點以前是 0，到第 RAMP_N 題是 P_DOUBLE_END');
  // 連續的指令不會完全相同（包含兩個方向的互換）
  let rep = 0; for (let g = 0; g < 2000; g++) { const hist = []; for (let i = 1; i <= 40; i++) { const cmd = T.makeCommand(i, hist); if (hist.length && T.sameCmd(cmd, hist[hist.length - 1])) rep++; hist.push(cmd); } }
  ok(rep === 0, '兩個方向的題目也不會連續相同（' + rep + '）');
}
ok(T.rating(3) !== T.rating(10) && T.rating(10) !== T.rating(25) && T.rating(25) !== T.rating(45), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
