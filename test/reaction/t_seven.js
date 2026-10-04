const { game } = require('./load.js');
const G = game('reaction_seven.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 使用者列的清單：7、14、17、21、27、28、35、37、42、47、56、57、63、67、70～79、84、87、91
const skipSet = [7, 14, 17, 21, 27, 28, 35, 37, 42, 47, 56, 57, 63, 67, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 84, 87, 91];
const gotSkips = []; for (let n = 1; n <= 91; n++) if (T.isSkip(n)) gotSkips.push(n);
for (const n of skipSet) ok(T.isSkip(n), n + ' must be skipped');
// 清單沒寫、但依規則也要跳過的：49（7×7）、97、98（7×14）
ok(T.isSkip(49) && T.isSkip(97) && T.isSkip(98) && T.isSkip(105) && T.isSkip(107) && T.isSkip(170), '49, 97, 98, 105, 107, 170 are skipped too');
// 不用跳過的
for (const n of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 18, 19, 20, 22, 23, 24, 25, 26, 29, 30, 31, 32, 33, 34, 36, 38, 39, 40, 41, 43, 44, 45, 46, 48, 50, 51, 52, 53, 54, 55, 58, 59, 60, 61, 62, 64, 65, 66, 68, 69, 80, 81, 82, 83, 85, 86, 88, 89, 90]) ok(!T.isSkip(n), n + ' is a normal number');
// 1～91 之間要跳過的恰好就是「清單 + 49」
ok(JSON.stringify(gotSkips) === JSON.stringify(skipSet.concat([49]).sort((a, b) => a - b)), 'skips in 1..91 are the user list + 49: ' + gotSkips.join());
// 倒數：線性變快、最後維持
ok(near(T.dwellFor(1), T.DWELL_START) && near(T.dwellFor(T.RAMP_N), T.DWELL_END) && near(T.dwellFor(T.RAMP_N + 40), T.DWELL_END), 'dwell endpoints and clamp');
const d = []; for (let n = 1; n <= T.RAMP_N; n++) d.push(T.dwellFor(n));
let linear = true; for (let i = 2; i < d.length; i++) if (!near(d[i] - d[i - 1], d[1] - d[0], 1e-9)) linear = false;
ok(linear && d[1] < d[0], 'dwell shrinks linearly');
// 說明文字
ok(T.skipReason(14).indexOf('7 的 2 倍') >= 0 && T.skipReason(27).indexOf('有 7') >= 0, 'skip reasons');
ok(T.why(14, 'wrongTap').indexOf('跳過') >= 0 && T.why(8, 'wrongSkip').indexOf('點數字') >= 0 && T.why(8, 'late').indexOf('來不及') >= 0 && T.why(21, 'late').indexOf('跳過') >= 0, 'explanations');
ok(T.rating(5) !== T.rating(20) && T.rating(20) !== T.rating(40) && T.rating(40) !== T.rating(70), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
