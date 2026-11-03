/* ═══════════════════════════════════════════════════════════════════
   reaction_slicechar.js — 秒反應・切字（企劃 341）
   樣式：css/games/reaction_slicechar.css（這款專屬的 class 一律以「slicechar-」開頭；共用元件在 css/reaction_common.css）
   上方寫著目標字「己」。一個一個「寫著字的湯圓」像水果一樣拋上來，**只切「己」**，其他的字不要切。切錯、或漏掉一個「己」就結束。
   ───────────────────────────────────────────────────────────────────
   · 拋上來的其他字全是共用字庫（SimilarChars）裡目標字的**形近字**（己 → 已、巳、巴…），字在空中旋轉。
   · 出題（makeLevel）：挑一個字群（平均筆劃落在這一關的範圍內），其中一個字當目標、其餘當干擾。一共拋 F 顆，約 TARGET_FRAC 是目標字；
     一次拋 1～batchMax 顆（越後面一次拋越多，同一批的橫向位置彼此拉開）。
   · 飛行：每顆從畫面下方拋出，走拋物線（高度、飛行時間、橫向速度不同；flightPos／landTime），掉回畫面下方就算落地。
   · 切：手指在畫面上拖過湯圓（走過的線段碰到它的圓，segHitsCircle）。切到干擾字 → 馬上結束；目標字落地沒切 → 結束；所有字都處理完（切了或落地了）就過關。
   · 難度（線性）：拋出的字 8 → 30 顆（TOTAL）、間隔 1000 → 420 毫秒（SPAWN_MS）、一次拋 1 → 3 顆（BATCH）、字群的平均筆劃 3～8 → 12～22（STROKES）。
   · 結束時：把你切錯（或漏掉）的字和目標字並排，**差異的筆畫標紅**（兩個字用畫布畫出來比對像素）；切開時湯圓裂成兩半、字也裂成兩半。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'slicechar'：選單、成績、存檔都靠它；樣式在 css/games/reaction_slicechar.css，裡面的 class 名稱一律以 slicechar- 開頭。 */
    'use strict';

    var ID = 'slicechar';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var TOTAL = [8, 30];                        /* 這一關拋出的字總數：第 1 關 → 到頂 */
    var SPAWN_MS = [1000, 420];                 /* 每一批拋出的間隔（毫秒）：第 1 關 → 到頂 */
    var BATCH = [1, 3];                         /* 一次最多拋幾顆：第 1 關 → 到頂 */
    var TARGET_FRAC = 0.4;                      /* 拋出的字裡，目標字佔幾成 */
    var STROKES_LO = [3, 12], STROKES_HI = [8, 22];     /* 字群的平均筆劃範圍：第 1 關 → 到頂 */
    var LEAD_MS = 900;                          /* 開始後多久拋第一批 */
    var BOTTOM = 1.1, EXIT = 1.14;              /* 拋出的起點、掉到這裡算落地（畫面高度的倍數） */
    var APEX = [0.2, 0.5], T_APEX = [0.8, 1.0], X_RANGE = [0.14, 0.86];  /* APEX：拋出軌跡「最高點」的範圍；T_APEX：到達最高點的時間比例範圍；X_RANGE：起點 x 座標的範圍（占畫面寬度的比例） */
    var DUMP_PX = 76;                           /* 湯圓的大小（px） */
    var HIT_EXTRA = 8;                          /* 切到的判定半徑比湯圓多幾 px */
    var MIN_GROUP = 4;                              /* 「長得像的字」字群至少要幾個字才拿來出題 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function totalFor(level) { return Math.round(ramp(level, TOTAL)); }  /* Math.round：四捨五入成整數 */
    function spawnMsFor(level) { return Math.round(ramp(level, SPAWN_MS)); }  /* Math.round：四捨五入成整數 */
    function batchMaxFor(level) { return Math.max(1, Math.round(ramp(level, BATCH))); }
    function strokeRange(level) { return [ramp(level, STROKES_LO), ramp(level, STROKES_HI)]; }
    function flightPos(tz, t) { var g = 2 * (BOTTOM - tz.ya) / (tz.ta * tz.ta), vy0 = -g * tz.ta; return { x: tz.x0 + tz.vx * t, y: BOTTOM + vy0 * t + g * t * t / 2 }; }
    function landTime(tz) { var g = 2 * (BOTTOM - tz.ya) / (tz.ta * tz.ta), vy0 = -g * tz.ta, c = BOTTOM - EXIT; return (-vy0 + Math.sqrt(vy0 * vy0 - 2 * g * c)) / g; }  /* Math.sqrt：開根號（算兩點距離時常用：勾股定理） */
    function segHitsCircle(ax, ay, bx, by, cx, cy, r) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 < 1e-12 ? 0 : kit.clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1);  /* kit.clamp(值, 最小, 最大)：把數值限制在範圍內（太小就取最小、太大就取最大） */
        return Math.hypot(ax + t * dx - cx, ay + t * dy - cy) <= r;
    }
    /* 出一關：{ target, mates（干擾字候選）, group, total, tosses（[{ t, ch, onTarget, x0, vx, ya, ta, spin }]）, spawnMs, strokes, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var rg = strokeRange(level), pool = SimilarChars.groups({ minSize: MIN_GROUP, minStrokes: rg[0], maxStrokes: rg[1] });
        if (!pool.length) pool = SimilarChars.groups({ minSize: MIN_GROUP });
        var g = kit.pick(pool, rand), target = kit.pick(g.chars, rand), mates = g.chars.filter(function (c) { return c !== target; });  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        var F = totalFor(level), nT = Math.max(3, Math.round(F * TARGET_FRAC)), list = [], i;
        for (i = 0; i < nT; i++) list.push({ ch: target, onTarget: true });
        for (i = nT; i < F; i++) list.push({ ch: mates[(i - nT) % mates.length], onTarget: false });
        list = kit.shuffle(list, rand);                 /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        var spawn = spawnMsFor(level), bmax = batchMaxFor(level), t = LEAD_MS, tosses = [], idx = 0;
        while (idx < list.length) {
            var b = Math.min(list.length - idx, kit.randInt(1, bmax, rand)), xs = [];  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            for (i = 0; i < b; i++) {
                var x0 = kit.randFloat(X_RANGE[0], X_RANGE[1], rand), guard = 0;  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
                while (xs.some(function (x) { return Math.abs(x - x0) < 0.2; }) && guard++ < 30) x0 = kit.randFloat(X_RANGE[0], X_RANGE[1], rand);  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
                xs.push(x0);
                var it = list[idx++];
                tosses.push({ t: Math.round(t + i * 140), ch: it.ch, onTarget: it.onTarget, x0: x0, vx: (0.5 - x0) * kit.randFloat(0.05, 0.3, rand), ya: kit.randFloat(APEX[0], APEX[1], rand), ta: kit.randFloat(T_APEX[0], T_APEX[1], rand), spin: kit.randFloat(-220, 220, rand) });  /* kit.randFloat(最小, 最大, rand)：隨機小數 */
            }
            t += spawn * b * kit.randFloat(0.85, 1.15, rand);                       /* 一次拋越多顆，下一批隔越久（整體密度才不會爆掉） */
        }
        return { target: target, mates: mates, group: g.chars, total: F, tosses: tosses, spawnMs: spawn, batchMax: bmax, strokes: rg, level: level };
    }
    /* 兩個字的筆畫差異（像素比對）畫在 canvas 上：兩個字都有的筆畫是墨色、只有一個有的塗紅 */
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
        if (n >= 15) return '切字高手！';
        if (n >= 10) return '眼明手快！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '只切一模一樣的那個字！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'slicechar-stage',
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
        var q = makeLevel(level, api.rand), F = q.total;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[切字] 第 ' + level + ' 關：目標「' + q.target + '」，干擾 ' + q.mates.join('') + '；拋 ' + F + ' 顆（目標 ' + q.tosses.filter(function (t) { return t.onTarget; }).length + ' 顆），一批最多 ' + q.batchMax + ' 顆，間隔約 ' + q.spawnMs + ' 毫秒');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var field = h('div', { 'class': 'slicechar-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var goal = h('div', { 'class': 'slicechar-goal' }, [h('span', { 'class': 'slicechar-goal__t', text: '只切：' }), h('span', { 'class': 'slicechar-goal__ch', text: q.target })]);
        field.appendChild(goal);                        /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var counter = h('div', { 'class': 'slicechar-counter', text: '0／' + F }); field.appendChild(counter);
        var info = h('div', { 'class': 'qz-note slicechar-info', text: '' }); field.appendChild(info);
        var arena = h('div', { 'class': 'slicechar-arena' }); field.appendChild(arena);

        var resolved = 0, flying = [], halted = false, lastP = null, down = false, over = false;
        q.tosses.forEach(function (tz) { api.after(tz.t, function () { launch(tz); }); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
        if (level === 1 && kit.once('slicechar.hint')) api.after(LEAD_MS + 600, function () { if (!over) kit.hintOn(stage, null, { mode: 'drag', x: W * 0.3, y: H * 0.55, dx: W * 0.4, dy: -40, text: '只切目標字' }); });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        function launch(tz) {
            if (halted || api.over) return;
            var el = h('div', { 'class': 'slicechar-dump' }, [h('div', { 'class': 'slicechar-dump__ch', text: tz.ch })]);
            el.style.width = el.style.height = DUMP_PX + 'px'; el.style.lineHeight = DUMP_PX + 'px'; el.firstChild.style.fontSize = Math.round(DUMP_PX * 0.66) + 'px';
            arena.appendChild(el);
            flying.push({ tz: tz, el: el, t: 0, cut: false, lt: landTime(tz) });
        }
        api.my.loop(function (now, dt) {                /* my.loop(函式)：每個畫面更新（約每秒 60 次）就執行一次函式；函式回傳 false 就停止 */
            if (!arena.isConnected) return false;
            if (halted) return;
            var d = Math.min(dt, 50) / 1000;
            for (var i = flying.length - 1; i >= 0; i--) {
                var f = flying[i]; if (f.cut) continue;
                f.t += d;
                var p = flightPos(f.tz, f.t);
                f.px = p.x * W; f.py = p.y * H;
                f.el.style.transform = 'translate(' + (f.px - DUMP_PX / 2).toFixed(1) + 'px,' + (f.py - DUMP_PX / 2).toFixed(1) + 'px) rotate(' + (f.tz.spin * f.t).toFixed(1) + 'deg)';
                if (f.t >= f.lt) {
                    flying.splice(i, 1); f.el.remove();
                    if (f.tz.onTarget) { missed(f); return; }
                    resolve();
                }
            }
        });
        function resolve() {
            resolved++; counter.textContent = resolved + '／' + F;  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (resolved >= F && !over) { over = true; info.textContent = '全部處理完了！'; kit.flash(stage, true, api.my); api.pass({ delay: 1100 }); }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
        }
        arena.addEventListener('pointerdown', function (e) { if (over) return; e.preventDefault(); try { arena.setPointerCapture(e.pointerId); } catch (err) { } var p = kit.localPt(e, arena); lastP = p; down = true; sliceSeg(p, p); });  /* preventDefault：取消瀏覽器的預設動作（例如拖曳時的捲動、文字選取） */
        arena.addEventListener('pointermove', function (e) { if (!down || over) return; var p = kit.localPt(e, arena); sliceSeg(lastP, p); lastP = p; });  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
        function endDrag() { down = false; lastP = null; }
        arena.addEventListener('pointerup', endDrag); arena.addEventListener('pointercancel', endDrag);  /* 指標事件（pointer）：手指與滑鼠通用，分成按下、移動、放開三種 */
        function sliceSeg(a, b) {
            for (var i = flying.length - 1; i >= 0 && !over; i--) {
                var f = flying[i]; if (f.cut || f.px == null) continue;
                if (segHitsCircle(a.x, a.y, b.x, b.y, f.px, f.py, DUMP_PX / 2 + HIT_EXTRA)) cut(f, i, a, b);
            }
        }
        /* 切開：湯圓裂成兩半、字也裂成兩半；切到干擾字 → 結束 */
        function cut(f, idx, a, b) {
            f.cut = true; flying.splice(idx, 1);
            var el = f.el;
            [['left', -1], ['right', 1]].forEach(function (half) {  /* forEach：對陣列的每個元素各做一次 */
                var c = el.cloneNode(true); c.className = 'slicechar-half slicechar-half--' + half[0]; c.style.transform = el.style.transform; c.style.setProperty('--dir', half[1]);  /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
                arena.appendChild(c); api.after(650, function () { c.remove(); });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            });
            el.remove(); Sfx.play('pop');               /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            if (!f.tz.onTarget) { wrong(f); return; }
            resolve();
        }
        /* 失敗：停住畫面，把目標字和你切錯（漏掉）的字並排，差異的筆畫標紅 */
        function compare(badCh, missedFlag) {
            halted = true; over = true;
            var box = h('div', { 'class': 'slicechar-cmp' });
            var l = h('div', { 'class': 'slicechar-cmp__box' }, [h('div', { 'class': 'slicechar-cmp__t', text: '目標字' }), h('div', { 'class': 'slicechar-cmp__big', text: q.target })]);
            box.appendChild(l);
            if (!missedFlag) {
                var cv = h('canvas', { 'class': 'slicechar-cmp__cv' }), r = h('div', { 'class': 'slicechar-cmp__box slicechar-cmp__box--bad' }, [h('div', { 'class': 'slicechar-cmp__t', text: '你切了（紅＝差異）' }), cv]);
                box.appendChild(r); field.appendChild(box); try { drawDiff(cv, q.target, badCh, 150); } catch (err) { }
            } else { box.appendChild(h('div', { 'class': 'slicechar-cmp__box slicechar-cmp__box--bad' }, [h('div', { 'class': 'slicechar-cmp__t', text: '漏掉了' }), h('div', { 'class': 'slicechar-cmp__big', text: q.target })])); field.appendChild(box); }
        }
        function wrong(f) {
            info.textContent = '「' + f.tz.ch + '」不是目標字「' + q.target + '」！';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            compare(f.tz.ch, false); kit.flash(stage, false, api.my);  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({ delay: 3600, lines: ['你切了「' + f.tz.ch + '」，目標字是「' + q.target + '」', '形近字：' + q.group.join('、')] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        function missed(f) {
            info.textContent = '漏掉了一個「' + q.target + '」！';
            compare(null, true); kit.flash(stage, false, api.my);
            api.fail({ delay: 3400, lines: ['漏掉了一個目標字「' + q.target + '」', '形近字：' + q.group.join('、')] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 驗證用（會被重複呼叫，要冪等）：solve＝切掉所有在空中的目標字、wrong＝切第一個在空中的干擾字 */
        api.solve = function () {
            if (over) return;
            for (var i = flying.length - 1; i >= 0; i--) { var f = flying[i]; if (f.tz.onTarget && !f.cut && f.px != null) cut(f, i, { x: f.px - 20, y: f.py }, { x: f.px + 20, y: f.py }); }
        };
        api.wrong = function () {
            if (over) return;
            for (var i = flying.length - 1; i >= 0; i--) { var f = flying[i]; if (!f.tz.onTarget && !f.cut && f.px != null) { cut(f, i, { x: f.px - 20, y: f.py }, { x: f.px + 20, y: f.py }); return; } }
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '切字',
        rule: '上方寫著目標字。一個一個寫著字的湯圓像水果一樣拋上來，**用手指切過去，只切目標字**，其他的字不要切。**切錯一顆**、或**漏掉一顆目標字**，就結束。小心：拋上來的其他字全是目標字的形近字（像「己」配「已、巳、巴」），字在空中還會旋轉。結束時會把你切錯的字和目標字並排，**不一樣的筆畫標紅**。越後面，一次拋上來的字越多、筆劃越多、拋得越快！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            totalFor: totalFor, spawnMsFor: spawnMsFor, batchMaxFor: batchMaxFor, strokeRange: strokeRange, flightPos: flightPos, landTime: landTime, segHitsCircle: segHitsCircle, makeLevel: makeLevel, drawDiff: drawDiff, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, TOTAL: TOTAL, SPAWN_MS: SPAWN_MS, BATCH: BATCH, TARGET_FRAC: TARGET_FRAC, STROKES_LO: STROKES_LO, STROKES_HI: STROKES_HI, LEAD_MS: LEAD_MS, BOTTOM: BOTTOM, EXIT: EXIT, APEX: APEX, T_APEX: T_APEX, X_RANGE: X_RANGE, DUMP_PX: DUMP_PX, MIN_GROUP: MIN_GROUP, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
