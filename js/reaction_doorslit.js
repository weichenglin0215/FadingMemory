/* ═══════════════════════════════════════════════════════════════════
   reaction_doorslit.js — 秒反應・門縫偷看（企劃 331，依使用者的修改：白色方塊門縫）
   樣式：css/games/reaction_doorslit.css（這款專屬的 class 一律以「doorslit-」開頭；共用元件在 css/reaction_common.css）
   滿版的黑色大字（題目字），上面蓋著**兩片白色方塊**，兩片之間留一條窄縫，**縫裡只露出黑字的一小條**。
   兩片方塊**等速由左往右**移動，縫就從字的左邊掃到右邊——你只能透過門縫，一條一條看到經過的筆畫。掃過去之後，點出那是哪個字（四個選項）。
   ───────────────────────────────────────────────────────────────────
   · 門縫的位置：slitX(t) = −gap + v×t（t 是開始掃之後的秒數）。左方塊蓋住 [0, slitX]、右方塊蓋住 [slitX + gap, 寬]，只有縫裡 [slitX, slitX + gap] 看得到字。
     每一個橫向位置只會在縫裡出現 gap ÷ v 秒（縫 8px、速度 460px／秒就是只有 17 毫秒），大腦要自己把一條條拼成字（「縫隙視覺」）。
   · 題目與選項：題目字來自共用字庫（SimilarChars）的形近字群，選項是同一群的四個字（差別常常就在中間一小段）。
   · 難度（線性）：縫寬 60 → 8 px（GAP）、掃過的速度 300 → 460 px／秒（SPEED，「略增」）、字的平均筆劃範圍 4～10 → 10～22（STROKES：筆劃越多越難拼）、作答時間 8 → 5 秒（RESP_S）。
   · 揭曉：兩片方塊往兩邊打開，字整個露出來；答錯時，你選的字和正確的字比對，只有其中一個有的筆畫塗紅。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'doorslit'：選單、成績、存檔都靠它；樣式在 css/games/reaction_doorslit.css，裡面的 class 名稱一律以 doorslit- 開頭。 */
    'use strict';

    var ID = 'doorslit';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var GAP = [60, 8];                          /* 門縫的寬度（px）：第 1 關 → 到頂 */
    var SPEED = [300, 460];                     /* 門縫掃過的速度（px／秒）：第 1 關 → 到頂 */
    var STROKES_LO = [4, 10], STROKES_HI = [10, 22];   /* 題目字群的平均筆劃範圍（下限、上限）：第 1 關 → 到頂 */
    var RESP_S = [8, 5];                        /* 作答時間（秒）：第 1 關 → 到頂 */
    var N_OPT = 4;                              /* 選項數 */
    var LEAD_MS = 700;                          /* 開始後多久才開始掃 */
    var MIN_GROUP = 4;                              /* 「長得像的字」字群至少要幾個字才拿來出題 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function gapFor(level) { return Math.round(ramp(level, GAP)); }  /* Math.round：四捨五入成整數 */
    function speedFor(level) { return Math.round(ramp(level, SPEED)); }  /* Math.round：四捨五入成整數 */
    function respMs(level) { return Math.round(ramp(level, RESP_S) * 1000); }
    function strokeRange(level) { return [ramp(level, STROKES_LO), ramp(level, STROKES_HI)]; }
    /* 門縫左緣的位置（px，字的左邊緣是 0）：t 秒時 */
    function slitX(t, gap, speed) { return -gap + speed * t; }
    /* 掃完要多久（秒）：門縫左緣從 −gap 走到字的右邊緣 W */
    function sweepSeconds(W, gap, speed) { return (W + gap) / speed; }
    /* 字上某個橫向位置 x（0～W）會在縫裡出現多久（秒）：縫寬 ÷ 速度 */
    function exposureSeconds(gap, speed) { return gap / speed; }
    /* 出一關：{ answer, options（含答案、順序洗牌）, group（同一群的字）, answerIdx, gap, speed, strokes, respMs, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var rg = strokeRange(level), pool = SimilarChars.groups({ minSize: MIN_GROUP, minStrokes: rg[0], maxStrokes: rg[1] });
        if (!pool.length) pool = SimilarChars.groups({ minSize: MIN_GROUP });
        var g = kit.pick(pool, rand), answer = kit.pick(g.chars, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        var mates = g.chars.filter(function (c) { return c !== answer; }), take = kit.shuffle(mates.slice(0, Math.min(mates.length, N_OPT + 1)), rand).slice(0, N_OPT - 1);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        var options = kit.shuffle(take.concat([answer]), rand);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        return { answer: answer, options: options, answerIdx: options.indexOf(answer), group: g.chars, gap: gapFor(level), speed: speedFor(level), strokes: rg, respMs: respMs(level), level: level };  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
    }
    /* 兩個字的筆畫差異（像素比對），畫在 canvas 上：兩個字都有的筆畫是墨色、只有一個有的塗紅（需要瀏覽器的畫布） */
    function drawDiff(canvas, a, b, size) {
        var ctx = canvas.getContext('2d'); if (!ctx) return null;
        canvas.width = canvas.height = size;
        function mask(ch) { var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'); x.fillStyle = '#000'; x.font = '900 ' + Math.round(size * 0.82) + 'px "Noto Serif TC","Songti TC","PMingLiU",serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, size / 2, size / 2 + size * 0.04); return x.getImageData(0, 0, size, size).data; }
        var da = mask(a), db = mask(b), out = ctx.createImageData(size, size), o = out.data, diff = 0;
        for (var i = 0; i < size * size; i++) {
            var ia = da[i * 4 + 3] > 100, ib = db[i * 4 + 3] > 100;
            if (ia && ib) { o[i * 4] = 74; o[i * 4 + 1] = 59; o[i * 4 + 2] = 30; o[i * 4 + 3] = 255; }
            else if (ia || ib) { diff++; o[i * 4] = 226; o[i * 4 + 1] = 64; o[i * 4 + 2] = 48; o[i * 4 + 3] = 255; }
        }
        ctx.putImageData(out, 0, 0);
        return { diff: diff };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '火眼金睛！';
        if (n >= 10) return '縫裡也看得清楚！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '把一條一條的筆畫在腦中拼起來！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'doorslit-stage',
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
        console.log('[門縫偷看] 第 ' + level + ' 關：答案 ' + q.answer + '，選項 ' + q.options.join('') + '；縫寬 ' + q.gap + ' px、速度 ' + q.speed + ' px/秒；字群平均筆劃範圍 ' + q.strokes.map(function (x) { return x.toFixed(1); }).join('～'));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, BW = W - 24, BH = Math.min(BW, H - 320);
        var field = h('div', { 'class': 'doorslit-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note doorslit-tip', text: '從門縫偷看，是哪個字？' });
        field.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        /* 字盒：大大的黑字，上面蓋兩片白色方塊（左、右）；縫在兩片中間 */
        var box = h('div', { 'class': 'doorslit-box' }); box.style.cssText = 'left:12px;top:56px;width:' + BW + 'px;height:' + BH + 'px;';
        var glyph = h('div', { 'class': 'doorslit-glyph', text: q.answer }); glyph.style.fontSize = Math.round(Math.min(BW, BH) * 0.92) + 'px'; glyph.style.lineHeight = BH + 'px';
        var coverL = h('div', { 'class': 'doorslit-cover doorslit-cover--l' }), coverR = h('div', { 'class': 'doorslit-cover doorslit-cover--r' });
        box.appendChild(glyph); box.appendChild(coverL); box.appendChild(coverR); field.appendChild(box);
        var CW = BW + q.gap + 40;                                                           /* 方塊要夠寬：左方塊的右緣貼著縫、要一路蓋到字的左邊；右方塊的左緣貼著縫、要一路蓋到右邊 */
        coverL.style.width = CW + 'px'; coverR.style.width = CW + 'px';
        function setSlit(x) { coverL.style.transform = 'translateX(' + (x - CW).toFixed(1) + 'px)'; coverR.style.transform = 'translateX(' + (x + q.gap).toFixed(1) + 'px)'; }
        setSlit(-q.gap);                                                                   /* 一開始縫在字的左邊外面：整個字都蓋住 */
        var info = h('div', { 'class': 'qz-note doorslit-info', text: '' }); info.style.top = (56 + BH + 8) + 'px'; field.appendChild(info);
        var phase = 'sweep', done = false, grid = null, t0 = null, total = sweepSeconds(BW, q.gap, q.speed);
        api.after(LEAD_MS, function () {                /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            t0 = performance.now();                     /* performance.now()：高精度的時間（毫秒），計時用 */
            var loop = api.my.loop(function (now) {     /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
                if (!box.isConnected) return false;
                var t = (now - t0) / 1000, x = slitX(t, q.gap, q.speed);
                setSlit(Math.min(x, BW + q.gap));
                if (t >= total) { setSlit(BW + q.gap); ask(); return false; }
            });
        });
        function ask() {
            if (phase !== 'sweep') return;
            phase = 'ask'; tip.textContent = '剛才那個字是？'; /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            grid = kit.btnGrid(field, q.options.map(function (c, i) { return { text: c, kind: 'line', cls: 'doorslit-opt', onTap: function () { judge(i); } }; }), { cols: 2, h: 92, gap: 10 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
            api.timer(q.respMs, function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        }
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(i) {
            if (done || api.over || phase !== 'ask') return;
            done = true; phase = 'end';
            var ok = i === q.answerIdx;
            grid.btns[q.answerIdx].classList.add('doorslit-ok'); if (i >= 0 && !ok) grid.btns[i].classList.add('doorslit-bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            /* 揭曉：兩片白色方塊往兩邊打開，字整個露出來 */
            coverL.classList.add('doorslit-cover--open'); coverR.classList.add('doorslit-cover--open'); coverL.style.transform = 'translateX(-' + (CW + 20) + 'px)'; coverR.style.transform = 'translateX(' + (BW + 20) + 'px)';  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (ok) { info.textContent = '是「' + q.answer + '」，答對了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1500 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            info.textContent = '正確「' + q.answer + '」' + (i >= 0 ? '，你選「' + q.options[i] + '」（紅＝差異）' : '（時間到）');  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (i >= 0) {
                var sq = Math.min(BW, BH), cv = h('canvas', { 'class': 'doorslit-diff' }); cv.style.cssText = 'left:' + Math.round((BW - sq) / 2) + 'px;top:' + Math.round((BH - sq) / 2) + 'px;width:' + sq + 'px;height:' + sq + 'px;';
                api.after(450, function () { try { drawDiff(cv, q.answer, q.options[i], 240); box.appendChild(cv); glyph.style.visibility = 'hidden'; } catch (err) { } });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            }
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 3400, lines: ['正確的字是「' + q.answer + '」' + (i >= 0 ? '，你選了「' + q.options[i] + '」' : '（時間到）'), '選項：' + q.options.join('、')] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用：不等門縫掃完，直接進入作答（會被重複呼叫，ask／judge 都有防重複） */
        api.solve = function () { if (phase === 'sweep') ask(); if (phase === 'ask') judge(q.answerIdx); };
        api.wrong = function () { if (phase === 'sweep') ask(); if (phase === 'ask') judge((q.answerIdx + 1) % q.options.length); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '門縫偷看',
        rule: '一個滿版的黑色大字，上面蓋著兩片白色方塊，中間只留一條窄窄的縫。兩片方塊一起由左往右移動，縫就從字的左邊掃到右邊——**你只能透過門縫，一條一條看到經過的筆畫**。掃過去之後，**點出那是哪個字**（四個選項，全是長得很像的字，差別常常就在中間一小段）。大腦會自動把一條一條拼起來，試試看！答錯或來不及就結束，看你能過幾關。越後面，字的筆劃越多、縫越窄、掃得越快！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            gapFor: gapFor, speedFor: speedFor, respMs: respMs, strokeRange: strokeRange, slitX: slitX, sweepSeconds: sweepSeconds, exposureSeconds: exposureSeconds, makeLevel: makeLevel, drawDiff: drawDiff, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, GAP: GAP, SPEED: SPEED, STROKES_LO: STROKES_LO, STROKES_HI: STROKES_HI, RESP_S: RESP_S, N_OPT: N_OPT, LEAD_MS: LEAD_MS, MIN_GROUP: MIN_GROUP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
