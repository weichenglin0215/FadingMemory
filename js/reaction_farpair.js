/* ═══════════════════════════════════════════════════════════════════
   reaction_farpair.js — 秒反應・哪對離最遠（企劃 158「哪一對離得遠」）
   樣式：css/games/reaction_farpair.css（這款專屬的 class 一律以「farpair-」開頭；共用元件在 css/reaction_common.css）
   畫面上有好幾對圓點，每一對是同一個顏色（兩個紅點、兩個綠點、兩個黃點…），
   判斷「哪一對的兩個點相距最遠」，點該對的任何一個圓點。
   關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1、Q6：先決定結果、再把精確度調到位）：先決定「最遠那一對」的距離 D1、第二遠的距離 D2 ＝ D1 ÷ 倍率，
     其他對的距離隨機在 D2 的 35％～92％；再把每一對的兩個圓點放到畫面上（角度隨機，所有圓點圓心至少相距 MIN_GAP）。
     所以「最遠」永遠只有一對，而且它比第二遠的長了剛好「倍率」倍。
   · 難度線性（RAMP_LEVELS 關走到頂）：對數 2 → 6 對；最遠與第二遠的比例 1.60 → 1.04（差距從 60％縮到 4％）。
     每對的連線方向隨機（橫、直、斜都有），所以不能靠「橫向看起來比較短」之類的錯覺取巧。
   · V1.29（玩家意見）：每一對的兩個圓點大小不一樣，一大一小——起點（第一個點 a）維持原本的大小 DOT_R，
     終點（第二個點 b）縮成 1/3（DOT_R2 ＝ DOT_R ÷ 3）；命中半徑 HIT_R（40）不變，所以小點也一樣好點。
   · 揭曉（動畫）：先從你點的那一對的某個圓點，畫出一條直線到另一個端點，並顯示距離；
     如果你猜錯，再用同樣的動畫畫出「真正最遠的那一對」。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'farpair'：選單、成績、存檔都靠它；樣式在 css/games/reaction_farpair.css，裡面的 class 名稱一律以 farpair- 開頭。 */
    'use strict';

    var ID = 'farpair';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（對數用 PAIR_LEVELS） */
    var PAIR_LEVELS = 16;                       /* 對數幾關之後到頂 */
    var PAIRS = [2, 7];                         /* 有幾對圓點：第 1 關 → 到頂 */
    var RATIO = [1.25, 1.05];                    /* 最遠 ÷ 第二遠：第 1 關 → 到頂 */
    var ANS_S = [15, 60];                        /* 作答限時（秒）：第 1 關 → 到頂 */
    var D1_MIN = 250, D1_MAX = 420;             /* 最遠那一對的距離範圍（像素） */
    var D_MIN = 90;                             /* 任何一對的最短距離 */
    var OTHER = [0.8, 0.98];                   /* 其他對的距離 ＝ 第二遠 × 這個範圍內的隨機數 */
    var MIN_GAP = 64;                           /* 任兩個圓點圓心至少相距多少 */
    var MARGIN = 30;                            /* 圓點離遊戲區邊緣至少多遠 */
    var DOT_R = 20;                             /* 起點（每一對的第一個點）畫出來的半徑 */
    var DOT_R2 = DOT_R / 2;                     /* 終點（每一對的第二個點）畫出來的半徑：起點的 1/3 */
    var HIT_R = 40;                             /* 命中半徑 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* 八種顏色（色相，飽和度與亮度固定）：紅、橘、黃、綠、藍、紫、粉紅、青；彼此夠不一樣。
       顏色數一定要 ≥ 最多的對數 PAIRS[1]（V1.29 修正：PAIRS 調成 7 對時，原本只有 6 種顏色，最後幾關出題會當機） */
    var HUES = [{ n: '紅', h: 4 }, { n: '橘', h: 28 }, { n: '黃', h: 50 }, { n: '綠', h: 135 }, { n: '藍', h: 212 }, { n: '紫', h: 282 }, { n: '粉紅', h: 328 }, { n: '青', h: 178 }];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 一對圓點裡，起點 a 畫大的（DOT_R）、終點 b 畫小的（DOT_R2） */
    function dotR(end) { return end === 'a' ? DOT_R : DOT_R2; }
    function pairsFor(level) { return kit.clamp(Math.round(kit.ramp(level, PAIRS[0], PAIRS[1], PAIR_LEVELS)), PAIRS[0], PAIRS[1]); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function ratioFor(level) { return kit.ramp(level, RATIO[0], RATIO[1], RAMP_LEVELS); }
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 把一對圓點（距離 d）放進 W×H 的區域：角度隨機、位置隨機，兩個點都要在邊界內、離已放的點 ≥ MIN_GAP；放不進去回傳 null */
    function placePair(d, W, H, placed, rand) {
        for (var tr = 0; tr < 300; tr++) {
            var ang = rand() * Math.PI * 2, vx = Math.cos(ang) * d, vy = Math.sin(ang) * d;
            var loX = MARGIN + Math.max(0, -vx), hiX = W - MARGIN - Math.max(0, vx), loY = MARGIN + Math.max(0, -vy), hiY = H - MARGIN - Math.max(0, vy);
            if (hiX < loX || hiY < loY) continue;
            var ax = kit.randFloat(loX, hiX, rand), ay = kit.randFloat(loY, hiY, rand), bx = ax + vx, by = ay + vy;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            var far = placed.every(function (p) { return kit.dist(ax, ay, p.x, p.y) >= MIN_GAP && kit.dist(bx, by, p.x, p.y) >= MIN_GAP; });  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
            if (far) return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
        }
        return null;
    }
    /* 出一關：{ W, H, pairs:[{ color, hue, a:{x,y}, b:{x,y}, d }], best（最遠那一對是 pairs 的第幾個）, ratio } */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = pairsFor(level), ratio = ratioFor(level);
        for (var tr = 0; tr < 300; tr++) {
            var d1 = kit.randFloat(D1_MIN, Math.min(D1_MAX, Math.sqrt(W * W + H * H) - 2 * MARGIN - 10), rand), d2 = d1 / ratio;  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
            if (d2 < D_MIN * 1.3) continue;
            var ds = [d1, d2];
            for (var i = 2; i < n; i++) ds.push(Math.max(D_MIN, d2 * kit.randFloat(OTHER[0], OTHER[1], rand)));
            /* 先放最遠的，再依距離從長到短放（長的最難放，先放） */
            var order = ds.map(function (d, k) { return k; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var placed = [], res = [], good = true;
            for (var k = 0; k < order.length; k++) {
                var pr = placePair(ds[order[k]], W, H, placed, rand);
                if (!pr) { good = false; break; }
                placed.push(pr.a, pr.b);
                res.push({ a: pr.a, b: pr.b, d: ds[order[k]] });
            }
            if (!good) continue;
            var cols = kit.shuffle(HUES, rand).slice(0, n);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            /* 洗牌：最遠那一對不一定是第一個 */
            var idx = kit.shuffle(res.map(function (r, j) { return j; }), rand);
            var pairs = idx.map(function (j, pos) { return { color: cols[pos].n, hue: cols[pos].h, a: res[j].a, b: res[j].b, d: res[j].d }; });
            var best = idx.indexOf(0);                  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            return { W: W, H: H, pairs: pairs, best: best, ratio: ratio };
        }
        /* 保底：固定的 2 對 */
        var fb = [{ color: HUES[0].n, hue: HUES[0].h, a: { x: 60, y: 100 }, b: { x: 360, y: 100 }, d: 300 }, { color: HUES[4].n, hue: HUES[4].h, a: { x: 100, y: 300 }, b: { x: 100, y: 570 }, d: 270 }];
        return { W: W, H: H, pairs: fb, best: 0, ratio: 300 / 270 };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '目測大師！';
        if (n >= 15) return '眼睛像尺一樣準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '橫的直的都比一比，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
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
        var W = stage.clientWidth || 472, H = (stage.clientHeight || 640) - 64;          /* 下面留 64 像素放說明文字 */
        var q = makeLevel(level, W, H, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[哪對離最遠] 第 ' + level + ' 關：' + q.pairs.length + ' 對；各對距離 ' + q.pairs.map(function (p) { return p.color + p.d.toFixed(4); }).join('、') + '；最遠是 ' + q.pairs[q.best].color + '（最遠÷第二遠＝' + q.ratio.toFixed(4) + '）');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var svg = kit.svg('svg', { 'class': 'farpair-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        var gLine = kit.svg('g', {}, svg), gDot = kit.svg('g', {}, svg), gText = kit.svg('g', {}, svg);
        var dots = [];
        q.pairs.forEach(function (p, i) {               /* forEach：對陣列的每個元素各做一次 */
            var fill = kit.hsl(p.hue, 78, 52), stroke = kit.hsl(p.hue, 70, 30);
            ['a', 'b'].forEach(function (k) {
                var c = kit.svg('circle', { cx: p[k].x, cy: p[k].y, r: dotR(k), fill: fill, stroke: stroke, 'stroke-width': k === 'a' ? 3 : 2, 'class': 'farpair-dot' }, gDot);
                dots.push({ el: c, pair: i, end: k });
            });
        });
        var tip = h('div', { 'class': 'qz-note farpair-tip', text: '哪一對（同顏色）的兩個點離得最遠？' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        api.timer(ansMs(level), function () { judge(-1, null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('farpair.hint')) kit.hintOn(stage, null, { mode: 'tap', x: q.pairs[q.best].a.x, y: q.pairs[q.best].a.y, delay: 600, text: '請點擊距離最遠那一對的圓點' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        kit.onTap(stage, function (e) {                 /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            if (api.over) return;
            var pt = kit.localPt(e, stage), bi = -1, bd = 1e9;
            dots.forEach(function (d, i) { var pp = q.pairs[d.pair][d.end], dd = kit.dist(pt.x, pt.y, pp.x, pp.y); if (dd < bd) { bd = dd; bi = i; } });
            if (bd <= HIT_R) judge(dots[bi].pair, dots[bi].end);
        });

        /* 畫一條從 from 慢慢長到 to 的線，結束時在中間寫距離；回傳 Promise */
        function drawLine(pi, fromKey, cls) {
            var p = q.pairs[pi], from = p[fromKey], to = p[fromKey === 'a' ? 'b' : 'a'];
            var ln = kit.svg('line', { x1: from.x, y1: from.y, x2: from.x, y2: from.y, 'class': 'farpair-line ' + cls }, gLine);
            return api.my.tween(650, function (e) {     /* my.tween(毫秒, 函式)：動畫補間：在這段時間內，函式每一幀會收到 0→1 的進度 */
                ln.setAttribute('x2', from.x + (to.x - from.x) * e); ln.setAttribute('y2', from.y + (to.y - from.y) * e);  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            }, kit.easeOutCubic).then(function () {
                var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
                var tx = kit.svg('text', { x: mx, y: my - 10, 'text-anchor': 'middle', 'class': 'farpair-dist ' + cls }, gText);
                tx.textContent = p.color + '：' + p.d.toFixed(4);  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            });
        }
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(pi, endKey) {
            if (api.over) return;
            api.stopTimer();
            var ok = pi === q.best;
            if (pi < 0) {                       /* 時間到：直接揭曉最遠的那一對 */
                tip.textContent = '時間到！最遠的是 ' + q.pairs[q.best].color + ' 那一對';
                drawLine(q.best, 'a', 'farpair-line--right');
                api.fail({ delay: 3400, lines: ['時間到！', '最遠的是 ' + q.pairs[q.best].color + ' 那一對，距離 ' + q.pairs[q.best].d.toFixed(4) + ' 像素'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                return;
            }
            tip.textContent = ok ? '答對了！' : '再看一次';
            drawLine(pi, endKey, ok ? 'farpair-line--right' : 'farpair-line--wrong').then(function () {
                if (ok) return;
                return api.my.wait(500).then(function () {
                    tip.textContent = '真正最遠的是 ' + q.pairs[q.best].color + ' 那一對';
                    return drawLine(q.best, 'a', 'farpair-line--right');
                });
            });
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1900 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);
            api.fail({
                delay: 3400, lines: [
                    '你選了 ' + q.pairs[pi].color + '（' + q.pairs[pi].d.toFixed(4) + ' 像素）',
                    '最遠的是 ' + q.pairs[q.best].color + '（' + q.pairs[q.best].d.toFixed(4) + ' 像素）'
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.best, 'a'); };
        api.wrong = function () { judge((q.best + 1) % q.pairs.length, 'a'); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '哪對離最遠',
        rule: '畫面上有好幾對圓點，每一對是同一個顏色。判斷**哪一對的兩個點相距最遠**，**點該對的任何一個圓點**。揭曉時會用直線量給你看。點錯或來不及就結束，看你能過幾關。越後面，對數越多、距離差越小！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            dotR: dotR, DOT_R: DOT_R, DOT_R2: DOT_R2, HIT_R: HIT_R, pairsFor: pairsFor, ratioFor: ratioFor, ansMs: ansMs, placePair: placePair, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, PAIR_LEVELS: PAIR_LEVELS, PAIRS: PAIRS, RATIO: RATIO, ANS_S: ANS_S, MIN_GAP: MIN_GAP, MARGIN: MARGIN, D_MIN: D_MIN, MAX_LEVEL: MAX_LEVEL, HUES: HUES
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
