/* ═══════════════════════════════════════════════════════════════════
   reaction_countbills.js — 秒反應・數鈔票（企劃 375）
   樣式：css/games/reaction_countbills.css（這款專屬的 class 一律以「countbills-」開頭；共用元件在 css/reaction_common.css）
   銀行櫃台的點鈔。一疊鈔票（面額 100、500、1000 元混在一起，順序打亂）。上方寫「數出 3700 元」。
   **每點一下，最上面那張鈔票就撥到右邊**（撥出去的那一疊只看得到最上面一張，要邊撥邊心算）。
   你覺得撥出去的剛好是目標金額，就按「好了」。**剛好才過關**；撥多了、撥少了、時間到都算失敗。
   ───────────────────────────────────────────────────────────────────
   · 一疊鈔票（makeLevel）：先決定「要撥幾張」n，從面額表隨機抽 n 張，目標金額＝這 n 張的總和；後面再多放 EXTRA 張（撥過頭的）。
     因為每張都是正數，「從上面撥 k 張的總和」一直在變大，所以**只有撥到第 n 張的時候總和剛好是目標**——保證有解、而且解唯一（沒有別的撥法剛好也湊到）。
     n 張裡至少有 2 種不同面額（不會全是同一種）。
   · 難度（線性，到 RAMP_LEVELS 關到頂）：要撥的張數 4 → 14、限時 15 → 8 秒；
     第 10 關起面額表加入 200 和 2000（顏色跟 100、1000 很接近，一不注意就加錯）。
   · 鈔票用顏色加大數字分面額（不仿真鈔）：只寫面額和簡單的花紋。
   · 揭曉：撥出去的鈔票全部攤開，一張一張累加：「3800 元，多了 100」；撥到第 n 張（剛好那張）標綠色、多撥的標紅色；撥少了就顯示下一張是什麼。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'countbills'：選單、成績、存檔都靠它；樣式在 css/games/reaction_countbills.css，裡面的 class 名稱一律以 countbills- 開頭。 */
    'use strict';

    var ID = 'countbills';                              /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var COUNT = [4, 14];                        /* 要撥幾張才是目標：第 1 關 → 到頂（四捨五入） */
    var TIME_S = [15, 8];                       /* 限時（秒）：第 1 關 → 到頂 */
    var EXTRA = [4, 6];                         /* 目標之後再多放幾張（撥過頭用的，隨機） */
    var DENOMS_BASE = [100, 500, 1000];         /* 一開始的面額 */
    var DENOMS_LATER = [100, 200, 500, 1000, 2000];   /* 第 LATER_FROM 關起的面額（多了 200 和 2000） */
    var LATER_FROM = 10;                            /* 第幾關起改用後面那組面額（DENOMS_LATER） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function countFor(level) { return Math.round(ramp(level, COUNT)); }  /* Math.round：四捨五入成整數 */
    function timeMs(level) { return Math.round(ramp(level, TIME_S) * 1000); }  /* Math.round：四捨五入成整數 */
    function denomsFor(level) { return level >= LATER_FROM ? DENOMS_LATER : DENOMS_BASE; }
    /* 撥出去前 k 張的總和 */
    function sumFirst(notes, k) { var s = 0; for (var i = 0; i < k && i < notes.length; i++) s += notes[i]; return s; }
    /* 出一關：{ level, notes（整疊鈔票從上到下的面額）, n（撥幾張剛好）, target（目標金額）, extra, time（限時毫秒）, denoms（這一關的面額表）} */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var n = countFor(level), denoms = denomsFor(level), extra = kit.randInt(EXTRA[0], EXTRA[1], rand), notes = [], i;  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        for (var tr = 0; tr < 100; tr++) {
            notes = []; for (i = 0; i < n; i++) notes.push(kit.pick(denoms, rand));  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            if (new Set(notes).size >= 2) break;                                   /* 至少 2 種不同面額 */
        }
        if (new Set(notes).size < 2) notes[n - 1] = denoms[0] === notes[0] ? denoms[1] : denoms[0];
        var target = sumFirst(notes, n);
        for (i = 0; i < extra; i++) notes.push(kit.pick(denoms, rand));  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        return { level: level, notes: notes, n: n, target: target, extra: extra, time: timeMs(level), denoms: denoms };
    }
    /* 撥了 taken 張的判定：{ sum, result: 'ok'｜'few'｜'many', diff（sum − target）} */
    function judge(q, taken) {
        var s = sumFirst(q.notes, taken);
        return { sum: s, result: s === q.target ? 'ok' : (s < q.target ? 'few' : 'many'), diff: s - q.target };
    }
    function whyText(r, q) {
        if (r.result === 'ok') return '剛剛好 ' + q.target + ' 元！';
        if (r.result === 'few') return '撥了 ' + r.sum + ' 元，目標 ' + q.target + ' 元——少了 ' + (-r.diff) + ' 元';
        return '撥了 ' + r.sum + ' 元，目標 ' + q.target + ' 元——多了 ' + r.diff + ' 元';
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 15) return '點鈔達人！';
        if (n >= 9) return '心算很快！';
        if (n >= 5) return '不錯喔！';
        if (n >= 2) return '再接再厲！';
        return '邊撥邊加！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'countbills-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 一張鈔票（div）：底色依面額（CSS class countbills-d100…）、中間大大的面額、四個角落小字與花紋 */
    function noteEl(v, cls) {
        var el = h('div', { 'class': 'countbills-note countbills-d' + v + (cls ? ' ' + cls : '') });
        el.appendChild(h('div', { 'class': 'countbills-note__c countbills-note__c--l', text: String(v) }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        el.appendChild(h('div', { 'class': 'countbills-note__c countbills-note__c--r', text: String(v) }));  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        el.appendChild(h('div', { 'class': 'countbills-note__v', text: String(v) }));
        el.appendChild(h('div', { 'class': 'countbills-note__p' }));
        return el;
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makeLevel(level, api.rand);
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[數鈔票] 第 ' + level + ' 關：目標 ' + q.target + ' 元＝前 ' + q.n + ' 張（' + q.notes.slice(0, q.n).join('+') + '）；整疊 ' + q.notes.length + ' 張；限時 ' + q.time + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var NW = Math.min(210, Math.round((W - 60) / 2)), NH = Math.round(NW * 0.52), top0 = 130;
        var field = h('div', { 'class': 'countbills-field' });
        stage.appendChild(field);
        var goal = h('div', { 'class': 'countbills-goal' });
        goal.appendChild(h('span', { 'class': 'countbills-goal__t', text: '數出 ' })); goal.appendChild(h('span', { 'class': 'countbills-goal__n', text: String(q.target) })); goal.appendChild(h('span', { 'class': 'countbills-goal__t', text: ' 元' }));
        field.appendChild(goal);
        var lab1 = h('div', { 'class': 'countbills-lab', text: '點一下撥一張' }), lab2 = h('div', { 'class': 'countbills-lab', text: '撥出去的' });
        lab1.style.cssText = 'left:20px;top:' + (top0 - 38) + 'px;width:' + NW + 'px;'; lab2.style.cssText = 'right:20px;top:' + (top0 - 38) + 'px;width:' + NW + 'px;'; field.appendChild(lab1); field.appendChild(lab2);
        /* 整疊鈔票（全部先放好，用 class 控制在「疊上」還是「撥出去」） */
        var table = h('div', { 'class': 'countbills-table' }); table.style.cssText = 'top:' + top0 + 'px;height:' + (NH + 40) + 'px;'; field.appendChild(table);
        var els = q.notes.map(function (v, i) { var el = noteEl(v, ''); el.style.cssText = 'width:' + NW + 'px;height:' + NH + 'px;'; table.appendChild(el); return el; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        var taken = 0, phase = 'play';
        /* 排位置：每張鈔票都用 transform 擺在「疊上（左邊）」或「撥出去（右邊）」；
           疊上只畫最上面 3 張（越下面越暗、偏下一點）；撥出去只畫最後撥的 3 張（歪一點點）——其他的藏在底下看不到 */
        function layout() {
            els.forEach(function (el, i) {              /* forEach：對陣列的每個元素各做一次 */
                var out = i < taken, depth = out ? (taken - 1 - i) : (i - taken);               /* 疊上：離最上面幾張；撥出去：離最後撥的那張幾張 */
                if (depth > 2) { el.style.display = 'none'; return; }
                el.style.display = 'block'; el.style.zIndex = String(10 - depth);
                var x = out ? W - 20 - NW : 20, rot = out ? [3, -4, 5][depth] : 0, dy = depth * 6;
                el.style.transform = 'translate(' + x + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
                el.classList.toggle('countbills-note--out', out); el.classList.toggle('countbills-note--under', !out && depth > 0);  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            });
        }
        layout();
        var info = h('div', { 'class': 'qz-note countbills-info', text: level === 1 ? '算好了就按「好了」，多了少了都不行！' : '邊撥邊心算，剛好就按「好了」' }); info.style.top = (top0 + NH + 56) + 'px'; field.appendChild(info);
        var btn = kit.btnGrid(field, [{ text: '好了！', kind: 'primary', cls: 'countbills-btn', onTap: function () { done('done'); } }], { cols: 1, h: 96, bottom: 12 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        if (level === 1 && kit.once('countbills.hint')) kit.hintOn(stage, null, { mode: 'tap', x: 20 + NW / 2, y: top0 + NH / 2, delay: 700, text: '點一下，最上面那張就撥出去' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        /* 撥一張：點「疊上」的區域（整個桌面都可以點，手指比較好點） */
        table.addEventListener('pointerdown', function (e) {  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
            if (phase !== 'play' || api.over) return;
            e.preventDefault();                         /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
            if (taken >= q.notes.length) return;
            taken++; layout(); Sfx.play('tick');        /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
        });
        api.timer(q.time, function () { done('timeout'); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */

        /* 按「好了」（或時間到）：把撥出去的鈔票攤開，一張一張累加 */
        function done(kind) {
            if (phase !== 'play' || api.over) return;
            phase = 'end'; api.stopTimer();
            var r = judge(q, taken), why = (kind === 'timeout' ? '時間到！' : '') + whyText(r, q);
            btn.btns[0].classList.add('countbills-btn--off');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            table.style.display = 'none'; lab1.style.display = 'none'; lab2.style.display = 'none';
            showSpread(r);
            info.textContent = why; info.style.top = ''; info.style.bottom = '124px';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (r.result === 'ok') { info.classList.add('countbills-info--ok'); kit.flash(stage, true, api.my); Sfx.play('ok'); api.pass({ delay: 2200 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            info.classList.add('countbills-info--bad'); kit.flash(stage, false, api.my);  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 4200, lines: [why, '前 ' + q.n + ' 張是 ' + q.notes.slice(0, q.n).join('＋') + ' ＝ ' + q.target + ' 元', '你撥了 ' + taken + ' 張：' + (taken ? q.notes.slice(0, taken).join('＋') : '（沒撥）') + ' ＝ ' + r.sum + ' 元'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 攤開：每張一個小格，下面寫累加的總和；剛好湊到目標的那張標綠、多撥的標紅；撥少了就多顯示下一張（灰色） */
        function showSpread(r) {
            var box = h('div', { 'class': 'countbills-spread' }); box.style.top = '110px';
            var show = Math.max(taken, 0), cols = 4, cw = Math.floor((W - 24 - (cols - 1) * 8) / cols), nh = Math.round(cw * 0.52), run = 0, count = show + (r.result === 'few' ? 1 : 0);  /* Math.floor：無條件捨去成整數 */
            if (!show) box.appendChild(h('div', { 'class': 'countbills-spread__none', text: '一張都沒撥' }));
            for (var i = 0; i < count; i++) {
                var v = q.notes[i], cell = h('div', { 'class': 'countbills-cell' }), ghost = i >= taken;
                if (!ghost) run += v;
                var m = noteEl(v, 'countbills-note--mini' + (ghost ? ' countbills-note--ghost' : '') + (!ghost && i === q.n - 1 ? ' countbills-note--hit' : '') + (!ghost && i >= q.n ? ' countbills-note--extra' : ''));
                m.style.cssText = 'position:relative;width:' + cw + 'px;height:' + nh + 'px;'; cell.style.width = cw + 'px';
                cell.appendChild(m); cell.appendChild(h('div', { 'class': 'countbills-cell__s' + (ghost ? ' countbills-cell__s--ghost' : ''), text: ghost ? '下一張' : String(run) })); box.appendChild(cell);
            }
            field.appendChild(box);
        }
        /* 驗證用：撥 n 張再按好了（solve）／少撥一張再按好了（wrong）；只排一次 */
        var armed = false;
        function run(cnt) { armed = true; for (var i = 0; i < cnt; i++) (function (k) { api.after(60 + k * 90, function () { if (phase === 'play') { taken++; layout(); } }); })(i); api.after(60 + cnt * 90 + 80, function () { done('done'); }); }  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { if (!armed && phase === 'play') run(q.n); };
        api.wrong = function () { if (!armed && phase === 'play') run(q.n - 1); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '數鈔票',
        rule: '一疊鈔票，面額 100、500、1000 元混在一起，順序打亂。上面寫著**目標金額**（例如「數出 3700 元」）。**每點一下，最上面那張鈔票就撥到右邊**，要邊撥邊心算。你覺得撥出去的剛好是目標金額，就**按「好了」**。多了、少了、時間到都失敗；撥過頭不能回頭。**第 10 關起加入 200 元和 2000 元**，顏色很接近，小心加錯！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            countFor: countFor, timeMs: timeMs, denomsFor: denomsFor, sumFirst: sumFirst, makeLevel: makeLevel, judge: judge, whyText: whyText, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, COUNT: COUNT, TIME_S: TIME_S, EXTRA: EXTRA, DENOMS_BASE: DENOMS_BASE, DENOMS_LATER: DENOMS_LATER, LATER_FROM: LATER_FROM, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
