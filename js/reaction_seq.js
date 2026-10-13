/* ═══════════════════════════════════════════════════════════════════
   reaction_seq.js — 秒反應・猜下一個
   一排圖案有規律，猜猜「下一個」應該長什麼樣子，從 4 個選項裡點出來。
   ───────────────────────────────────────────────────────────────────
   · 一個圖案有 4 個屬性：形狀、顏色、旋轉角度、大小。每一題挑 nAttr 個屬性「會變」，其他屬性固定不變。
       形狀／顏色：長度 K（2～3）的循環，例如 圓→方→圓→方…（K=2）或 紅→藍→綠→紅…（K=3）。
       旋轉：每一步轉固定角度（±45°、±90°），所以要有「看得出轉了幾度」的形狀（三角形、箭頭、半圓、房子、L 形）。
       大小：變大再變小的波形（a, a+1, a+2, a+1 重複）、或一路變大、或一路變小，共 6 級。
   · 序列由規則直接算出 6 個圖案，前 5 個顯示，第 6 個就是答案。
   · 答案唯一（consistentNext）：把「規則空間」整個窮舉一遍——循環週期 1～3、旋轉步長（45° 的倍數）、
     大小的 3 種家族——凡是跟畫面上 5 個圖案吻合的規則，推出來的下一個必須只有一種，才收這一題（否則重抽）。
   · 選項：4 個，3 個干擾項各自「只改正解的一個屬性」；4 個選項的「看起來的樣子」（visualKey，
     旋轉要考慮形狀的對稱，例如圓形轉再多度也一樣）必須兩兩不同。
   · 難度（第 1 → LEVEL_RAMP 題線性）：會變的屬性數 1 → 3、循環長度 K 2 → 3、每題限時 15 → 8 秒。
   · V1.25（玩家意見）：
       - 取消「機會」：答錯或超時就結束；成績＝答對題數（越大越好）。
       - 上方題目區最多容納 8 格（7 個題目圖案＋「？」）：顯示的圖案數隨題號 4 → 7 個（shownFor）。
       - 揭曉答案時不再壓一層灰色：正確答案的卡片加綠色粗邊框，選錯的加紅色粗邊框。
       - 大小的差異加大：圖案縮放 0.32～1.0（每級差 0.136，原本 0.45～1.0），而且「大小」的干擾選項一定跟正解差 2 級以上，
         所以題目小圖與下方大卡片比起來也看得出差別。
       - 新增「數字題」：第 NUM_FROM（3）題起，每題有 NUM_P（35%）機率是數字數列（2、4、6、8、？），從 4 個數字選項裡點出下一個。
         規則：等差、等比、輪流加兩個數（alt）、差越來越大（grow）、前兩個相加（fib）、乘幾再加減幾（affine）；
         依題號解鎖，答案唯一（nextNumbers 把規則空間窮舉一遍，推得的下一個只有一個才收這一題）。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'seq';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 seq 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '答對題數', min: 1, max: 500 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 難度從第 1 題線性變到第 LEVEL_RAMP 題：會變的屬性數、循環長度、限時 */
    var LEVEL_RAMP = 20;
    var ATTR_START = 1, ATTR_END = 3;
    var K_START = 2, K_END = 3;
    var TIME_START = 15, TIME_END = 8;
    /* 顯示幾個圖案（第 n+1 個是答案）：上方最多 8 格＝7 個圖案＋「？」，隨題號 4 → 7 個 */
    var SHOWN = [4, 7];
    var NUM_SHOWN = [5, 7];                  /* 數字題顯示幾個數字 */
    var NUM_FROM = 3, NUM_P = 0.35;          /* 第幾題起有數字題、每題是數字題的機率 */
    var NUM_CAP = 999;                       /* 數字題裡出現的數字（絕對值）上限 */
    var SCALE_MIN = 0.32, SCALE_STEP = 0.136;     /* 圖案縮放：大小 1 級 → 0.32、每級加 0.136（6 級＝1.0） */
    var SIZE_GAP = 2;                        /* 「大小」干擾選項跟正解至少差幾級 */
    var NEXT_MS = 1000, WRONG_MS = 3200;
    var SIZE_MAX = 6;

    /* 對稱的形狀（轉了看不出差異）／不對稱的形狀（轉了看得出來），後者才適合考「旋轉」 */
    var SHAPES_SYM = ['circle', 'square', 'hexagon', 'cross'];
    var SHAPES_ASYM = ['tri', 'arrow', 'half', 'house', 'ell'];
    /* 轉幾度會看起來一樣：圓形 0＝怎麼轉都一樣；正方形 90 度；六角形 60 度；不對稱形狀 360 度 */
    /* 轉幾度會看起來一樣：0＝怎麼轉都一樣（圓形）*/
    var ROT_PERIOD = { circle: 0, square: 90, hexagon: 60, cross: 90, tri: 360, arrow: 360, half: 360, house: 360, ell: 360 };
    var SHAPE_NAME = { circle: '圓形', square: '方形', hexagon: '六角形', cross: '十字', tri: '三角形', arrow: '箭頭', half: '半圓', house: '房子形', ell: 'L 形' };
    var COLOR_NAME = ['藍', '橘', '綠', '黃', '紅'];
    var ATTRS = ['shape', 'color', 'rotation', 'size'];
    var ROT_STEPS = [45, 90, -45, -90];
    /* 大小的「波形」：0,1,2,1 重複＝變大再變小 */
    var WAVE = [0, 1, 2, 1];

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一題有幾個屬性會變 */
    function nAttrFor(level) { return Math.round(kit.ramp(level, ATTR_START, ATTR_END, LEVEL_RAMP)); }
    /* 循環的長度 K */
    function kFor(level) { return Math.round(kit.ramp(level, K_START, K_END, LEVEL_RAMP)); }
    /* 這一題顯示幾個圖案 */
    function shownFor(level) { return Math.round(kit.ramp(level, SHOWN[0], SHOWN[1], LEVEL_RAMP)); }
    /* 這一題限時 */
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    /* 取餘數，確保結果是正數（JS 的 % 對負數會得到負數，所以多加一次） */
    function mod(a, m) { return ((a % m) + m) % m; }

    /* 循環規則：試週期 1～3，凡是與畫面上前幾個吻合的，推出下一個值。回傳所有可能的答案（要確保只有一個） */
    /* 循環規則：週期 1～3 且與 values 吻合的，推出的下一個值（回傳不重複的陣列）*/
    function nextCycle(values) {
        var out = [];
        for (var p = 1; p <= 3; p++) {
            var okp = true;
            for (var i = p; i < values.length; i++) if (values[i] !== values[i - p]) { okp = false; break; }
            if (okp) { var v = values[values.length - p]; if (out.indexOf(v) < 0) out.push(v); }
        }
        return out;
    }
    /* 旋轉規則：試每步轉 0、45、90…315 度，凡是與前幾個吻合的，推出下一個角度 */
    /* 旋轉：步長是 45° 的倍數，與 values 吻合的，推出的下一個角度 */
    function nextRotation(values) {
        var out = [];
        for (var s = 0; s < 8; s++) {
            var d = s * 45, okp = true;
            for (var i = 1; i < values.length; i++) if (mod(values[i] - values[i - 1] - d, 360) !== 0) { okp = false; break; }
            if (okp) { var v = mod(values[values.length - 1] + d, 360); if (out.indexOf(v) < 0) out.push(v); }
        }
        return out;
    }
    /* 大小規則：固定、每步 +1、每步 −1、波形 a,a+1,a+2,a+1，四種都檢查 */
    /* 大小：固定、每步 +1、每步 −1（下一個要在 1～SIZE_MAX 內）、波形 a,a+1,a+2,a+1 */
    function nextSize(values) {
        var out = [], n = values.length, i;
        function add(v) { if (v >= 1 && v <= SIZE_MAX && out.indexOf(v) < 0) out.push(v); }
        var c = true; for (i = 1; i < n; i++) if (values[i] !== values[0]) c = false;
        if (c) add(values[0]);
        [1, -1].forEach(function (d) { var okp = true; for (i = 1; i < n; i++) if (values[i] - values[i - 1] !== d) okp = false; if (okp) add(values[n - 1] + d); });
        for (var a = 1; a + 2 <= SIZE_MAX; a++) for (var ph = 0; ph < 4; ph++) {
            var okw = true; for (i = 0; i < n; i++) if (values[i] !== a + WAVE[(i + ph) % 4]) okw = false;
            if (okw) add(a + WAVE[(n + ph) % 4]);
        }
        return out;
    }
    /* 窮舉所有規則，看每個屬性「下一個」有幾種可能的答案 */
    /* 整個序列的下一個圖案是否唯一：回傳每個屬性推得出的候選數 */
    function consistentNext(shown) {
        var col = function (k) { return shown.map(function (it) { return it[k]; }); };
        return { shape: nextCycle(col('shape')), color: nextCycle(col('color')), rotation: nextRotation(col('rotation')), size: nextSize(col('size')) };
    }
    /* 每個屬性都只有一種可能 → 答案唯一（出題的品質檢查） */
    function isUnique(shown) { var c = consistentNext(shown); return ATTRS.every(function (k) { return c[k].length === 1; }); }
    /* 「看起來的樣子」字串：形狀＋顏色＋旋轉（考慮對稱，圓形不管轉幾度都一樣）＋大小。用來確保 4 個選項看起來都不同 */
    function visualKey(it) {
        var per = ROT_PERIOD[it.shape];
        return it.shape + '|' + it.color + '|' + (per ? mod(it.rotation, per) : 0) + '|' + it.size;
    }

    /* 出一題：隨機決定哪些屬性會變，依規則算出 6 個圖案（前 5 個顯示，第 6 個是答案） */
    /* 出一題 */
    function makeSequence(level, rand) {
        rand = rand || Math.random;
        /* 最多嘗試 200 次，直到產生答案唯一、選項合格的題目 */
        for (var tries = 0; tries < 200; tries++) {
            var nAttr = nAttrFor(level), K = kFor(level);
            /* vary：這題會變的屬性 */
            var vary = kit.shuffle(ATTRS.slice(), rand).slice(0, nAttr);
            var has = function (a) { return vary.indexOf(a) >= 0; };
            var rules = { vary: vary, K: K };
            /* 形狀規則 */
            /* 形狀 */
            var pool = has('rotation') ? SHAPES_ASYM : SHAPES_SYM.concat(SHAPES_ASYM);
            rules.shapes = has('shape') ? kit.shuffle(pool.slice(), rand).slice(0, K) : [kit.pick(pool, rand)];
            /* 顏色規則 */
            /* 顏色 */
            rules.colors = has('color') ? kit.shuffle([0, 1, 2, 3, 4], rand).slice(0, K) : [kit.randInt(0, 4, rand)];
            /* 旋轉規則 */
            /* 旋轉：沒有變的時候固定 0 度（對稱形狀轉了也看不出來）*/
            rules.rotStart = has('rotation') ? 45 * kit.randInt(0, 7, rand) : 0;
            rules.rotStep = has('rotation') ? kit.pick(ROT_STEPS, rand) : 0;
            /* 大小規則 */
            /* 大小 */
            if (has('size')) {
                rules.sizeKind = kit.pick(['wave', 'up', 'down'], rand);
                rules.sizeA = kit.randInt(1, SIZE_MAX - 2, rand); rules.sizePh = kit.randInt(0, 3, rand);
            } else { rules.sizeKind = 'const'; rules.sizeA = kit.randInt(3, 5, rand); rules.sizePh = 0; }
            /* 依規則算出前 n＋1 個圖案（前 n 個顯示，最後一個是答案） */
            var nShown = shownFor(level), items = [];
            for (var i = 0; i <= nShown; i++) items.push(itemAt(rules, i));
            var shown = items.slice(0, nShown);
            /* 答案不唯一就重抽 */
            if (!isUnique(shown)) continue;
            var cn = consistentNext(shown);
            var ans = items[nShown];
            /* 自我檢查：窮舉推出的答案必須和規則算出的答案一樣 */
            if (cn.shape[0] !== ans.shape || cn.color[0] !== ans.color || cn.rotation[0] !== ans.rotation || cn.size[0] !== ans.size) continue;     /* 自我檢查：窮舉得到的答案要等於規則算出的答案 */
            var opt = makeOptions(shown, ans, rules, rand);
            if (!opt) continue;
            return { kind: 'shape', level: level, rules: rules, shown: shown, answer: ans, options: opt.options, correct: opt.correct };
        }
        throw new Error('seq: cannot build a sequence');
    }
    /* 算出第 i 個圖案：形狀和顏色是循環，旋轉是等差，大小依家族而定 */
    function itemAt(rules, i) {
        var size;
        if (rules.sizeKind === 'const') size = rules.sizeA;
        else if (rules.sizeKind === 'up') size = 1 + i;
        else if (rules.sizeKind === 'down') size = SIZE_MAX - i;
        else size = rules.sizeA + WAVE[(i + rules.sizePh) % 4];
        return { shape: rules.shapes[i % rules.shapes.length], color: rules.colors[i % rules.colors.length], rotation: mod(rules.rotStart + rules.rotStep * i, 360), size: size };
    }
    /* 3 個干擾項：各自只改正解的一個屬性，並確保 4 個選項看起來都不同 */
    /* 3 個干擾項：各自只改正解的一個屬性；4 個選項看起來都不同 */
    function makeOptions(shown, ans, rules, rand) {
        var list = [ans], keys = {}; keys[visualKey(ans)] = true;
        var attrsPref = kit.shuffle(ATTRS.slice(), rand);
        for (var tries = 0; tries < 120 && list.length < 4; tries++) {
            var a = attrsPref[tries % 4], d = { shape: ans.shape, color: ans.color, rotation: ans.rotation, size: ans.size };
            if (a === 'shape') d.shape = kit.pick((rules.vary.indexOf('rotation') >= 0 ? SHAPES_ASYM : SHAPES_SYM.concat(SHAPES_ASYM)).filter(function (s) { return s !== ans.shape; }), rand);
            else if (a === 'color') d.color = kit.pick([0, 1, 2, 3, 4].filter(function (c) { return c !== ans.color; }), rand);
            else if (a === 'rotation') d.rotation = mod(ans.rotation + kit.pick([45, 90, 135, 180, 225, 270, 315], rand), 360);
            else d.size = kit.pick([1, 2, 3, 4, 5, 6].filter(function (s) { return Math.abs(s - ans.size) >= SIZE_GAP; }), rand);
            var k = visualKey(d);
            if (keys[k]) continue;
            keys[k] = true; list.push(d);
        }
        if (list.length < 4) return null;
        var order = kit.shuffle([0, 1, 2, 3], rand);
        return { options: order.map(function (i) { return list[i]; }), correct: order.indexOf(0) };
    }
    /* ═══ 數字題（V1.25）═══ */
    /* 窮舉規則空間：回傳所有跟 v 吻合的規則推得的「下一個數字」（不重複）。規則家族：
       等差、輪流加兩個數、差越來越大（二階等差）、前兩個相加、乘 m 再加 c（含等比） */
    function nextNumbers(v) {
        var n = v.length, out = [], d = [], i;
        function add(x) { if (isFinite(x) && x === Math.round(x) && Math.abs(x) <= NUM_CAP && out.indexOf(x) < 0) out.push(x); }
        for (i = 1; i < n; i++) d.push(v[i] - v[i - 1]);
        if (d.every(function (x) { return x === d[0]; })) add(v[n - 1] + d[0]);
        if (d.length >= 4) { var oka = true; for (i = 2; i < d.length; i++) if (d[i] !== d[i - 2]) oka = false; if (oka) add(v[n - 1] + d[d.length - 2]); }
        if (d.length >= 3) { var e = d[1] - d[0], okg = true; for (i = 2; i < d.length; i++) if (d[i] - d[i - 1] !== e) okg = false; if (okg) add(v[n - 1] + d[d.length - 1] + e); }
        if (n >= 4) { var okf = true; for (i = 2; i < n; i++) if (v[i] !== v[i - 1] + v[i - 2]) okf = false; if (okf) add(v[n - 1] + v[n - 2]); }
        if (n >= 4 && d[0] !== 0) {
            var m = d[1] / d[0];
            if (m === Math.round(m)) { var c = v[1] - m * v[0], oka2 = true; for (i = 1; i < n; i++) if (v[i] !== m * v[i - 1] + c) oka2 = false; if (oka2) add(m * v[n - 1] + c); }
        }
        return out;
    }
    function numShownFor(level) { return Math.round(kit.ramp(level, NUM_SHOWN[0], NUM_SHOWN[1], LEVEL_RAMP)); }
    /* 這一題可用的數字規則（依題號解鎖） */
    function numTypesFor(level) {
        if (level < 6) return ['arith', 'affine0'];
        if (level < 11) return ['arith', 'affine0', 'alt', 'grow'];
        return ['arith', 'affine0', 'alt', 'grow', 'fib', 'affine'];
    }
    function sgn(x) { return x < 0 ? '減 ' + (-x) : '加 ' + x; }
    /* 依規則算出 count 個數字，回傳 { values, text }；values 超出範圍就回傳 null（重抽） */
    function numRule(type, level, rand, count) {
        var v = [], i, text;
        if (type === 'arith') {
            var d = kit.randInt(2, 9, rand) * (level >= 16 && rand() < 0.4 ? -1 : 1), a0 = d < 0 ? kit.randInt(40, 90, rand) : kit.randInt(1, 30, rand);
            for (i = 0; i < count; i++) v.push(a0 + d * i);
            text = '每次' + sgn(d);
        } else if (type === 'affine0') {
            var r = kit.pick([2, 3], rand), g0 = kit.randInt(1, 4, rand);
            for (i = 0; i < count; i++) v.push(g0 * Math.pow(r, i));
            text = '每次乘 ' + r;
        } else if (type === 'alt') {
            var p = kit.randInt(2, 9, rand), q = kit.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4], rand), s0 = kit.randInt(10, 40, rand);
            if (p === q) return null;
            v.push(s0); for (i = 1; i < count; i++) v.push(v[i - 1] + (i % 2 === 1 ? p : q));
            text = '輪流' + sgn(p) + '、' + sgn(q);
        } else if (type === 'grow') {
            var d0 = kit.randInt(1, 4, rand), e = kit.randInt(1, 3, rand), b0 = kit.randInt(0, 10, rand);
            v.push(b0); for (i = 1; i < count; i++) v.push(v[i - 1] + d0 + e * (i - 1));
            text = '相鄰兩數的差一直變大：' + d0 + '、' + (d0 + e) + '、' + (d0 + 2 * e) + '…（每次多 ' + e + '）';
        } else if (type === 'fib') {
            var f0 = kit.randInt(1, 6, rand), f1 = kit.randInt(1, 6, rand);
            if (f0 === f1) return null;
            v.push(f0, f1); for (i = 2; i < count; i++) v.push(v[i - 1] + v[i - 2]);
            text = '每個數字 ＝ 前面兩個數字相加';
        } else {
            var m = kit.pick([2, 3], rand), c = kit.pick([-3, -2, -1, 1, 2, 3], rand), x0 = kit.randInt(2, 6, rand);
            v.push(x0); for (i = 1; i < count; i++) v.push(m * v[i - 1] + c);
            text = '每次乘 ' + m + ' 再' + sgn(c);
        }
        if (v.some(function (x) { return Math.abs(x) > NUM_CAP; })) return null;
        return { values: v, text: text, type: type };
    }
    /* 數字題的 3 個干擾項：容易算錯的數字（直線外推、差 1、差 2、差一個公差…），都不等於正解、彼此不同 */
    function numOptions(shown, ans, rand) {
        var n = shown.length, last = shown[n - 1], ld = last - shown[n - 2], cands = [last + ld, ans + 1, ans - 1, ans + 2, ans - 2, ans + ld, ans - ld, ans * 2, ans + 10, ans - 10, last + 1];
        var allowNeg = shown.some(function (x) { return x < 0; }) || ans < 0;
        cands = cands.filter(function (x, i) { return x !== ans && cands.indexOf(x) === i && Math.abs(x) <= NUM_CAP && (allowNeg || x >= 0); });
        if (cands.length < 3) return null;
        var near = cands.slice(0, 5), rest = cands.slice(5);
        var pickNear = kit.shuffle(near.slice(), rand).concat(kit.shuffle(rest.slice(), rand)).slice(0, 3);
        var list = [ans].concat(pickNear), order = kit.shuffle([0, 1, 2, 3], rand);
        return { options: order.map(function (i) { return list[i]; }), correct: order.indexOf(0) };
    }
    /* 出一道數字題：回傳 { kind: 'num', shown: [數字], answer, options: [數字], correct, rule: {type, text} } */
    function makeNumSequence(level, rand) {
        rand = rand || Math.random;
        var count = numShownFor(level) + 1;
        for (var tries = 0; tries < 400; tries++) {
            var type = kit.pick(numTypesFor(level), rand), r = numRule(type, level, rand, count);
            if (!r) continue;
            var shown = r.values.slice(0, count - 1), ans = r.values[count - 1], nx = nextNumbers(shown);
            if (nx.length !== 1 || nx[0] !== ans) continue;                       /* 答案不唯一（或規則空間推出的跟答案不同）就重抽 */
            if (type !== 'arith' && new Set(shown).size < 3) continue;
            var opt = numOptions(shown, ans, rand);
            if (!opt) continue;
            return { kind: 'num', level: level, rule: { type: r.type, text: r.text }, shown: shown, answer: ans, options: opt.options, correct: opt.correct };
        }
        throw new Error('seq: cannot build a number sequence');
    }
    /* 這一題是圖案題還是數字題 */
    function makeQuestion(level, rand) {
        rand = rand || Math.random;
        return (level >= NUM_FROM && rand() < NUM_P) ? makeNumSequence(level, rand) : makeSequence(level, rand);
    }
    /* 把規律拆開用文字說明（答錯時顯示）：數字題就是那一句規則 */
    function explainAny(S) { return S.kind === 'num' ? [S.rule.text] : explain(S); }
    /* 把規律拆開用文字說明（答錯時顯示） */
    /* 把規律拆開說明 */
    function explain(seq) {
        var r = seq.rules, out = [];
        if (r.vary.indexOf('shape') >= 0) out.push('形狀：' + r.shapes.concat([r.shapes[0]]).map(function (s) { return SHAPE_NAME[s]; }).join('→') + '…重複');
        if (r.vary.indexOf('color') >= 0) out.push('顏色：' + r.colors.concat([r.colors[0]]).map(function (c) { return COLOR_NAME[c]; }).join('→') + '…重複');
        if (r.vary.indexOf('rotation') >= 0) out.push('旋轉：每次' + (r.rotStep > 0 ? '順時針' : '逆時針') + '轉 ' + Math.abs(r.rotStep) + ' 度');
        if (r.vary.indexOf('size') >= 0) out.push('大小：' + (r.sizeKind === 'up' ? '一個比一個大' : r.sizeKind === 'down' ? '一個比一個小' : '變大再變小，一直重複'));
        return out;
    }
    /* 依答對題數給評語 */
    function rating(n) {
        if (n >= 20) return '規律偵探！';
        if (n >= 12) return '眼光很準！';
        if (n >= 6) return '不錯喔！';
        return '再試一次，會更準！';
    }

    /* 畫圖案：每個形狀都在半徑 48 以內，所以旋轉後也不會超出畫布 */
    /* ── 畫圖案 ──
       每個形狀都放在以 (50,50) 為圓心、半徑 48 以內的範圍，所以怎麼轉都不會超出 100×100 的畫布 */
    /* shapeSvg：依形狀、顏色、旋轉、大小畫出一個圖案（SVG） */
    function shapeSvg(it) {
        var svg = kit.svg('svg', { 'class': 'sq-svg', viewBox: '0 0 100 100' });
        var scale = SCALE_MIN + SCALE_STEP * (it.size - 1);
        /* transform 的順序：先移到圓心、旋轉、縮放，再移回原位，這樣是繞著圖案中心旋轉與縮放 */
        var g = kit.svg('g', { transform: 'translate(50 50) rotate(' + it.rotation + ') scale(' + scale.toFixed(3) + ') translate(-50 -50)' }, svg);
        var cls = 'sq-shape sq-c' + it.color;
        /* switch：依形狀名稱選擇要畫的圖形（case 是各種情況） */
        switch (it.shape) {
            case 'circle': kit.svg('circle', { 'class': cls, cx: 50, cy: 50, r: 40 }, g); break;
            case 'square': kit.svg('rect', { 'class': cls, x: 19, y: 19, width: 62, height: 62 }, g); break;
            case 'hexagon': kit.svg('polygon', { 'class': cls, points: '50,8 86.4,29 86.4,71 50,92 13.6,71 13.6,29' }, g); break;
            case 'cross': kit.svg('polygon', { 'class': cls, points: '36,10 64,10 64,36 90,36 90,64 64,64 64,90 36,90 36,64 10,64 10,36 36,36' }, g); break;
            case 'tri': kit.svg('polygon', { 'class': cls, points: '50,6 88.1,72 11.9,72' }, g); break;
            case 'arrow': kit.svg('polygon', { 'class': cls, points: '50,6 90,50 66,50 66,92 34,92 34,50 10,50' }, g); break;
            case 'half': kit.svg('path', { 'class': cls, d: 'M8 72 A42 42 0 0 1 92 72 Z' }, g); break;
            case 'house': kit.svg('polygon', { 'class': cls, points: '50,6 90,40 76,90 24,90 10,40' }, g); break;
            default: kit.svg('polygon', { 'class': cls, points: '26,12 52,12 52,56 80,56 80,84 26,84' }, g);       /* ell */
        }
        return svg;
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* q 目前第幾題；correctN 答對數；S 這題；state 目前階段；token 流水號 */
            var q = (startAt || 1) - 1, correctN = q, S = null, state = 'idle', token = 0, newRec = false, t0 = 0;
            /* 建立畫面元素：標題、時間條、上方圖案列、問題、四個選項、說明 */
            var head = h('div', { 'class': 'sq-head', text: ' ' });
            var tb = kit.timebar();
            var row = h('div', { 'class': 'sq-row' });
            var ask = h('div', { 'class': 'sq-ask', text: '下一個是哪一個？' });
            var opts = h('div', { 'class': 'sq-opts' });
            var note = h('div', { 'class': 'sq-note', text: ' ' });
            [head, tb.el, row, ask, opts, note].forEach(function (x) { root.appendChild(x); });
            function meta() { ctx.setMeta(kit.meta(['答對 ' + correctN])); }

            /* 出下一題 */
            function nextQ() {
                if (my.dead) return;
                q++;
                /* 產生這題 */
                S = makeQuestion(q);
                var id = ++token, limit = timeFor(q);
                state = 'play';
                head.textContent = '第 ' + q + ' 題';
                note.textContent = ' ';
                row.innerHTML = ''; opts.innerHTML = '';
                /* 上排顯示前 5 個圖案和一個「？」 */
                var isNum = S.kind === 'num';
                S.shown.forEach(function (it) { row.appendChild(isNum ? h('div', { 'class': 'sq-cell sq-cell--num', text: String(it).replace('-', '−') }) : h('div', { 'class': 'sq-cell' }, [shapeSvg(it)])); });
                row.appendChild(h('div', { 'class': 'sq-cell sq-cell--q', text: '？' }));
                ask.textContent = isNum ? '數字有規律，下一個是多少？' : '下一個是哪一個？';
                /* 四個選項按鈕 */
                S.options.forEach(function (it, k) {
                    var b = isNum ? h('button', { 'class': 'btn sq-opt sq-opt--num', text: String(it).replace('-', '−') }) : h('button', { 'class': 'btn sq-opt' }, [shapeSvg(it)]);
                    b.addEventListener('pointerdown', function (e) { e.preventDefault(); choose(k); });
                    opts.appendChild(b);
                });
                meta();
                t0 = performance.now();
                /* 主控台印出這題的規律與答案位置 */
                try { console.info('[猜下一個] 第 ' + q + ' 題（' + S.kind + '）：' + (S.kind === 'num' ? S.shown.join(',') + ' → ' + S.answer : '會變 ' + S.rules.vary.join('、') + '（K=' + S.rules.K + '）') + '；' + explainAny(S).join('；') + '；答案是第 ' + (S.correct + 1) + ' 個；限時 ' + limit.toFixed(1) + ' 秒'); } catch (e) { }
                tb.set(1);
                /* 倒數 */
                my.loop(function (now) {
                    if (id !== token || state !== 'play') return false;
                    tb.set(1 - (now - t0) / (limit * 1000));
                });
                /* 時間到：settle(-1) 代表沒選 */
                my.after(limit * 1000, function () { if (id === token && state === 'play') settle(-1); });
            }

            function choose(k) { if (state === 'play') settle(k); }

            /* 結算這題：把「？」換成正解，標出對錯 */
            function settle(k) {
                state = 'reveal'; token++;
                tb.set(0);
                var okAns = k === S.correct;
                /* 把「？」換成正解 */
                var qcell = row.lastChild; qcell.className = 'sq-cell' + (S.kind === 'num' ? ' sq-cell--num' : ''); qcell.textContent = '';
                if (S.kind === 'num') qcell.textContent = String(S.answer).replace('-', '−'); else qcell.appendChild(shapeSvg(S.answer));
                /* 揭曉：不壓灰色（不用 disabled）；正確答案綠色粗邊框、選錯的紅色粗邊框 */
                [].forEach.call(opts.children, function (b, i) { b.classList.add('sq-opt--locked'); if (i === S.correct) b.classList.add('sq-opt--ok'); else if (i === k) b.classList.add('sq-opt--bad'); });
                /* 答對：稍後出下一題 */
                if (okAns) {
                    correctN++;
                    if (Reaction.setBest(ID, correctN, function (v, b) { return v > b; })) newRec = true;
                    note.textContent = '答對了！';
                    Sfx.play('win'); meta();
                    my.after(NEXT_MS, nextQ);
                    return;
                }
                /* 答錯（或超時）：結束，顯示規律的說明，再結算 */
                var exp = explainAny(S);
                note.textContent = (k < 0 ? '時間到。' : '') + '規律：' + exp.join('；');
                Sfx.play('bad');
                /* 結算，kit.resumeFrom 可以從前 5 題繼續 */
                my.after(WRONG_MS, function () {
                    var back = kit.resumeFrom(q);
                        kit.result(root, {
                        score: correctN,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: String(correctN), label: rating(correctN),
                        lines: ['第 ' + q + ' 題沒猜中，規律是：'].concat(exp),
                        isNew: newRec && correctN > 0, sfx: correctN >= 6 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { q: q, correctN: correctN, state: state, kind: S && S.kind, correct: S && S.correct, vary: S && S.rules && S.rules.vary, shownN: S && S.shown.length, optionsN: S && S.options.length }; },
                choose: choose,
                chooseRight: function () { choose(S.correct); },
                chooseWrong: function () { choose((S.correct + 1) % 4); }
            };
            /* 開場等 400 毫秒再出第一題 */
            my.after(400, nextQ);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '猜下一個',
        rule: '上面一排圖案有規律：形狀、顏色、方向或大小，會照著某種順序改變；有時候是**一排數字**，要找出數字之間的關係。**看出規律**，從下面四個選項裡，**點出「下一個」是什麼**。每題有時間限制，**答錯就結束**，規律會越來越難發現！',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { shownFor: shownFor, numShownFor: numShownFor, nextNumbers: nextNumbers, numTypesFor: numTypesFor, numRule: numRule, numOptions: numOptions, makeNumSequence: makeNumSequence, makeQuestion: makeQuestion, explainAny: explainAny, NUM_FROM: NUM_FROM, NUM_P: NUM_P, NUM_CAP: NUM_CAP, SCALE_MIN: SCALE_MIN, SCALE_STEP: SCALE_STEP, SIZE_GAP: SIZE_GAP, nAttrFor: nAttrFor, kFor: kFor, timeFor: timeFor, nextCycle: nextCycle, nextRotation: nextRotation, nextSize: nextSize, consistentNext: consistentNext, isUnique: isUnique, visualKey: visualKey, makeSequence: makeSequence, itemAt: itemAt, makeOptions: makeOptions, explain: explain, rating: rating, LEVEL_RAMP: LEVEL_RAMP, SHOWN: SHOWN, SIZE_MAX: SIZE_MAX, SHAPES_ASYM: SHAPES_ASYM, SHAPES_SYM: SHAPES_SYM }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
