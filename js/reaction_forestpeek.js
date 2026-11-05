/* ═══════════════════════════════════════════════════════════════════
   reaction_forestpeek.js — 秒反應・草叢找動物
   樣式：css/games/reaction_forestpeek.css（這款專屬的 class 一律以「forestpeek-」開頭；共用元件在 css/reaction_common.css）
   森林裡密密麻麻、一層疊一層的花草，小動物會不定時從花草的空隙之間鑽出來、跑一小段又躲回去。
   **看到小動物就點牠**，點到一隻得 1 分。限時 60 秒，成績＝一共點到幾隻（越多越好）。
   ───────────────────────────────────────────────────────────────────
   · 畫面（canvas）：上面是樹林，下面分成 ROWS 排草叢，越下面越靠近你。每一排的小動物會被「自己這一排」與「前面幾排」的草擋住一部分，
     只能從草葉之間的縫看到；牠從地面冒出來（POP_S 秒）、橫著跑一小段、再沉下去（POP_S 秒）。
   · 難度跟著「分數」走（RAMP_SCORE 分到頂，線性）：出現的間隔 INTERVAL_S 1.5 → 0.5 秒、同時出現的隻數 1 → 3（ALIVE_AT）、
     露臉的時間 SHOW_S 2.4 → 0.8 秒、跑的速度 SPEED 30 → 180 px／秒。
   · 跟著「時間」走（60 秒內線性）：小動物的大小 SIZE_PX 72 → 34 px（越後面越小、越難點）。
     前 HINT_S（20）秒是新手期：小動物出現時，牠身邊的草葉會用力晃動，刻意提醒你牠在哪裡。
   · 點擊判定：點在小動物中心 HIT_K × 大小 ＋ HIT_PAD 的範圍內就算點到（被草擋住的部分也算），露出不到 30% 的時候不算。點到空白處沒有懲罰。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'forestpeek'：選單、成績、存檔都靠它；樣式在 css/games/reaction_forestpeek.css，裡面的 class 名稱一律以 forestpeek- 開頭。 */
    'use strict';

    var ID = 'forestpeek';                              /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 隻', label: '找到幾隻', min: 1, max: 200 };  /* 成績規格：better（max＝越大越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var TIME_S = 60;                                    /* 限時幾秒 */
    var RAMP_SCORE = 40;                                /* 幾分之後難度到頂 */
    var INTERVAL_S = [1.5, 0.5];                        /* 兩隻小動物出現的平均間隔（秒）：0 分 → 到頂（每次再乘 0.7～1.3 的隨機倍率） */
    var ALIVE_AT = [0, 6, 18];                          /* 同時最多幾隻：0 分起 1 隻、6 分起 2 隻、18 分起 3 隻 */
    var SHOW_S = [2.4, 0.8];                            /* 每隻露臉的時間（秒，含冒出來與沉下去）：0 分 → 到頂 */
    var SPEED = [30, 180];                              /* 橫著跑的速度（px／秒）：0 分 → 到頂（每隻再乘 0.8～1.2） */
    var SIZE_PX = [72, 34];                             /* 小動物的大小（px）：第 0 秒 → 第 60 秒（線性變小） */
    var HINT_S = 20;                                    /* 前幾秒，小動物身邊的草會用力晃動（提醒你） */
    var POP_S = 0.18;                                   /* 冒出來、沉下去各要幾秒 */
    var HIT_K = 0.6, HIT_PAD = 10;                      /* 點擊範圍：中心 HIT_K × 大小 ＋ HIT_PAD px 以內 */
    var ROWS = 6;                                       /* 幾排草叢 */
    var ROW_TOP = 0.34, ROW_BOTTOM = 0.97;              /* 第一排與最後一排草叢的地面位置（畫面高度的比例） */
    var PLUS_MS = 800;                                  /* 「+1」字樣飄多久 */
    var SOLVE_CAP = 15;                                 /* 驗證用：api.solve 最多幫你點到幾隻 */
    var MAX_LEVEL = 1;                                  /* 只有一局（成績用 scoreOf＝點到幾隻） */
    /* 小動物（emoji；重複的已經拿掉） */
    var ANIMALS = ['😺', '😸', '🐵', '🐶', '🐺', '🐱', '🦁', '🐯', '🦒', '🦊', '🦝', '🐮', '🐷', '🐼', '🐸', '🦓', '🐴', '🦄', '🐔', '🐕‍🦺', '🐕', '🐈', '🐆', '🦌', '🦏', '🐂', '🐄', '🐖', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦘', '🦨', '🐘', '🦔', '🐇', '🐿', '🦎', '🐍', '🐉', '🦕', '🐠', '🐡', '🐓', '🦅', '🦢', '🦜', '🦩', '🦉', '🐦', '🐧', '🐤'];
    /* 畫布用的顏色（canvas 不能直接用 CSS 變數，所以寫在這裡） */
    var COL = {
        sky: '#CFE8C8', sky2: '#9CC98F', trunk: '#6B4F34', canopy: ['#3F7A3A', '#4E8C44', '#2F6630'], ground: '#4C7A36', ground2: '#3A6229',
        grass: ['#3E7D2E', '#4F9A38', '#5DAE45', '#2F6A26', '#6FBF52'], leaf: ['#3B7F33', '#2E6B2B', '#4A9440'],
        flower: ['#F25C7A', '#FFD23F', '#FFFFFF', '#B784F0', '#FF8C42', '#5CC8F2'], ink: '#2E2A1E', plus: '#FFD23F'
    };

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function prog(score) { return Math.min(1, Math.max(0, score / RAMP_SCORE)); }
    function lerp(pair, p) { return pair[0] + (pair[1] - pair[0]) * p; }
    /* 難度（輸入＝目前分數）：{ interval（秒）, alive（同時最多幾隻）, show（露臉秒數）, speed（px／秒）} */
    function diffFor(score) {
        var p = prog(score), alive = 0;
        for (var i = 0; i < ALIVE_AT.length; i++) if (score >= ALIVE_AT[i]) alive = i + 1;
        return { interval: lerp(INTERVAL_S, p), alive: alive, show: lerp(SHOW_S, p), speed: lerp(SPEED, p) };
    }
    /* 小動物的大小（輸入＝已經過了幾秒） */
    function sizeFor(t) { return lerp(SIZE_PX, Math.min(1, Math.max(0, t / TIME_S))); }
    /* 這個時間點，草會不會晃動提醒你 */
    function hintOn(t) { return t < HINT_S; }
    /* 挑一隻小動物（不跟上一隻一樣） */
    function pickAnimal(rand, last) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var a; do { a = kit.pick(ANIMALS, rand); } while (a === last && ANIMALS.length > 1);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        return a;
    }
    /* 排一隻小動物的路線：從 x0 往 dir 方向跑 speed × show，整段都要在畫面裡（離左右邊至少半隻） */
    function planPath(W, size, speed, show, rand) {
        rand = rand || Math.random;
        var dir = rand() < 0.5 ? 1 : -1, len = Math.min(speed * show, W - size * 1.2), lo = size * 0.6, hi = W - size * 0.6 - len;
        var start = kit.randFloat(lo, Math.max(lo, hi), rand);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        return { dir: dir, x0: dir > 0 ? start : start + len, len: len, speed: len / show };
    }
    /* 一隻小動物在第 age 秒：露出多少（0～1）、在哪裡（x） */
    function poseAt(a, age) {
        var rise = Math.min(1, age / POP_S), sink = Math.min(1, (a.show - age) / POP_S), up = Math.max(0, Math.min(rise, sink));
        var run = Math.max(0, Math.min(age, a.show));
        return { up: up, x: a.x0 + a.dir * a.speed * run, done: age >= a.show };
    }
    /* 點在 (x, y)：點到哪一隻？list 是 [{ x, y, size, up }]；取離中心最近、在範圍內、而且露出 30% 以上的那一隻；沒有回傳 −1 */
    function hitAnimal(list, x, y) {
        var best = -1, bd = 1e9;
        list.forEach(function (a, i) {                 /* forEach：對陣列的每個元素各做一次 */
            if (a.up < 0.3) return;
            var d = Math.hypot(a.x - x, a.y - y);
            if (d <= a.size * HIT_K + HIT_PAD && d < bd) { bd = d; best = i; }
        });
        return best;
    }
    /* 草叢第 r 排的地面高度（px） */
    function rowY(H, r) { return H * (ROW_TOP + (ROW_BOTTOM - ROW_TOP) * r / (ROWS - 1)); }
    /* 結算評語 */
    function rating(n) {
        if (n >= 45) return '森林之眼！';
        if (n >= 30) return '眼明手快！';
        if (n >= 18) return '很會找喔！';
        if (n >= 8) return '再專心一點！';
        return '盯著草叢，看哪裡在動！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把流程（結算、最佳紀錄）交給共用骨架 kit.run；只有一局，成績用 scoreOf（S.score＝點到幾隻）。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 15, stageClass: 'forestpeek-stage', resume: false,
            head: function () { return '草叢找動物'; },
            info: function (S) { return '找到 ' + S.score + ' 隻'; },
            scoreOf: function (S) { return S.score; },
            numText: function (v) { return v + ' 隻'; },
            rating: rating,
            lines: function (S) { return ['60 秒內一共找到 ' + S.score + ' 隻小動物']; },
            setup: setup
        });
    }

    /* setup(api)：遊戲開始時呼叫一次，把畫面建出來、開始動畫迴圈並處理點擊。 */
    function setup(api) {
        var stage = api.stage, S = api.S, rand = api.rand;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var cv = h('canvas', { 'class': 'forestpeek-canvas' });
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);    /* Math.round：四捨五入成整數 */
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
        stage.appendChild(cv);                          /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var g = cv.getContext('2d'); g.scale(dpr, dpr);

        var rows = [], r;
        for (r = 0; r < ROWS; r++) rows.push(makeRow(r));
        var trees = makeTrees();
        var animals = [], floats = [], rings = [], clock = 0, nextAt = 0.8, last = null, over = false, started = false;
        S.score = 0; api.setInfo('找到 0 隻');
        api.info = { get animals() { return animals; }, get clock() { return clock; }, get score() { return S.score; } };
        console.log('[草叢找動物] 開始：' + ROWS + ' 排草叢，難度 ' + JSON.stringify(diffFor(0)) + ' → ' + JSON.stringify(diffFor(RAMP_SCORE)));  /* 在瀏覽器主控台（按 F12）印出設定，方便除錯 */
        if (kit.once('forestpeek.hint')) kit.hintOn(stage, null, { mode: 'tap', x: W * 0.5, y: H * 0.6, delay: 600, text: '小動物冒出來就點牠' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        api.timer(TIME_S * 1000, timeUp);               /* 開始倒數（畫面上方的時間條）：時間到就呼叫 timeUp */
        started = true;

        /* 第 r 排草叢：細長的草葉、葉叢、花（位置隨機，有疏有密，留下一些縫） */
        function makeRow(ri) {
            var base = rowY(H, ri), items = [], x = -10, near = ri / (ROWS - 1);
            while (x < W + 10) {
                x += 4 + rand() * 8;
                if (rand() < 0.12) x += 14 + rand() * 18;                                   /* 留一個縫 */
                var hh = (38 + rand() * 52) * (0.85 + near * 0.35);
                items.push({ t: 'blade', x: x, h: hh, w: 2.5 + rand() * 3 + near * 2, bend: (rand() - 0.5) * 18, c: kit.pick(COL.grass, rand), ph: rand() * 6.28 });
                if (rand() < 0.06) items.push({ t: 'bush', x: x, y: base - 6 - rand() * 14, rx: 14 + rand() * 12, ry: 9 + rand() * 7, c: kit.pick(COL.leaf, rand), ph: rand() * 6.28 });
                if (rand() < 0.08) items.push({ t: 'flower', x: x + (rand() - 0.5) * 6, h: hh * (0.6 + rand() * 0.35), r: 4 + rand() * 3 + near * 2, c: kit.pick(COL.flower, rand), ph: rand() * 6.28 });
            }
            items.sort(function (a, b) { return (a.t === 'blade' ? 1 : 0) - (b.t === 'blade' ? 1 : 0); });   /* 葉叢先畫、草葉後畫（草葉蓋在葉叢上） */
            return { base: base, items: items };
        }
        function makeTrees() {
            var out = [];
            for (var i = 0; i < 9; i++) out.push({ x: (i + 0.5) * W / 9 + (rand() - 0.5) * 30, w: 14 + rand() * 16, r: 40 + rand() * 30, c: kit.pick(COL.canopy, rand) });
            return out;
        }

        /* 點擊：點到小動物就 +1 */
        kit.onTap(cv, function (e) {                    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用） */
            if (over || api.over) return;
            var p = kit.localPt(e, cv), i = hitAnimal(animals.map(view), p.x, p.y);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            if (i < 0) { rings.push({ x: p.x, y: p.y, t: 0 }); return; }
            catchIt(i);
        });
        function view(a) { var ps = poseAt(a, clock - a.born); return { x: ps.x, y: a.base - a.size * 0.55 * ps.up - a.size * 0.05, size: a.size, up: ps.up }; }
        function catchIt(i) {
            var a = animals[i], v = view(a);
            animals.splice(i, 1);                       /* splice：從陣列中刪掉元素 */
            S.score++; api.setInfo('找到 ' + S.score + ' 隻'); Sfx.play('pop');  /* Sfx.play(名稱)：播放音效（音效是程式即時合成的） */
            floats.push({ x: v.x, y: v.y - a.size * 0.5, t: 0, ch: a.ch, size: a.size });
        }

        api.my.loop(function (now, dt) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!cv.isConnected) return false;
            var d = Math.min(dt, 50) / 1000;
            if (!over && started) { clock += d; update(d); }
            draw();
        });

        function update(d) {
            for (var i = animals.length - 1; i >= 0; i--) if (clock - animals[i].born >= animals[i].show) animals.splice(i, 1);
            var df = diffFor(S.score);
            if (clock >= nextAt && animals.length < df.alive) { spawn(df); nextAt = clock + df.interval * kit.randFloat(0.7, 1.3, rand); }
            else if (clock >= nextAt) nextAt = clock + 0.15;            /* 已經滿了：等一下再看 */
            floats = floats.filter(function (f) { return (f.t += d * 1000) < PLUS_MS; });  /* filter：留下符合條件的元素，回傳新陣列 */
            rings = rings.filter(function (q) { return (q.t += d * 1000) < 300; });
        }
        /* 生一隻：挑一排（不跟已經有動物的排重複），排好路線 */
        function spawn(df) {
            var used = animals.map(function (a) { return a.row; }), free = [];
            for (var k = 0; k < ROWS; k++) if (used.indexOf(k) < 0) free.push(k);  /* indexOf：找元素在陣列裡的位置，找不到回傳 −1 */
            if (!free.length) return;
            var row = kit.pick(free, rand), size = sizeFor(clock), sp = df.speed * kit.randFloat(0.8, 1.2, rand);
            var path = planPath(W, size, sp, df.show, rand), ch = pickAnimal(rand, last); last = ch;
            animals.push({ ch: ch, row: row, base: rows[row].base, size: size, born: clock, show: df.show, dir: path.dir, x0: path.x0, speed: path.speed });
        }
        function timeUp() {
            if (over) return;
            over = true;
            console.log('[草叢找動物] 時間到：' + S.score + ' 隻');
            api.fail({ delay: 1600, lines: ['60 秒到了！'] });  /* api.fail({ delay, lines })：這局結束，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }

        /* ═══ 畫面 ═══ */
        function draw() {
            var sky = g.createLinearGradient(0, 0, 0, rows[0].base);
            sky.addColorStop(0, COL.sky); sky.addColorStop(1, COL.sky2);
            g.fillStyle = sky; g.fillRect(0, 0, W, H);
            /* 樹林 */
            trees.forEach(function (tr) {
                g.fillStyle = COL.trunk; g.fillRect(tr.x - tr.w / 2, rows[0].base - 170, tr.w, 170);
                g.fillStyle = tr.c; g.beginPath(); g.arc(tr.x, rows[0].base - 175, tr.r, 0, Math.PI * 2); g.arc(tr.x - tr.r * 0.6, rows[0].base - 150, tr.r * 0.7, 0, Math.PI * 2); g.arc(tr.x + tr.r * 0.6, rows[0].base - 150, tr.r * 0.7, 0, Math.PI * 2); g.fill();
            });
            var gr = g.createLinearGradient(0, rows[0].base - 30, 0, H);
            gr.addColorStop(0, COL.ground); gr.addColorStop(1, COL.ground2);
            g.fillStyle = gr; g.fillRect(0, rows[0].base - 30, W, H);
            var hint = hintOn(clock) && !over, views = animals.map(function (a) { var v = view(a); v.row = a.row; v.ch = a.ch; v.base = a.base; return v; });
            for (var ri = 0; ri < ROWS; ri++) {
                /* 這一排的小動物：只畫地面以上的部分（下半身「躲」在地面後面） */
                views.forEach(function (v) {
                    if (v.row !== ri || v.up <= 0) return;
                    g.save(); g.beginPath(); g.rect(0, 0, W, v.base); g.clip();
                    g.font = Math.round(v.size) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
                    g.fillText(v.ch, v.x, v.y);
                    g.restore();
                });
                drawRow(rows[ri], ri, hint ? views : null);
            }
            /* 點到的小動物：放大、變淡；+1 */
            floats.forEach(function (f) {
                var k = f.t / PLUS_MS;
                g.save(); g.globalAlpha = 1 - k;
                g.font = Math.round(f.size * (1 + k * 0.6)) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
                g.fillText(f.ch, f.x, f.y + f.size * 0.5 - 20 * k);
                g.font = '900 30px sans-serif'; g.lineWidth = 5; g.strokeStyle = COL.ink; g.strokeText('+1', f.x, f.y - 10 - 40 * k);
                g.fillStyle = COL.plus; g.fillText('+1', f.x, f.y - 10 - 40 * k);
                g.restore();
            });
            rings.forEach(function (q) { var k = q.t / 300; g.save(); g.globalAlpha = 0.6 * (1 - k); g.strokeStyle = '#FFFFFF'; g.lineWidth = 2; g.beginPath(); g.arc(q.x, q.y, 8 + 16 * k, 0, Math.PI * 2); g.stroke(); g.restore(); });
        }
        /* 畫一排草叢。shakers：新手期要晃動的小動物（在牠身邊、同一排與前一排的草會用力晃） */
        function drawRow(row, ri, shakers) {
            var t = clock, base = row.base;
            row.items.forEach(function (it) {
                var sway = 2.2 * Math.sin(t * 1.6 + it.ph);
                if (shakers) shakers.forEach(function (v) {
                    if (v.up <= 0 || (v.row !== ri && v.row !== ri - 1)) return;
                    var dx = Math.abs((it.x) - v.x), reach = v.size * 1.3;
                    if (dx < reach) sway += 8 * (1 - dx / reach) * Math.sin(t * 22 + it.ph * 3) * v.up;
                });
                if (it.t === 'blade') {
                    g.fillStyle = it.c;
                    g.beginPath(); g.moveTo(it.x - it.w / 2, base + 4);
                    g.quadraticCurveTo(it.x + it.bend * 0.4 + sway * 0.4, base - it.h * 0.5, it.x + it.bend + sway, base - it.h);
                    g.quadraticCurveTo(it.x + it.bend * 0.4 + sway * 0.4 + it.w * 0.3, base - it.h * 0.5, it.x + it.w / 2, base + 4);
                    g.fill();
                } else if (it.t === 'bush') {
                    g.fillStyle = it.c; g.beginPath(); g.ellipse(it.x + sway * 0.6, it.y, it.rx, it.ry, 0, 0, Math.PI * 2); g.fill();
                } else {
                    var fx = it.x + sway, fy = base - it.h;
                    g.strokeStyle = COL.grass[0]; g.lineWidth = 1.5; g.beginPath(); g.moveTo(it.x, base); g.quadraticCurveTo(it.x, fy + it.h * 0.5, fx, fy); g.stroke();
                    g.fillStyle = it.c;
                    for (var k = 0; k < 5; k++) { var a = k * 1.2566 + it.ph; g.beginPath(); g.arc(fx + Math.cos(a) * it.r, fy + Math.sin(a) * it.r, it.r * 0.8, 0, Math.PI * 2); g.fill(); }
                    g.fillStyle = '#FFD23F'; g.beginPath(); g.arc(fx, fy, it.r * 0.6, 0, Math.PI * 2); g.fill();
                }
            });
        }

        /* 驗證用（會被重複呼叫，要冪等）：solve＝點掉畫面上露出來的小動物（最多 SOLVE_CAP 隻）；wrong＝點一下空白處（沒有懲罰） */
        api.solve = function () {
            if (over) return;
            var vs = animals.map(view);
            for (var i = vs.length - 1; i >= 0; i--) if (S.score < SOLVE_CAP && vs[i].up >= 0.3) catchIt(i);
        };
        api.wrong = function () { };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '草叢找動物',
        rule: '森林裡長滿一層又一層的花草，小動物會不定時從草叢的縫裡鑽出來，跑一小段又躲回去。**看到小動物就點牠**，點到一隻得 1 分。限時 60 秒，成績是**一共找到幾隻**。前 20 秒小動物出現時，牠身邊的草會晃動提醒你。分數越高，小動物出現得越頻繁（還會兩、三隻同時出現），**露臉的時間越短、跑得越快**；時間越後面，小動物也越來越小！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            diffFor: diffFor, sizeFor: sizeFor, hintOn: hintOn, pickAnimal: pickAnimal, planPath: planPath, poseAt: poseAt, hitAnimal: hitAnimal, rowY: rowY, rating: rating,
            TIME_S: TIME_S, RAMP_SCORE: RAMP_SCORE, INTERVAL_S: INTERVAL_S, ALIVE_AT: ALIVE_AT, SHOW_S: SHOW_S, SPEED: SPEED, SIZE_PX: SIZE_PX, HINT_S: HINT_S, POP_S: POP_S, HIT_K: HIT_K, HIT_PAD: HIT_PAD, ROWS: ROWS, ANIMALS: ANIMALS, SOLVE_CAP: SOLVE_CAP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
