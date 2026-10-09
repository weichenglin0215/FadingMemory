/* ═══════════════════════════════════════════════════════════════════
   reaction_diff.js — 秒反應・哪裡怪怪的
   畫面分成上下兩格，各有 10 個一樣的幾何圖形，其中 5 個的「大小」或「顏色」或「位置」不一樣。
   上格、下格的圖形都可以點，找齊 5 個就進下一關（全新的 10 個圖形，差異變小）。
   ───────────────────────────────────────────────────────────────────
   · 每一關：10 個圖形（形狀、顏色、位置都是新的），上下兩格擺一模一樣，再挑 5 個「對應的圖形」
     動手腳：差異種類 大小／顏色／位置 隨機（保證三種都至少出現一次）；動手腳的那一邊（上或下）也隨機，
     所以不能只盯著其中一格。
   · 差異大小全部隨關卡線性縮小（第 1 關 → 第 LEVEL_RAMP 關）：
        大小：半徑差 SIZE_START(45%) → SIZE_END(5%)
        顏色：色相差 HUE_START(55°) → HUE_END(4°)
        位置：位移   POS_START(38px) → POS_END(3px)
   · 不限時間。點到沒有差異的圖形：每一關第一次點錯不算，第 MISTAKES_MAX 次（第二次）點錯就結束。
     畫面上只顯示本關已經花了多久（不影響成績）。成績＝通過幾關。結束時會把沒找到的差異圈出來。
   · 失敗之後可以從「失敗關卡 − 5」繼續。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'diff';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 diff 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    /* 差異量隨關卡線性縮小到第 LEVEL_RAMP 關 */
    var LEVEL_RAMP = 20;
    /* 大小差異比例、色相差異度數、位置位移 px：三種差異各自的起始值與終點值 */
    var SIZE_START = 0.3, SIZE_END = 0.05;
    var HUE_START = 40, HUE_END = 5;
    var POS_START = 30, POS_END = 5;
    /* 同一關點錯幾次就結束（第 2 次點錯結束，第一次不扣） */
    var MISTAKES_MAX = 2;                      /* 同一關點到第幾個沒有差異的圖形就結束 */
    var NEXT_MS = 700;
    /* 每格版面是 4×3 = 12 個位置，從中挑 10 個放圖形，其中 5 個動手腳 */
    var COLS = 4, ROWS = 3, N_SHAPES = 10, N_DIFF = 5;
    var BASE_R = 30;
    /* 可以出現的圖形種類 */
    var SHAPES = ['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond', 'pentagon'];
    /* 差異的三種種類：大小、顏色（hue 色相）、位置 */
    var KINDS = ['size', 'hue', 'pos'];

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關三種差異各自的量（線性隨關卡變小） */
    function amounts(level) {
        return {
            size: kit.ramp(level, SIZE_START, SIZE_END, LEVEL_RAMP),
            hue: kit.ramp(level, HUE_START, HUE_END, LEVEL_RAMP),
            pos: kit.ramp(level, POS_START, POS_END, LEVEL_RAMP)
        };
    }

    /* 產生一關：10 個圖形（形狀、顏色、位置都是隨機的），上下兩格擺一樣，再挑 5 個「動手腳」（改大小、顏色或位置） */
    /* 產生一關。W×Hh 是每一格（上或下）的大小。回傳：
       { items:[{shape,hue,r,x,y}] (原本的 10 個), diffs:[{i, kind, panel('top'|'bot'), amount, dh, ds, dx, dy}] } */
    function makeLevel(level, W, Hh, rand) {
        rand = rand || Math.random;
        var amt = amounts(level);
        /* 從 12 個格子隨機挑 10 個，每個圖形在格子裡再隨機偏移一點，讓畫面不要太整齊 */
        /* 從 4×3 = 12 個格子隨機挑 10 個，每個格子裡再亂數偏移一點 */
        var cells = [];
        for (var c = 0; c < COLS * ROWS; c++) cells.push(c);
        cells = kit.shuffle(cells, rand).slice(0, N_SHAPES);
        var cw = W / COLS, ch = Hh / ROWS;
        var items = cells.map(function (cell) {
            var cx = (cell % COLS + 0.5) * cw, cy = (Math.floor(cell / COLS) + 0.5) * ch;
            return {
                shape: kit.pick(SHAPES, rand),
                hue: kit.randInt(0, 359, rand),
                r: BASE_R,
                x: cx + (rand() - 0.5) * Math.max(0, cw - 2 * BASE_R - 28),
                y: cy + (rand() - 0.5) * Math.max(0, ch - 2 * BASE_R - 28)
            };
        });
        /* 挑 5 個要動手腳的圖形，差異種類三種都至少出現一次，其餘隨機；每個差異改在上格或下格也是隨機的 */
        /* 挑 5 個動手腳；差異種類：三種都至少一次，其餘隨機 */
        var idx = kit.shuffle(items.map(function (_, i) { return i; }), rand).slice(0, N_DIFF);
        /* kinds 先放三種，再補到 5 個，最後洗牌 */
        var kinds = KINDS.slice();
        while (kinds.length < N_DIFF) kinds.push(kit.pick(KINDS, rand));
        kinds = kit.shuffle(kinds, rand);
        var diffs = idx.map(function (i, k) {
            var kind = kinds[k], d = { i: i, kind: kind, panel: rand() < 0.5 ? 'top' : 'bot', amount: amt[kind], dh: 0, ds: 1, dx: 0, dy: 0 };
            if (kind === 'size') d.ds = 1 + (rand() < 0.5 ? -1 : 1) * amt.size;
            if (kind === 'hue') d.dh = (rand() < 0.5 ? -1 : 1) * amt.hue;
            if (kind === 'pos') {
                var a = rand() * Math.PI * 2;
                d.dx = Math.cos(a) * amt.pos; d.dy = Math.sin(a) * amt.pos;
                /* 位移後不能跑出格子：超出就改成反方向 */
                /* 位移後不能跑出格子：超出就反方向 */
                var it = items[i];
                if (it.x + d.dx < BASE_R || it.x + d.dx > W - BASE_R) d.dx = -d.dx;
                if (it.y + d.dy < BASE_R || it.y + d.dy > Hh - BASE_R) d.dy = -d.dy;
            }
            return d;
        });
        return { items: items, diffs: diffs, amt: amt };
    }
    /* 某一格（上或下）裡第 i 個圖形最終長什麼樣子：有動手腳的就套用差異 */
    /* 某一格（'top'／'bot'）裡第 i 個圖形最終的樣子 */
    function itemIn(level, panel, i) {
        var it = level.items[i], out = { shape: it.shape, hue: it.hue, r: it.r, x: it.x, y: it.y };
        level.diffs.forEach(function (d) {
            if (d.i === i && d.panel === panel) {
                out.r = it.r * d.ds;
                out.hue = (it.hue + d.dh + 360) % 360;
                out.x = it.x + d.dx; out.y = it.y + d.dy;
            }
        });
        return out;
    }
    /* 多邊形的頂點座標：依形狀算出各頂點（正多邊形用三角函式 cos／sin 算，星星則是外圈內圈交替） */
    function polyPoints(shape, r) {
        var pts = [], n, k;
        if (shape === 'triangle') { n = 3; }
        else if (shape === 'hexagon') { n = 6; }
        else if (shape === 'pentagon') { n = 5; }
        else if (shape === 'diamond') { return [[0, -r * 1.15], [r * 0.8, 0], [0, r * 1.15], [-r * 0.8, 0]]; }
        else if (shape === 'square') { return [[-r * 0.9, -r * 0.9], [r * 0.9, -r * 0.9], [r * 0.9, r * 0.9], [-r * 0.9, r * 0.9]]; }
        else if (shape === 'star') {
            for (k = 0; k < 10; k++) {
                var rr = k % 2 ? r * 0.48 : r * 1.1, a = -Math.PI / 2 + k * Math.PI / 5;
                pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
            }
            return pts;
        }
        for (k = 0; k < n; k++) { var a2 = -Math.PI / 2 + k * 2 * Math.PI / n; pts.push([r * Math.cos(a2), r * Math.sin(a2)]); }
        return pts;
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* round：開一局（失敗後可從失敗關卡前 5 關繼續） */
        /* start：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(start) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            /* levelNo 目前關卡；cleared 已過幾關；newRec 有沒有破紀錄 */
            var levelNo = start || 1, cleared = levelNo - 1, newRec = false;

            /* 先放不斷行空白佔住高度，之後量上下格大小才準 */
            /* 先放不斷行空白佔住高度：startLevel 一開頭就量上下格的大小，文字晚填會讓量到的比最後的大 */
            var head = h('div', { 'class': 'df-head' }, [h('span', { 'class': 'df-head__main', text: '\u00a0' }), h('span', { 'class': 'df-head__sub', text: '\u00a0' })]);
            /* 建立畫面元素：標題、上格、下格、「點錯了」提示 */
            var top = h('div', { 'class': 'df-panel' });
            var bot = h('div', { 'class': 'df-panel' });
            var flash = h('div', { 'class': 'df-penalty', text: '點錯了' });
            root.appendChild(head);
            root.appendChild(top);
            root.appendChild(bot);
            root.appendChild(flash);

            /* L 這一關的資料；found 已找到幾個；svgs 上下格的 SVG；t0 這關開始時間；foundSet 已找到的圖形編號；mistakes 這關已點錯幾次 */
            var L = null, found = 0, svgs = {}, t0 = 0, state = 'idle', foundSet = {}, mistakes = 0;

            /* 更新標題列右側的小字 */
            function meta() { ctx.setMeta(kit.meta(['第 ' + levelNo + ' 關', fmtBest(Reaction.getBest(ID))])); }
            /* 更新標題文字（找到幾個、還能點錯幾次、花了幾秒） */
            function paintHead() {
                var left = MISTAKES_MAX - 1 - mistakes;
                head.innerHTML = '';
                head.appendChild(h('span', { 'class': 'df-head__main', text: '第 ' + levelNo + ' 關　找到 ' + found + ' / ' + N_DIFF }));
                head.appendChild(h('span', { 'class': 'df-head__sub' + (left <= 0 ? ' df-head__sub--warn' : ''), text: (left > 0 ? '還能點錯 ' + left + ' 次' : '再點錯就結束了') + '　本關 ' + Math.floor((performance.now() - t0) / 1000) + ' 秒' }));
            }

            /* 畫其中一格（上或下）：每個圖形畫成 SVG 形狀，外加一個看不見但可點的「熱區」圓和標記圈 */
            function drawPanel(el, panel, W, Hh) {
                el.innerHTML = '';
                var svg = kit.svg('svg', { 'class': 'df-svg', viewBox: '0 0 ' + W + ' ' + Hh }, el);
                svgs[panel] = svg;
                L.items.forEach(function (_, i) {
                    var s = itemIn(L, panel, i);
                    var g = kit.svg('g', { transform: 'translate(' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) + ')' }, svg);
                    var fillC = 'hsl(' + s.hue.toFixed(1) + ', 72%, 56%)';
                    if (s.shape === 'circle') kit.svg('circle', { 'class': 'df-shape', r: s.r.toFixed(2), fill: fillC }, g);
                    else kit.svg('polygon', { 'class': 'df-shape', fill: fillC, points: polyPoints(s.shape, s.r).map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') }, g);
                    kit.svg('circle', { 'class': 'df-ring', r: BASE_R + 12, id: '' }, g);
                    var hit = kit.svg('circle', { 'class': 'df-hit', r: BASE_R + 14 }, g);
                    hit.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(i, panel, g); });
                    g.setAttribute('data-i', i);
                });
            }

            /* 同時在上下兩格的同一個圖形外面加標記圈（答對綠色、揭曉橘色） */
            function ringBoth(i, cls) {
                ['top', 'bot'].forEach(function (p) {
                    var g = svgs[p].querySelector('g[data-i="' + i + '"]');
                    if (g) g.querySelector('.df-ring').classList.add(cls);
                });
            }

            /* 開始一關 */
            function startLevel() {
                if (my.dead) return;
                L = makeLevel(levelNo, top.clientWidth, top.clientHeight);
                found = 0; foundSet = {}; mistakes = 0; state = 'play'; t0 = performance.now();
                drawPanel(top, 'top', top.clientWidth, top.clientHeight);
                drawPanel(bot, 'bot', bot.clientWidth, bot.clientHeight);
                /* 操作提示（只在第一次進遊戲時）：點圖形 → 手指縮放，指在上面那格的中央（不洩漏哪個圖形不同） */
                if (Reaction.kit.once('diff.hint')) Reaction.kit.hintOn(root, top, { mode: 'tap' });
                paintHead(); meta();
                /* 主控台印出這一關三種差異量與 5 個差異的位置（驗證用） */
                try {
                    console.info('[哪裡怪怪的] 第 ' + levelNo + ' 關 差異量：大小 ±' + (L.amt.size * 100).toFixed(1) + '%、色相 ±' + L.amt.hue.toFixed(1) + '°、位置 ' + L.amt.pos.toFixed(1) + 'px；' +
                        L.diffs.map(function (d) { return '圖' + (d.i + 1) + ':' + ({ size: '大小', hue: '顏色', pos: '位置' })[d.kind] + '(' + (d.panel === 'top' ? '上' : '下') + '格改)'; }).join('、'));
                } catch (e) { }
                /* 每 0.5 秒更新一次「本關已花幾秒」（只是顯示，用 setTimeout，不靠 rAF） */
                /* 每 0.5 秒更新一次「本關已花幾秒」（只是顯示，用 setTimeout，不靠 rAF）*/
                var lv = levelNo;
                (function tick() { my.after(500, function () { if (state === 'play' && lv === levelNo) { paintHead(); tick(); } }); })();
            }

            /* 玩家點了某個圖形 */
            function tap(i, panel, g) {
                if (state !== 'play' || foundSet[i]) return;
                /* 這個圖形是不是 5 個差異之一 */
                var isDiff = L.diffs.some(function (d) { return d.i === i; });
                if (isDiff) {
                    foundSet[i] = true; found++;
                    ringBoth(i, 'df-ring--ok');
                    Sfx.play('ok');
                    paintHead();
                    if (found >= N_DIFF) levelClear();
                /* 不是差異：點錯，顯示橘色圈，累計次數，達上限就結束 */
                } else {
                    g.querySelector('.df-ring').classList.add('df-ring--bad');
                    my.after(450, function () { g.querySelector('.df-ring').classList.remove('df-ring--bad'); });
                    mistakes++;
                    Sfx.play('bad');
                    flash.classList.remove('df-penalty--on'); void flash.offsetWidth; flash.classList.add('df-penalty--on');
                    paintHead();
                    if (mistakes >= MISTAKES_MAX) gameOver();
                }
            }

            /* 過關 */
            function levelClear() {
                state = 'clear';
                cleared = levelNo;
                if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                Sfx.play('win');
                levelNo++;
                my.after(NEXT_MS, startLevel);
            }

            /* 結束：把沒找到的差異圈出來 */
            function gameOver() {
                if (state !== 'play') return;
                state = 'over';
                L.diffs.forEach(function (d) { if (!foundSet[d.i]) ringBoth(d.i, 'df-ring--miss'); });
                head.innerHTML = '';
                head.appendChild(h('span', { 'class': 'df-head__main', text: '第二次點錯了！' }));
                head.appendChild(h('span', { 'class': 'df-head__sub', text: '黃圈是沒找到的' }));
                var failLevel = levelNo, back = kit.resumeFrom(failLevel), secs = Math.round((performance.now() - t0) / 1000);
                my.after(2200, function () {
                    kit.result(root, {
                        score: cleared,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: cleared + ' 關', label: '點錯兩次了',
                        lines: ['第 ' + failLevel + ' 關找到 ' + found + ' / ' + N_DIFF + '，花了 ' + secs + ' 秒'],
                        isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail',
                        onAgain: function () { round(1); },
                        resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            /* G.debug：測試用後門 */
            G.debug = {
                level: function () { return L; },
                state: function () { return { levelNo: levelNo, found: found, state: state, cleared: cleared }; },
                tapIdx: function (i, panel) { var g = svgs[panel || 'top'].querySelector('g[data-i="' + i + '"]'); tap(i, panel || 'top', g); },
                solve: function () { L.diffs.forEach(function (d) { if (!foundSet[d.i]) G.debug.tapIdx(d.i, d.panel === 'top' ? 'bot' : 'top'); }); },
                timeUp: gameOver,
                mistakes: function () { return mistakes; }
            };
            /* 開場等 400 毫秒再開始第一關 */
            my.after(400, startLevel);
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '哪裡怪怪的',
        rule: '畫面分成上下兩格，各有 10 個一樣的圖形，其中 5 個的大小、顏色或位置不一樣。上格、下格的圖形都可以點，找齊 5 個就進下一關，而且差異會越來越小。不限時間，慢慢找！但是每一關第一次點到沒有差異的圖形不要緊，第二次點錯就結束了。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { amounts: amounts, MISTAKES_MAX: MISTAKES_MAX, makeLevel: makeLevel, itemIn: itemIn, polyPoints: polyPoints, N_DIFF: N_DIFF, N_SHAPES: N_SHAPES, KINDS: KINDS, LEVEL_RAMP: LEVEL_RAMP }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
