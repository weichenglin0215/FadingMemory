/* ═══════════════════════════════════════════════════════════════════
   reaction_alignchar.js — 秒反應・對準才看到（企劃 219「對準才看得到」的改版）
   樣式：css/games/reaction_alignchar.css（這款專屬的 class 一律以「alignchar-」開頭；共用元件在 css/reaction_common.css）
   一個中文字被切成許多「直條」，每一條都在上下方向移動，速度忽快忽慢（會在不等的時間點突然換一個速度、有的往上有的往下），
   所以大部分時間看起來是一團破碎的線條。**沒有任何一刻所有直條同時對準**（出題時保證，見 neverAligned）：
   只有每隔大約一個週期，「除了最左邊那幾條以外」的直條會同時對準一下，字會露出右邊的大部分；最左邊那幾條（部首最容易被猜出來）
   故意用反方向、很快又不等速的方式捲動，永遠不會對準。看出它是哪個字，點下面的選項。關卡制：選錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 動作是時間的純函式（規範 T3）：每一條有一張「速度表」segs＝[{ t0, v, x0 }]：從第 t0 秒起每秒往下移動 v 個圖案高度 P（負＝往上），
     那一刻的位置是 x0；第 t 秒的偏移 ＝ (x0 + v × (t − t0)) 取小數部分 × P。同一個亂數種子一定出同一份速度表。
   · 速度會變：兩次「接近對齊」之間，每一條被切成 SEG_PARTS 段、每段長度不等、每段換一個速度（KMIN～KMAX 倍 ÷ 週期，方向也隨機；
     KMAX 是 [第 1 關, 到頂] 兩個數字，隨關卡線性變大，所以越後面速度越快）。
     一般直條的最後一段會「算好」速度，剛好在接近對齊的那一刻落在對準位置（solveSpeed）；所以速度忽快忽慢，字還是看得到。
   · 最左邊 LEFT_FRAC（至少 2 條）：相鄰兩條方向相反、速度（這一關的 KMAX）× LEFT_K 倍（盡量快）、每段不等速，而且接近對齊的時刻一定偏離對準位置
     至少 MISS_MIN 個圖案高度（makeStrip 會重抽到符合為止）——所以任何時刻都不會「完整對齊」。NEAR_ALIGN 設成 false 就連接近對齊也沒有（極難）。
   · 出題：第一次接近對齊的時刻 ＝ 週期 × ALIGN_AT 範圍的隨機數（取小數部分、至少 0.4 個週期），之後每隔 週期 × 0.75～1.25 一次（不等），
     所以不能「一開始就盯著看」、也抓不準下一次什麼時候。選項會挑「長得像」的字（日目自白百、未末朱束…），選項個數 4 → 6。
   · 難度線性（RAMP_LEVELS 關走到頂）：直條數 STRIPS（越細越難拼）；週期 CYCLE_S（越短，接近對齊的瞬間越短）；作答限時 TIME_S。
   · 揭曉：所有直條停在對準的位置，整個字完整顯示，標出正確的選項。
   · V1.29（玩家意見）：答案按鈕的字形改成明體／宋體（.alignchar-opt 用 --font-note），跟題目字形（目前的黑體）不一樣，故意增加難度；
     題目字形不動（canvas 畫字用的是頁面的 --font-ui 黑體）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'alignchar'：選單、成績、存檔都靠它；樣式在 css/games/reaction_alignchar.css，裡面的 class 名稱一律以 alignchar- 開頭。 */
    'use strict';

    var ID = 'alignchar';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var STRIPS = [6, 65];                       /* 切成幾條直條：第 1 關 → 到頂 */
    var OPTIONS = [4, 6];                       /* 有幾個選項：第 1 關 → 到頂 */
    var CYCLE_S = [6, 30];                     /* 對準的週期（秒）：第 1 關 → 到頂 */
    var TIME_S = [12, 60];                       /* 作答限時（秒）：第 1 關 → 到頂 */
    var KMAX = [6, 16];                         /* 直條的速度倍數最大是幾（速度 ＝ 倍數 ÷ 週期 個圖案高度／秒）：第 1 關 → 到頂 */
    var ALIGN_AT = [6.0, 60.0];                  /* 第一次「接近對齊」的時刻 ＝ 週期 × 這個範圍的隨機數（只取小數部分、至少 0.4 個週期，所以實際上落在 0.4～1 個週期之間） */
    var KMIN = 2;                               /* 一般直條的速度倍數最小是幾（速度 ＝ 倍數 ÷ 週期 個圖案高度／秒） */
    var SEG_PARTS = [2, 4];                     /* 兩次接近對齊之間，每一條的速度會換幾次：分成幾段（每段長度不等） */
    var LEFT_FRAC = 0.3;                        /* 最左邊這一比例的直條（至少 2 條）故意反方向、用很快又不等的速度捲動，永遠不會對準——部首最容易被猜出來，所以遮住它 */
    var LEFT_K = [1.0, 1.5];                    /* 最左邊那幾條的速度倍數：這一關 KMAX 的幾倍到幾倍（盡量快；每一段在這個範圍內隨機） */
    var MISS_MIN = 0.12;                        /* 接近對齊的那一刻，最左邊那幾條至少偏離對準位置多遠（圖案高度的幾分之幾）：保證那一刻字不完整 */
    var FULL_TOL = 0.03;                        /* 「完整對齊」的誤差：所有直條都在對準位置 ±（這個比例 × 圖案高度）以內就算完整對齊；出題時保證任何時刻都不會發生 */
    var NEAR_ALIGN = true;                      /* true＝每隔大約一個週期，除了最左邊那幾條，其他直條會同時對準一下（字露出右邊大部分，但永遠看不到完整的字）；false＝連這個都沒有，完全靠零碎的片段猜（極難） */
    var OPT_FONT = 0.8;                         /* 答案按鈕上的字，大小是按鈕短邊（寬、高取小的）的幾分之幾：0.8＝4/5 */
    var PIC = { w: 460, h: 460 };               /* 圖案方框的大小（邏輯 px），h 同時是直條循環的一圈長度 P */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* 「長得像」的字群組：選項優先從同一群挑。
       V1.33：改用共用資料庫 js/similar_chars.js（SimilarChars），不再自己寫一份字表。
       這款的直條要拼得出字，所以只用「平均筆劃 ≤ GROUP_MAX_STROKES、至少 4 個字」的字群（跟以前的字表差不多難）。 */
    var GROUP_MAX_STROKES = 15;
    var GROUPS = SimilarChars.groups({ minSize: 4, maxStrokes: GROUP_MAX_STROKES }).map(function (g) { return g.chars; });  /* 「長得像的字」群組（每一群是一個字的陣列），選項優先從同一群挑 */
    var CHARS = [];                                 /* 所有群組裡出現過的字（不重複），下面的迴圈會把字填進來 */
    GROUPS.forEach(function (g) { g.forEach(function (c) { if (CHARS.indexOf(c) < 0) CHARS.push(c); }); });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stripsFor(level) { return kit.clamp(Math.round(kit.ramp(level, STRIPS[0], STRIPS[1], RAMP_LEVELS)), STRIPS[0], STRIPS[1]); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function optionsFor(level) { return kit.clamp(Math.round(kit.ramp(level, OPTIONS[0], OPTIONS[1], RAMP_LEVELS)), OPTIONS[0], OPTIONS[1]); }  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
    function kmaxFor(level) { return kit.ramp(level, KMAX[0], KMAX[1], RAMP_LEVELS); }
    function cycleFor(level) { return kit.ramp(level, CYCLE_S[0], CYCLE_S[1], RAMP_LEVELS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    function frac(x) { return x - Math.floor(x); }
    /* 位置 x（單位：圖案高度，不取餘數）離最近的「對準位置」（整數）有多遠：0～0.5 個圖案高度（0＝剛好對準） */
    function gapOf(x) { var f = frac(x); return Math.min(f, 1 - f); }
    /* 一條直條在第 t 秒的位置（單位：圖案高度，不取餘數）：找到 t 所在的那一段，x0 ＋ v × 經過的時間 */
    function stripPos(strip, t) {
        var s = strip.segs, i = s.length - 1;
        while (i > 0 && s[i].t0 > t) i--;
        return s[i].x0 + s[i].v * (t - s[i].t0);
    }
    /* 第 t 秒，這一條往下偏移多少 px（0～P） */
    function stripOffset(strip, t, P) { return frac(stripPos(strip, t)) * P; }
    /* 這一刻，所有直條「離對準」最遠的是多少 px（0＝全部對準；偏移 P − x 也算 x，因為循環） */
    function misalign(strips, t, P) {
        var m = 0;
        strips.forEach(function (s) { m = Math.max(m, gapOf(stripPos(s, t)) * P); });  /* forEach：對陣列的每個元素各做一次 */
        return m;
    }
    /* 這一刻有幾條直條在對準位置上（誤差 tol 個圖案高度以內） */
    function alignedCount(strips, t, tol) {
        var c = 0;
        strips.forEach(function (s) { if (gapOf(stripPos(s, t)) <= tol) c++; });
        return c;
    }
    /* 整個 horizon 秒裡，有沒有任何一刻「所有直條同時對準」（誤差 FULL_TOL 以內）；沒有才回傳 true（每 0.01 秒檢查一次） */
    function neverAligned(strips, horizon) {
        for (var t = 0.003; t <= horizon; t += 0.01) {
            var all = true;
            for (var i = 0; i < strips.length; i++) if (gapOf(stripPos(strips[i], t)) > FULL_TOL) { all = false; break; }
            if (all) return false;
        }
        return true;
    }
    /* n 條直條裡，最左邊有幾條要「故意不對準」：n × LEFT_FRAC 四捨五入，至少 2 條、至多 n − 1 條（至少留 1 條讓字露出來） */
    function leftCount(n) { return Math.max(1, Math.min(n - 1, Math.max(2, Math.round(n * LEFT_FRAC)))); }
    /* 第一次接近對齊的時刻，之後每隔 週期 × 0.75～1.25（不等）一次，一直排到 horizon 秒 */
    function peakTimes(cycle, horizon, rand) {
        rand = rand || Math.random;
        var out = [], t = cycle * Math.max(0.4, frac(kit.randFloat(ALIGN_AT[0], ALIGN_AT[1], rand)));  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        while (t <= horizon) { out.push(t); t += cycle * kit.randFloat(0.75, 1.25, rand); }
        return out;
    }
    /* 這一段（長 d 秒）開頭的位置是 x（單位：圖案高度），要讓結尾剛好落在整數（＝對準）：位移 ＝ w − frac(x)（w 是整數＝繞了幾圈）。
       在速度倍數 KMIN～kmax（這一關的 KMAX）的範圍內挑一個 w（有好幾個就隨機挑）；範圍內挑不到就挑最接近的。回傳速度 v（圖案高度／秒，有正負）。 */
    function solveSpeed(x, d, cycle, rand, kmax) {
        kmax = kmax == null ? KMAX[1] : kmax;
        var f = frac(x), lo = KMIN * d / cycle, hi = kmax * d / cycle, cands = [], w, span = Math.ceil(hi) + 2;
        for (w = -span; w <= span; w++) { var disp = w - f, a = Math.abs(disp); if (a >= lo && a <= hi) cands.push(disp); }
        if (!cands.length) {
            var best = 0, bd = 1e9;
            for (w = -span; w <= span; w++) { var dp = w - f, ap = Math.abs(dp), dd = ap < lo ? lo - ap : (ap > hi ? ap - hi : 0); if (dd < bd) { bd = dd; best = dp; } }
            cands.push(best);
        }
        return cands[Math.floor(rand() * cands.length)] / d;
    }
    /* 做一條直條的速度表 { segs: [{ t0, v, x0 }] }。idx＝第幾條（0＝最左）、isLeft＝是不是最左邊那幾條、peaks＝接近對齊的時刻、horizon＝要排到第幾秒。
       · 一般直條：每段速度（KMIN～KMAX 倍 ÷ 週期）與方向都隨機，每兩次接近對齊之間分成 SEG_PARTS 段、每段長度不等；
         最後一段的速度用 solveSpeed 算好，讓它在接近對齊的那一刻剛好落在對準位置；
       · 最左邊的直條：相鄰兩條方向相反、速度 KMAX × LEFT_K 倍、每段不等速，而且接近對齊的那一刻偏離對準位置至少 MISS_MIN（不夠就重抽）。 */
    function makeStrip(idx, isLeft, peaks, horizon, cycle, rand, kmax) {
        rand = rand || Math.random;
        kmax = kmax == null ? KMAX[1] : kmax;
        var dir = idx % 2 === 0 ? -1 : 1, segs;
        for (var tries = 0; tries < 80; tries++) {
            segs = [];
            var t = 0, x = rand(), okMiss = true, bounds = peaks.concat([horizon + cycle]);   /* 最後一段排到比限時還晚一點，不用對準 */
            for (var bi = 0; bi < bounds.length; bi++) {
                var L = bounds[bi] - t, atPeak = bi < peaks.length, solveLast = atPeak && !isLeft;
                var nseg = Math.max(2, atPeak ? kit.randInt(SEG_PARTS[0], SEG_PARTS[1], rand) : Math.round(L / (cycle * 0.4)));  /* kit.randInt(最小, 最大, rand)：隨機整數 */
                var dLast = solveLast ? L * kit.randFloat(0.3, 0.5, rand) : 0, m = solveLast ? nseg - 1 : nseg, ws = [], sum = 0, ds = [], j;
                for (j = 0; j < m; j++) { ws.push(0.4 + rand()); sum += ws[j]; }
                for (j = 0; j < m; j++) ds.push((L - dLast) * ws[j] / sum);
                if (solveLast) ds.push(dLast);
                for (j = 0; j < ds.length; j++) {
                    var v = (solveLast && j === ds.length - 1) ? solveSpeed(x, ds[j], cycle, rand, kmax)
                        : (isLeft ? dir * kit.randFloat(LEFT_K[0] * kmax, LEFT_K[1] * kmax, rand) : (rand() < 0.5 ? -1 : 1) * kit.randFloat(KMIN, kmax, rand)) / cycle;
                    segs.push({ t0: t, v: v, x0: x });
                    x += v * ds[j]; t += ds[j];
                }
                if (isLeft && atPeak && gapOf(x) < MISS_MIN) okMiss = false;                    /* 這一刻（接近對齊）最左邊的直條離對準太近 */
            }
            if (okMiss) break;
        }
        return { segs: segs };
    }
    /* 選項：同群的字優先，不夠再從別的群補 */
    function makeOptions(target, count, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var groups = GROUPS.filter(function (g) { return g.indexOf(target) >= 0; });  /* filter：留下符合條件的元素，回傳新陣列 */
        var near = [];
        groups.forEach(function (g) { g.forEach(function (c) { if (c !== target && near.indexOf(c) < 0) near.push(c); }); });
        var opts = kit.shuffle(near, rand).slice(0, count - 1);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        if (opts.length < count - 1) {
            var rest = kit.shuffle(CHARS.filter(function (c) { return c !== target && opts.indexOf(c) < 0; }), rand);
            while (opts.length < count - 1) opts.push(rest.shift());
        }
        return kit.shuffle([target].concat(opts), rand);
    }
    /* 出一關：{ ch, options, answer（答案是第幾個選項）, n, left（最左邊幾條故意不對準）, cycle, peaks（接近對齊的時刻）, tAlign（第一次接近對齊）, strips（每一條的速度表）, horizon } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = stripsFor(level), cycle = cycleFor(level), kmax = kmaxFor(level), horizon = timeMs(level) / 1000 + 1, nL = leftCount(n), strips, peaks;
        for (var tr = 0; tr < 20; tr++) {
            peaks = NEAR_ALIGN ? peakTimes(cycle, horizon, rand) : [];
            strips = [];
            for (var i = 0; i < n; i++) strips.push(makeStrip(i, i < nL, peaks, horizon, cycle, rand, kmax));
            if (neverAligned(strips, horizon)) break;                                  /* 保證任何一刻都不會完整對齊（幾乎不用重抽） */
        }
        var ch = kit.pick(CHARS, rand), options = makeOptions(ch, optionsFor(level), rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        return { ch: ch, options: options, answer: options.indexOf(ch), n: n, left: nL, cycle: cycle, kmax: kmax, peaks: peaks, tAlign: peaks.length ? peaks[0] : null, strips: strips, horizon: horizon };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 20) return '一眼看穿！';
        if (n >= 12) return '眼力超強！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '等字對準的那一瞬間，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[對準才看到] 第 ' + level + ' 關：字「' + q.ch + '」，' + q.n + ' 條（最左邊 ' + q.left + ' 條不對準）；週期 ' + q.cycle.toFixed(3) + ' 秒，接近對齊的時刻 ' + q.peaks.map(function (p) { return p.toFixed(2); }).join('、') + ' 秒；選項 ' + q.options.join('') + '；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, DPR = 2, cw = PIC.w, ch = PIC.h;
        var cv = h('canvas', { 'class': 'alignchar-canvas' });
        cv.width = cw * DPR; cv.height = ch * DPR; cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
        cv.style.left = Math.round((W - cw) / 2) + 'px'; cv.style.top = '30px';
        stage.appendChild(cv);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note alignchar-tip', text: '直條忽快忽慢，對準的直條會露出字' });
        stage.appendChild(tip);
        /* 先把整個字畫在看不見的畫布上，之後每一格都從這張「底圖」切直條 */
        var gl = document.createElement('canvas');
        gl.width = cw * DPR; gl.height = ch * DPR;
        var g = gl.getContext('2d');
        g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-ink').trim() || '#4A3B1E';
        g.font = '900 ' + Math.round(ch * 0.84 * DPR) + 'px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(q.ch, gl.width / 2, gl.height / 2 + ch * 0.04 * DPR);
        var ctx = cv.getContext('2d');
        var sw = cw / q.n;
        function draw(t, aligned) {
            ctx.clearRect(0, 0, cv.width, cv.height);
            for (var i = 0; i < q.n; i++) {
                var off = aligned ? 0 : stripOffset(q.strips[i], t, ch);
                var sx = Math.round(i * sw * DPR), sW = Math.round((i + 1) * sw * DPR) - sx;
                ctx.drawImage(gl, sx, 0, sW, gl.height, sx, Math.round(off * DPR), sW, gl.height);
                ctx.drawImage(gl, sx, 0, sW, gl.height, sx, Math.round((off - ch) * DPR), sW, gl.height);
            }
        }
        var t0 = performance.now();                     /* performance.now()：高精度的時間（毫秒），計時用 */
        draw(0, false);
        var loop = api.my.loop(function () { if (api.over) return false; draw((performance.now() - t0) / 1000, false); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
        /* 答案按鈕：不管幾個選項（4、5、6 個）都排成「一橫排」貼在畫面下方，不拆成上下兩排（兩排會蓋到題目下面的提示文字） */
        var grid = kit.btnGrid(stage, q.options.map(function (c, i) { return { text: c, kind: 'line', cls: 'alignchar-opt', onTap: function () { judge(i); } }; }), { cols: q.options.length, h: 84, gap: 8 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        /* 字的大小＝按鈕短邊的 OPT_FONT（4/5）：選項越多按鈕越窄，字也跟著縮；按鈕的寬高讀排好版之後的實際尺寸 */
        grid.btns.forEach(function (b) { b.style.fontSize = Math.round(Math.min(b.offsetWidth || 72, b.offsetHeight || 84) * OPT_FONT) + 'px'; });  /* offsetWidth／offsetHeight：元素排好版之後的實際寬高（px） */
        api.timer(timeMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('alignchar.hint')) kit.hintOn(stage, grid.btns[q.answer], { mode: 'tap', delay: 800, text: '請點擊你看到的字' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(i) {
            if (api.over) return;
            loop.stop(); draw(0, true);
            var ok = i === q.answer;
            grid.btns[q.answer].classList.add('alignchar-opt--right');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (i != null && !ok) grid.btns[i].classList.add('alignchar-opt--wrong');
            tip.textContent = '這個字是「' + q.ch + '」';     /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1300 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2300, lines: [(i == null ? '時間到！' : '選錯了') + '，答案是「' + q.ch + '」', '最左邊 ' + q.left + ' 條一直反方向快速捲動，不會對準'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge((q.answer + 1) % q.options.length); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '對準才看到',
        rule: '一個中文字被切成許多直條，每一條都在上下移動，而且會在不等的時間點突然換速度。**沒有任何一刻所有直條同時對準**，只有大部分直條對準的瞬間，字的右邊才會露出來。**最左邊幾條故意反方向快速捲動、永遠對不準**，部首猜不到。**看出它是哪個字**，點下面的選項。選錯或來不及就結束，看你能過幾關。越後面，直條越細、越快！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            stripsFor: stripsFor, optionsFor: optionsFor, kmaxFor: kmaxFor, cycleFor: cycleFor, timeMs: timeMs, frac: frac, gapOf: gapOf, stripPos: stripPos, stripOffset: stripOffset, misalign: misalign, alignedCount: alignedCount, neverAligned: neverAligned, leftCount: leftCount, peakTimes: peakTimes, solveSpeed: solveSpeed, makeStrip: makeStrip, makeOptions: makeOptions, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, STRIPS: STRIPS, OPTIONS: OPTIONS, CYCLE_S: CYCLE_S, TIME_S: TIME_S, ALIGN_AT: ALIGN_AT, KMAX: KMAX, KMIN: KMIN, SEG_PARTS: SEG_PARTS, LEFT_FRAC: LEFT_FRAC, LEFT_K: LEFT_K, MISS_MIN: MISS_MIN, FULL_TOL: FULL_TOL, NEAR_ALIGN: NEAR_ALIGN, OPT_FONT: OPT_FONT, PIC: PIC, GROUPS: GROUPS, CHARS: CHARS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
