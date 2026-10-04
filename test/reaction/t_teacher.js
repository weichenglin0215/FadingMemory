const { game } = require('./load.js');
const G = game('reaction_teacher.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線（線性）
ok(near(T.pSay(1), 0.7) && near(T.pSay(T.RAMP_N), 0.5) && near(T.limitFor(1), 2.5) && near(T.limitFor(T.RAMP_N), 0.9) && near(T.limitFor(99), 0.9), 'ramps');
ok(near(T.limitFor(16) - T.limitFor(15), T.limitFor(2) - T.limitFor(1), 1e-9), 'limit is linear');
// 答案
const c = (say, dir, opposite) => ({ say, dir, opposite });
ok(T.expectedAction(c(true, 'left', false)) === 'left' && T.expectedAction(c(true, 'left', true)) === 'right' && T.expectedAction(c(true, 'up', true)) === 'down' && T.expectedAction(c(false, 'left', false)) === null && T.expectedAction(c(false, 'up', true)) === null, 'expectedAction');
ok(T.textOf(c(true, 'left', false)).prefix === '老師說' && T.textOf(c(true, 'left', false)).action === '點左邊' && T.textOf(c(false, 'up', true)).prefix === '' && T.textOf(c(false, 'up', true)).action === '點相反的上面', 'text');
// 大量產生：比例、連續沒說上限、開頭、不重複、相反指令解鎖點
let sayCount = [0, 0], tot = [0, 0], maxNoSay = 0, openBad = 0, repeats = 0, oppEarly = 0, oppLate = 0, lateTot = 0, wrongAns = 0;
for (let g = 0; g < 4000; g++) {
  const hist = []; let run = 0;
  for (let i = 1; i <= 40; i++) {
    const cmd = T.makeCommand(i, hist);
    if (hist.length && T.sameCmd(cmd, hist[hist.length - 1])) repeats++;
    if (i === 2 && !hist[0].say && !cmd.say) openBad++;
    run = cmd.say ? 0 : run + 1; maxNoSay = Math.max(maxNoSay, run);
    if (cmd.opposite && i < T.OPPOSITE_FROM) oppEarly++;
    if (i >= T.OPPOSITE_FROM) { lateTot++; if (cmd.opposite) oppLate++; }
    const k = i <= 15 ? 0 : 1; tot[k]++; if (cmd.say) sayCount[k]++;
    const ex = T.expectedAction(cmd); if (cmd.say !== (ex !== null)) wrongAns++;
    hist.push(cmd);
  }
}
ok(repeats === 0, 'no identical consecutive commands (' + repeats + ')');
ok(openBad === 0, 'the first two commands are never both without 老師說');
ok(maxNoSay <= T.NO_SAY_RUN_MAX, 'no-say run ≤ ' + T.NO_SAY_RUN_MAX + ' (got ' + maxNoSay + ')');
ok(oppEarly === 0 && oppLate / lateTot > 0.25 && oppLate / lateTot < 0.45, 'opposite only from the unlock point (late ' + (oppLate / lateTot).toFixed(3) + ')');
ok(sayCount[0] / tot[0] > 0.55 && sayCount[1] / tot[1] > 0.45 && sayCount[0] / tot[0] > sayCount[1] / tot[1], 'say ratio falls: ' + (sayCount[0] / tot[0]).toFixed(3) + ' -> ' + (sayCount[1] / tot[1]).toFixed(3));
ok(sayCount[1] / tot[1] >= 0.5 - 0.02, 'say ratio never below 50% in the late part');
ok(wrongAns === 0, 'say ↔ has an expected action');
// 說明文字
ok(T.why(c(false, 'left', false), 'nosay').indexOf('沒有「老師說」') >= 0 && T.why(c(true, 'left', true), 'wrong', 'left').indexOf('所以要點右邊') >= 0 && T.why(c(true, 'up', false), 'wrong', 'down').indexOf('你點了下面') >= 0, 'explanations');
ok(T.rating(3) !== T.rating(10) && T.rating(10) !== T.rating(25) && T.rating(25) !== T.rating(45), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
