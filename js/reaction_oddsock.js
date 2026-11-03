/* ═══════════════════════════════════════════════════════════════════
   reaction_oddsock.js — 秒反應・落單的襪子
   樣式：css/games/reaction_oddsock.css（這款專屬的 class 一律以「oddsock-」開頭；共用元件在 css/reaction_common.css）
   3×3 九宮格，九隻襪子裡有四對圖案相同、只有一隻沒有伴，點出那隻落單的。
   關卡制，答錯或逾時就結束，成績＝通過關數。
   這是注重直覺反應與點擊速度的遊戲：玩家看到的是明顯的差異，不靠細微的色差。
   ───────────────────────────────────────────────────────────────────
   · V1.28（玩家意見）：
       - 刪除「底色色相差」這個參數：不再靠些微的色彩差異出題；
       - 襪子底色固定是七個彩虹顏色（RAINBOW：紅橙黃綠藍靛紫）：第 1～5 關全部襪子用 3 種底色、第 6～10 關只剩 2 種、
         第 11 關起全部只剩 1 種底色（底色種類越少，越要靠花紋分辨，難度越高）；落單襪子的底色一定跟其中一對相同；
       - 每一隻襪子都旋轉成不同的角度（九隻各差至少 ROT_GAP 度），更難辨識；
       - 襪子的形狀改成「L 形」（腿直直的、腳朝右邊伸出去），不再像倒 T。
   · 襪子圖案由參數組成：底色（彩虹七色之一）、腿上橫條紋數、腳上圓點數（腳跟與腳尖的補丁色是底色的對色）。
   · 先產生 4 組互不相同的圖案（花紋 stripes×dots 各不相同），各做一對（8 隻），
     再從其中一組「只改一個花紋參數」做成落單的那隻（條紋數或圓點數差 COUNT_DELTA 3→1，線性）。
   · 九隻位置隨機打亂，位置抖動 ±6px。
   · 限時 TIME_S：V1.34 玩家意見「越後面的關卡要加長秒數」——越後面的關卡底色越少（3 種 → 1 種）、花紋差越小（差 3 → 差 1），越難看出來，
     所以時間反過來「越後面越長」：第 1 關 10 秒 → 第 RAMP_LEVELS 關 30 秒（線性），之後維持。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'oddsock'：選單、成績、存檔都靠它；樣式在 css/games/reaction_oddsock.css，裡面的 class 名稱一律以 oddsock- 開頭。 */
    'use strict';

    var ID = 'oddsock';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var COUNT_DELTA = [3, 1];                   /* 落單襪子和它最像的那一對，條紋數／圓點數差 */
    var TIME_S = [10, 30];                     /* 每關限時（秒）：第 1 關 → 到頂關卡。V1.34 玩家意見：越後面的關卡秒數要加長（原本 15 → 4 越後面越短，現在 10 → 30 越後面越長） */
    var MAX_COUNT = 8;                          /* 條紋、圓點最多幾個 */
    var CELL = 140, GAP = 14;                   /* 格子大小與間距（px） */
    var COLOR_STEPS = [{ from: 1, n: 3 }, { from: 6, n: 2 }, { from: 11, n: 1 }];   /* 從第幾關起，全部襪子共用幾種底色 */
    var ROT_GAP = 16;                           /* 九隻襪子的旋轉角度，彼此至少差幾度 */
    /* 彩虹七色：[名稱, 色相, 彩度%, 明度%]（黃色亮一點、藍紫色暗一點，看起來才像那個顏色） */
    var RAINBOW = [['紅', 0, 72, 52], ['橙', 28, 88, 54], ['黃', 50, 90, 54], ['綠', 125, 52, 42], ['藍', 205, 72, 50], ['靛', 240, 52, 48], ['紫', 280, 55, 50]];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function countDelta(level) { return Math.round(kit.ramp(level, COUNT_DELTA[0], COUNT_DELTA[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 第 level 關，全部襪子共用幾種底色：1～5 關 3 種、6～10 關 2 種、11 關起 1 種 */
    function colorCountAt(level) { var n = COLOR_STEPS[0].n; COLOR_STEPS.forEach(function (s) { if (level >= s.from) n = s.n; }); return n; }  /* forEach：對陣列的每個元素各做一次 */
    function key(p) { return p.ci + '/' + p.stripes + '/' + p.dots; }
    /* 九隻襪子的旋轉角度：把 360 度分成 9 份，每份挑一個角度（±jitter），再打亂順序，所以任兩隻至少差 ROT_GAP 度 */
    function makeRotations(rand, n) {
        n = n || 9;
        var slot = 360 / n, jit = (slot - ROT_GAP) / 2 - 0.5, base = rand() * 360, out = [];
        for (var i = 0; i < n; i++) out.push(((base + i * slot + kit.randFloat(-jit, jit, rand)) % 360 + 360) % 360);  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
        return kit.shuffle(out, rand);                  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
    }
    /* 兩個角度（度）的最小差距 */
    function angDiff(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }  /* Math.abs：取絕對值（去掉負號） */
    /* 出題：回傳 { socks: [9 個 {ci（彩虹色索引）, stripes, dots, rot, dx, dy}]（已洗牌）, odd: 落單那隻的索引, mate: 它最像的那一對的圖案, what: 改了哪個參數, colors: 這一關用到的底色索引 } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var nColor = colorCountAt(level), colors = kit.shuffle([0, 1, 2, 3, 4, 5, 6], rand).slice(0, nColor);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        for (var tries = 0; tries < 200; tries++) {
            /* 四組花紋互不相同；底色：先每種底色至少用一次，其餘隨機 */
            var pats = [], used = {}, k, p;
            while (pats.length < 4) {
                p = { stripes: kit.randInt(0, 5, rand), dots: kit.randInt(0, 5, rand) };  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
                var pk = p.stripes + '/' + p.dots;
                if (!used[pk]) { used[pk] = true; pats.push(p); }
            }
            var cols = colors.slice(); while (cols.length < 4) cols.push(kit.pick(colors, rand));  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            cols = kit.shuffle(cols, rand).slice(0, 4);
            pats.forEach(function (pp, i) { pp.ci = cols[i]; });  /* forEach：對陣列的每個元素各做一次 */
            var j = kit.randInt(0, 3, rand), base = pats[j], what = kit.pick(['stripes', 'dots'], rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            var oddP = { ci: base.ci, stripes: base.stripes, dots: base.dots }, sign = rand() < 0.5 ? 1 : -1, d = countDelta(level), cur = base[what], v = cur + sign * d;
            if (v < 0 || v > MAX_COUNT) v = cur - sign * d;
            oddP[what] = v;
            if (pats.some(function (pp) { return key(pp) === key(oddP); })) continue;      /* 落單的不能剛好跟另一組一樣（不然就有伴了） */
            var socks = [];
            pats.forEach(function (pp) { socks.push(pp, pp); });
            socks.push(oddP);
            var rots = makeRotations(rand, 9);
            socks = socks.map(function (pp, i) { return { ci: pp.ci, stripes: pp.stripes, dots: pp.dots, isOdd: i === 8, rot: rots[i], dx: kit.randFloat(-6, 6, rand), dy: kit.randFloat(-6, 6, rand) }; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            socks = kit.shuffle(socks, rand);
            return { socks: socks, odd: socks.findIndex(function (s) { return s.isOdd; }), mate: base, what: what, colors: colors };
        }
        return null;
    }
    var WHAT_NAME = { stripes: '條紋數', dots: '圓點數' };
    /* 襪子 SVG（100×130）：L 形的襪子——腿直直的（左邊）、腳朝右邊伸出去，條紋畫在腿上、圓點畫在腳上；每個 SVG 的 clipPath id 要不一樣 */
    var LEG = { x: 16, y: 6, w: 40, h: 98 }, FOOT = { x: 16, y: 72, w: 78, h: 46 };
    function sockSvg(p, uid) {
        var rb = RAINBOW[p.ci], hue = rb[1];
        var base = 'hsl(' + hue + ',' + rb[2] + '%,' + rb[3] + '%)', light = 'hsl(' + hue + ',78%,88%)', patch = 'hsl(' + ((hue + 180) % 360) + ',55%,40%)';
        var legR = '<rect x="' + LEG.x + '" y="' + LEG.y + '" width="' + LEG.w + '" height="' + LEG.h + '" rx="8"', footR = '<rect x="' + FOOT.x + '" y="' + FOOT.y + '" width="' + FOOT.w + '" height="' + FOOT.h + '" rx="23"';
        var clip = '<clipPath id="sk' + uid + '">' + legR + '/>' + footR + '/></clipPath>';
        var body = '<g clip-path="url(#sk' + uid + ')"><rect x="0" y="0" width="100" height="130" fill="' + base + '"/>';
        var i;
        for (i = 0; i < p.stripes; i++) body += '<rect x="0" y="' + (14 + i * 7) + '" width="100" height="3.6" fill="' + light + '"/>';
        var spots = [[42, 90], [56, 104], [70, 90], [84, 104], [56, 80], [76, 80], [90, 90], [38, 106]];
        for (i = 0; i < p.dots && i < spots.length; i++) body += '<circle cx="' + spots[i][0] + '" cy="' + spots[i][1] + '" r="3.6" fill="' + light + '"/>';
        body += '<circle cx="30" cy="100" r="12" fill="' + patch + '"/><circle cx="84" cy="96" r="12" fill="' + patch + '"/></g>';
        var outline = legR + ' fill="none" stroke="#4A3B1E" stroke-width="3"/>' + footR + ' fill="none" stroke="#4A3B1E" stroke-width="3"/>';
        return '<svg viewBox="0 0 100 130" width="120" height="156" xmlns="http://www.w3.org/2000/svg"><defs>' + clip + '</defs>' + body + outline + '</svg>';
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '襪子之神！';
        if (n >= 15) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '多看幾次，花紋就分得出來了！';
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
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[落單的襪子] 第 ' + level + ' 關：落單在第 ' + (q.odd + 1) + ' 格（改了' + WHAT_NAME[q.what] + '，差 ' + countDelta(level) + '）；底色 ' + q.colors.map(function (c) { return RAINBOW[c][0]; }).join('、') + '；限時 ' + timeMs(level) + ' ms；九隻 ' + q.socks.map(key).join(' | '));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, x0 = Math.round((W - (3 * CELL + 2 * GAP)) / 2), y0 = 6;  /* Math.round：四捨五入成整數 */
        var tip = h('div', { 'class': 'oddsock-tip', text: '九隻襪子裡有四對相同，找出沒有伴的那一隻' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var cells = q.socks.map(function (s, i) {       /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var el = h('div', { 'class': 'oddsock-cell', html: sockSvg(s, level + '_' + i) });
            el.style.left = (x0 + (i % 3) * (CELL + GAP)) + 'px'; el.style.top = (y0 + 66 + Math.floor(i / 3) * (CELL + GAP)) + 'px';  /* Math.floor：無條件捨去成整數 */
            el.firstChild.style.transform = 'translate(' + s.dx.toFixed(1) + 'px,' + s.dy.toFixed(1) + 'px) rotate(' + s.rot.toFixed(1) + 'deg)';
            kit.onTap(el, function () { judge(i); });   /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            stage.appendChild(el);                      /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            return el;
        });
        var hint = null;
        /* 操作提示（只在第一次進遊戲時）：手指縮放，擺在「落單的那一隻」上（第一關的正確答案） */
        if (level === 1 && kit.once('oddsock.hint')) hint = kit.hintOn(stage, cells[q.odd], { mode: 'tap', text: '請點擊沒有伴的襪子' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        api.timer(timeMs(level), function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(i) {
            if (api.over) return;
            var odd = q.odd;
            cells[odd].classList.add('oddsock-cell--odd');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            q.socks.forEach(function (s, k) { if (k !== odd && key(s) === key(q.mate)) cells[k].classList.add('oddsock-cell--mate'); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (i === odd) { api.pass({ delay: 800 }); return; }  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            if (i >= 0) cells[i].classList.add('oddsock-cell--bad');
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 2000, lines: [
                    (i < 0 ? '時間到！' : '選錯了！') + '落單的是第 ' + (Math.floor(odd / 3) + 1) + ' 列第 ' + (odd % 3 + 1) + ' 隻',  /* Math.floor：無條件捨去成整數 */
                    '它和最像的那一對只差' + WHAT_NAME[q.what] + '：差 ' + countDelta(level) + ' 個'
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.odd); };
        api.wrong = function () { judge(q.odd === 0 ? 1 : 0); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '落單的襪子',
        rule: '九隻襪子排成九宮格，其中有四對圖案一模一樣，只有一隻沒有伴。**找出那隻落單的襪子**，點下去。襪子的底色只有彩虹七色，**每一隻都轉成不同的角度**。每關有時間限制，答錯或來不及就結束。越後面，**底色種類越少**，要靠條紋和圓點來分辨！',
        mount: mount,
        score: SCORE,
        test: { countDelta: countDelta, timeMs: timeMs, colorCountAt: colorCountAt, makeRotations: makeRotations, angDiff: angDiff, makeLevel: makeLevel, sockSvg: sockSvg, key: key, rating: rating, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, TIME_S: TIME_S, COUNT_DELTA: COUNT_DELTA, MAX_COUNT: MAX_COUNT, ROT_GAP: ROT_GAP, RAINBOW: RAINBOW, COLOR_STEPS: COLOR_STEPS }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
