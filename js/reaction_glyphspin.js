/* ═══════════════════════════════════════════════════════════════════
   reaction_glyphspin.js — 秒反應・鏡中旋轉字
   樣式：css/games/reaction_glyphspin.css（這款專屬的 class 一律以「glyphspin-」開頭；共用元件在 css/reaction_common.css）
   畫面中央出現一個「相似字」（已／己／巳、辨／辯／辦／辮…），字會左右鏡射、一直旋轉，
   下方是幾個正常方向的答案字，點「這個字原本是哪一個」。
   關卡制，答錯或逾時就結束，成績＝通過關數。只用中文字，不用阿拉伯數字或英文。
   ───────────────────────────────────────────────────────────────────
   · 題庫（FAMILIES）是一組一組長得像的字，每組記著「大約的筆劃數 s」（人工估計，只用來排難度）。
     V1.25：題庫擴充到 50 多組、筆劃從 2～3 劃一路到 20～28 劃；每關依「目標筆劃」挑字群，
     目標筆劃隨關卡線性增加（STROKES：第 1 關 3 劃 → 第 MAX_LEVEL 關 26 劃），只挑筆劃相近（±STROKE_SPREAD）的字群，
     而且最近用過的字群（RECENT_KEEP 個）不再抽，所以不會「幾個字一直重複」。
   · 答案按鈕＝這一組的字（不夠 OPT 個就從筆劃最接近的別組補）；按鈕上的字永遠是正常方向。
   · 題目字「不會消失」，一直顯示到玩家作答或時間到：
       - 旋轉：剛出現時很快（起始速度＝SPIN[0]→SPIN[1] 度／秒，是 V1.24 的 10 倍），隨時間慢慢變慢
         （二次曲線，SLOW_S 秒降到最慢），最慢的轉速是 SPIN_MIN 度／秒；
         V1.55.0（玩家意見）：SPIN_MIN、SLOW_S 改成跟其他難度參數一樣的 [第 1 關, 到頂] 格式，每關各自線性算出（spinMinAt、slowAt）；
       - 大小：剛出現時字寬是畫面寬度的 90%，隨時間線性縮小，作答時間用完時剛好是 10%（SIZE_PCT）。
   · 鏡射：每關 50% 機率（SYMMETRIC 裡的字左右對稱，鏡射看不出差異，所以不鏡射）；
     旋轉方向每關隨機（順時針或逆時針）。
   · 難度（線性，RAMP_LEVELS 關走完）：起始轉速 400→3000 度／秒、作答限時 10→6 秒、答案按鈕 3→5 個。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'glyphspin'：選單、成績、存檔都靠它；樣式在 css/games/reaction_glyphspin.css，裡面的 class 名稱一律以 glyphspin- 開頭。 */
    'use strict';

    var ID = 'glyphspin';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var SPIN = [1200, 2400];                     /* 剛出現時的旋轉角速度（度／秒）：第 1 關 → 到頂（V1.24 的 10 倍） */
    var SPIN_MIN = [560, 960];                  /* 最慢的旋轉角速度（度／秒）：第 1 關 → 到頂（V1.55.0 改成 [第 1 關, 到頂]；目前兩頭一樣＝480） */
    var SLOW_S = [8, 5];                        /* 幾秒之後降到最慢：第 1 關 → 到頂（V1.55.0 改成 [第 1 關, 到頂]；目前兩頭一樣＝5 秒） */
    var ANS_S = [10, 6];                        /* 作答限時（秒）：第 1 關 → 到頂；字不會消失，時間到就算失敗 */
    var SIZE_PCT = [90, 10];                    /* 字寬占畫面寬度的百分比：剛出現 → 作答時間用完時 */
    var STAGE_W = 500;                          /* 畫面寬度（px，舞台固定 500） */
    var OPT = [3, 5];                           /* 答案按鈕數 */
    var MIRROR_P = 0.66;                         /* 鏡射的機率 */
    var STROKES = [3, 26];                      /* 目標筆劃數：第 1 關 → 第 MAX_LEVEL 關 */
    var STROKE_SPREAD = 3;                      /* 字群的筆劃數跟目標差不超過這個數才會被抽到 */
    var RECENT_KEEP = 8;                        /* 最近用過幾個字群不再抽（候選不夠時才放寬） */

    /* 相似字群：同一組的字互相是干擾項；s ＝ 平均筆劃數（只用來排難度）。
       V1.33：改用共用資料庫 js/similar_chars.js（SimilarChars），每組取「最像的前 FAMILY_MAX 個字」。 */
    var FAMILY_MAX = 4;
    var FAMILIES = SimilarChars.groups({ minSize: 2 }).map(function (g) { return { s: Math.round(g.s), c: g.chars.slice(0, FAMILY_MAX) }; });  /* 相似字群：s＝平均筆劃數（只用來排難度）、c＝取最像的前 FAMILY_MAX 個字 */
    var SYMMETRIC = '大日土士人八天夫王田目';      /* 左右對稱的字：鏡射沒有意義 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function spinAt(level) { return kit.ramp(level, SPIN[0], SPIN[1], RAMP_LEVELS); }       /* 這一關剛出現時的角速度 */
    function spinMinAt(level) { return kit.ramp(level, SPIN_MIN[0], SPIN_MIN[1], RAMP_LEVELS); }  /* 這一關最慢的角速度（度／秒） */
    function slowAt(level) { return kit.ramp(level, SLOW_S[0], SLOW_S[1], RAMP_LEVELS); }           /* 這一關幾秒之後降到最慢 */
    function optCount(level) { return Math.round(kit.ramp(level, OPT[0], OPT[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function ansMs(level) { return Math.round(kit.ramp(level, ANS_S[0], ANS_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 這一關的目標筆劃數（線性，MAX_LEVEL 關之後維持） */
    function strokeTarget(level) { return kit.ramp(level, STROKES[0], STROKES[1], MAX_LEVEL); }
    /* 角速度（度／秒）隨時間降低：t 秒時 ＝ spinMin ＋ (v0 − spinMin) × (1 − t/slowS)²，slowS 秒之後維持 spinMin（spinMin、slowS 沒傳就用第 1 關的值） */
    function speedAt(v0, ms, spinMin, slowS) {
        if (spinMin == null) spinMin = SPIN_MIN[0]; if (slowS == null) slowS = SLOW_S[0];
        var u = Math.max(0, 1 - ms / 1000 / slowS);
        return spinMin + (v0 - spinMin) * u * u;
    }
    /* 某時刻（毫秒）的旋轉角度：speedAt 的積分（二次曲線降速，之後等速） */
    function angleAt(q, ms) {
        var sm = q.spinMin == null ? SPIN_MIN[0] : q.spinMin, ss = q.slowS == null ? SLOW_S[0] : q.slowS;
        var t = ms / 1000, v0 = Math.max(q.spin, sm), tt = Math.min(t, ss);
        var travelled = sm * t + (v0 - sm) * ss / 3 * (1 - Math.pow(1 - tt / ss, 3));
        return q.start + q.dir * travelled;
    }
    /* 字寬占畫面寬度的比例（0～1）：剛出現 90% → 作答時間用完 10%，線性 */
    function sizeFrac(ms, limitMs) {
        var p = Math.min(1, Math.max(0, ms / limitMs));
        return (SIZE_PCT[0] + (SIZE_PCT[1] - SIZE_PCT[0]) * p) / 100;
    }
    /* 出題：回傳 { fam（字群編號）, target, options（已洗牌）, mirror, dir（1 順時針／−1 逆時針）, spin, start, strokes }
       recent：最近用過的字群編號（陣列），這些字群先不抽（候選不夠才放寬） */
    function makeLevel(level, rand, recent) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        recent = recent || [];
        var tg = strokeTarget(level), n = optCount(level);
        var near = [], i;
        for (i = 0; i < FAMILIES.length; i++) if (Math.abs(FAMILIES[i].s - tg) <= STROKE_SPREAD) near.push(i);  /* Math.abs：取絕對值（去掉負號） */
        if (!near.length) {                                 /* 保底：挑筆劃最接近的 4 組 */
            near = FAMILIES.map(function (f, k) { return k; }).sort(function (a, b) { return Math.abs(FAMILIES[a].s - tg) - Math.abs(FAMILIES[b].s - tg); }).slice(0, 4);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        }
        var fresh = near.filter(function (k) { return recent.indexOf(k) < 0; });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        var fi = kit.pick(fresh.length ? fresh : near, rand), fam = FAMILIES[fi].c;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        var target = kit.pick(fam, rand);
        var opts = [target].concat(kit.shuffle(fam.filter(function (c) { return c !== target; }), rand));  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        if (opts.length > n) opts = opts.slice(0, n);
        if (opts.length < n) {                              /* 不夠：從筆劃最接近的別組補 */
            var others = FAMILIES.map(function (f, k) { return k; }).filter(function (k) { return k !== fi; })  /* filter：留下符合條件的元素，回傳新陣列 */
                .sort(function (a, b) { return Math.abs(FAMILIES[a].s - FAMILIES[fi].s) - Math.abs(FAMILIES[b].s - FAMILIES[fi].s) || rand() - 0.5; });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
            for (i = 0; i < others.length && opts.length < n; i++) {
                kit.shuffle(FAMILIES[others[i]].c.slice(), rand).forEach(function (c) { if (opts.length < n && opts.indexOf(c) < 0) opts.push(c); });  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            }
        }
        var mirror = SYMMETRIC.indexOf(target) < 0 && rand() < MIRROR_P;
        return {
            fam: fi, target: target, options: kit.shuffle(opts, rand), mirror: mirror,
            dir: rand() < 0.5 ? 1 : -1, spin: spinAt(level), spinMin: spinMinAt(level), slowS: slowAt(level), start: rand() * 360, strokes: FAMILIES[fi].s
        };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '火眼金睛！';
        if (n >= 15) return '高手！';
        if (n >= 8) return '不錯喔！';
        if (n >= 4) return '再接再厲！';
        return '多看幾次，筆畫就記住了！';
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

    var recent = [];                                /* 這一次遊戲最近用過的字群 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        if (level === 1) recent = [];
        var q = makeLevel(level, api.rand, recent);
        recent.push(q.fam);
        if (recent.length > RECENT_KEEP) recent.shift();
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        var limit = ansMs(level);
        console.log('[鏡中旋轉字] 第 ' + level + ' 關：' + q.target + '（約 ' + q.strokes + ' 劃，' + (q.mirror ? '鏡射' : '不鏡射') + '，' + (q.dir > 0 ? '順' : '逆') + '時針，起始 ' + q.spin.toFixed(0) + ' 度／秒，最慢 ' + q.spinMin.toFixed(0) + '，' + q.slowS.toFixed(1) + ' 秒降到最慢），選項 ' + q.options.join('') + '，限時 ' + limit + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var glyph = h('div', { 'class': 'glyphspin-glyph', text: q.target });
        var note = h('div', { 'class': 'glyphspin-note', text: q.mirror ? '字被左右鏡射了，還在轉！' : '字在轉！' });
        stage.appendChild(note); stage.appendChild(glyph);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var btns = q.options.map(function (c) {
            var b = h('button', { 'class': 'btn btn--line glyphspin-opt', text: c });
            kit.onTap(b, function () { judge(c); });    /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            return b;
        });
        stage.appendChild(h('div', { 'class': 'rx-btnrow glyphspin-opts' }, btns));
        var t0 = performance.now(), running = true;     /* performance.now()：高精度的時間（毫秒），計時用 */
        /* 字的方框固定是畫面寬度的 90%（.glyphspin-glyph），縮小靠 scale：最後縮到 10% ÷ 90% */
        function frame() {
            var ms = performance.now() - t0, k = sizeFrac(ms, limit) / (SIZE_PCT[0] / 100);
            glyph.style.transform = 'rotate(' + angleAt(q, ms).toFixed(2) + 'deg) scale(' + (q.mirror ? '-' : '') + k.toFixed(4) + ', ' + k.toFixed(4) + ')';
        }
        frame();
        var loop = api.my.loop(function () { if (!running || api.over) return false; frame(); });  /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
        api.timer(limit, function () { judge(null); }); /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(c) {
            if (api.over) return;
            running = false; loop.stop();
            glyph.style.transform = 'none'; glyph.textContent = q.target;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            note.textContent = '答案是「' + q.target + '」';
            btns.forEach(function (b) { if (b.textContent === q.target) b.classList.add('glyphspin-opt--ok'); else if (b.textContent === c) b.classList.add('glyphspin-opt--bad'); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (c === q.target) api.pass({ delay: 700 });  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            else api.fail({                             /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: 1900, lines: [
                    (c == null ? '時間到！' : '選錯了：你選「' + c + '」') + '，正確答案是「' + q.target + '」',
                    q.mirror ? '這一關的字被左右鏡射了' : '',
                    '相似的字：' + q.options.join('、')
                ].filter(function (x) { return x; })
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.target); };
        api.wrong = function () { judge(q.options.filter(function (c) { return c !== q.target; })[0]); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '鏡中旋轉字',
        rule: '畫面中央有一個大字，它會左右鏡射、**一直旋轉**，剛出現時轉得非常快，之後越轉越慢，但字也會越縮越小。下方有幾個長得很像的字，**點出「這個字原本是哪一個」**。答錯或來不及就結束，看你能過幾關。越後面的字筆劃越多！',
        mount: mount,
        score: SCORE,
        test: { spinAt: spinAt, spinMinAt: spinMinAt, slowAt: slowAt, speedAt: speedAt, angleAt: angleAt, sizeFrac: sizeFrac, optCount: optCount, ansMs: ansMs, strokeTarget: strokeTarget, makeLevel: makeLevel, rating: rating, FAMILIES: FAMILIES, SYMMETRIC: SYMMETRIC, MIRROR_P: MIRROR_P, FAMILY_MAX: FAMILY_MAX, RAMP_LEVELS: RAMP_LEVELS, MAX_LEVEL: MAX_LEVEL, SPIN: SPIN, SPIN_MIN: SPIN_MIN, SLOW_S: SLOW_S, ANS_S: ANS_S, SIZE_PCT: SIZE_PCT, OPT: OPT, STROKES: STROKES, STROKE_SPREAD: STROKE_SPREAD, RECENT_KEEP: RECENT_KEEP }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
