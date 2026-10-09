/* ═══════════════════════════════════════════════════════════════════
   reaction_kit.js — 秒反應新遊戲共用的小工具箱（Reaction.kit）
   ───────────────────────────────────────────────────────────────────
   · 這個檔案只放「好幾款遊戲都會用到、而且跟哪一款遊戲無關」的東西，載入順序在
     reaction_core.js 之後、各遊戲之前。舊的七款遊戲各自有自己的一份（svgEl／
     tweenViewBox 等），不動它們，避免影響已經穩定的遊戲。
   · 內容：
       kit.svg()          建 SVG 元素
       kit.ramp()         線性難度（start → end，不是等比例縮小）
       kit.rng()          可重現亂數（mulberry32）＋ pick／shuffle／randInt
       kit.sec()          毫秒 → 「X.XXXX」秒字串（畫面一律用秒，不用毫秒；小數 4 位）
       kit.round()        一局的「生命週期物件」：這一局排的計時器、動畫迴圈，
                          重開一局（dispose）時全部自動作廢，不會有上一局的計時器
                          殘留下來動到新的一局
       kit.tween()        動畫補間（rAF 為主，setTimeout 保底：分頁在背景時 rAF 會
                          被瀏覽器整個暫停，沒有保底就會卡死）
       kit.tweenViewBox() SVG 鏡頭推進（改 viewBox，向量永遠銳利）
       kit.result()       結算卡片（疊在遊戲畫面上）；data-sfx 讓 reaction.js 自動
                          播「過關／失敗」短旋律＋結算背景音樂；
                          帶 score（這一局的最終成績，要跟 Reaction.setBest 存的同一個數字）
                          就會在卡片出現之後自動送到這一款遊戲的世界排行榜
       kit.hold()         「按住／放開」輸入（切到背景一律視為放開）
       kit.pt()／kit.evT()  取得事件的邏輯座標／高精度時間
   ═══════════════════════════════════════════════════════════════════ */

/* 【新手導讀】這個檔案是所有「秒反應」遊戲共用的工具箱，用法都是 Reaction.kit.xxx（遊戲檔案開頭把它存成 var kit = Reaction.kit;）。學習順序建議：先看 kit.round（每一局的計時器管家，每款遊戲都用）、再看 kit.ramp（線性難度）、kit.result（結算畫面）。 */
(function (global) {
    'use strict';

    /* h：建立 HTML 元素的小工具 */
    var h = UI.h;
    /* SVG 元素必須用這個命名空間網址建立 */
    var SVGNS = 'http://www.w3.org/2000/svg';
    /* REDUCED：使用者在系統設定了「減少動態效果」就不播動畫 */
    var REDUCED = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    /* kit：要匯出的工具物件，下面把各個函式一個一個掛上去 */
    var kit = {};

    /* ─── SVG ─── */
    /* kit.svg：建立 SVG 元素（標籤、屬性、要放進哪個父元素） */
    kit.svg = function (tag, attrs, parent) {
        var el = document.createElementNS(SVGNS, tag);
        if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(el);
        return el;
    };

    /* 緩動函式：把進度 t（0～1）轉成「先快後慢」「先慢後快再慢」等不等速的進度，讓動畫看起來自然 */
    /* ─── 緩動 ─── */
    kit.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
    kit.easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    kit.easeInQuad = function (t) { return t * t; };
    kit.linear = function (t) { return t; };

    /* ─── 線性難度：第 level 關（從 1 起算）的值，從 start 線性走到 maxLevel 關的 end，
           之後維持 end。不用等比例縮小（乘 0.85 那種），那種前幾關降得快、後面幾乎不再變難。 ─── */
    /* 線性難度：第 level 關的值，從 start 平均走到第 maxLevel 關的 end，之後維持 end（不是乘 0.85 那種越來越難變的指數） */
    kit.ramp = function (level, start, end, maxLevel) {
        if (maxLevel <= 1) return end;
        var p = Math.min(1, Math.max(0, (level - 1) / (maxLevel - 1)));
        return start + (end - start) * p;
    };

    /* ─── 亂數 ─── */
    /* 可重現的亂數 mulberry32：給同一個種子就產生同一串「看起來隨機」的數字（測試時很有用） */
    kit.rng = function (seed) {
        var a = seed >>> 0;
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    };
    /* 真正隨機的種子（優先用 crypto） */
    /* 真正隨機的種子：優先用 crypto（密碼學等級亂數） */
    kit.newSeed = function () {
        try {
            var a = new Uint32Array(1);
            global.crypto.getRandomValues(a);
            return a[0];
        } catch (e) { return Math.floor(Math.random() * 4294967296); }
    };
    /* 用 rand（0～1 的函式，預設 Math.random）做的小工具：randInt 整數、randFloat 小數、pick 從陣列挑一個、shuffle 洗牌（Fisher–Yates 演算法） */
    /* 用 rand（0~1 的函式，預設 Math.random）做的小工具 */
    kit.randInt = function (a, b, rand) { return a + Math.floor((rand || Math.random)() * (b - a + 1)); };
    kit.randFloat = function (a, b, rand) { return a + (b - a) * (rand || Math.random)(); };
    kit.pick = function (arr, rand) { return arr[Math.floor((rand || Math.random)() * arr.length)]; };
    kit.shuffle = function (arr, rand) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor((rand || Math.random)() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    };

    /* 顯示格式：時間一律用「秒」X.XXXX（小數 4 位，原本是 3 位，見 note/世界排行榜說明.md 第 4 節） */
    /* ─── 顯示格式：時間一律用「秒」，X.XXXX ─── */
    /* 注意：這個函式只負責「照實格式化」。要當成績顯示的數字，要先用 Leaderboard.fake4() 產生一次最終成績（第 3、4 位不為 0），再格式化 */
    kit.sec = function (ms) { return (ms / 1000).toFixed(4); };
    kit.clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

    /* 事件座標（轉成 500×850 舞台座標）與高精度時間 */
    /* ─── 事件：邏輯座標（500×850 舞台）與高精度時間 ─── */
    kit.pt = function (e) { return Stage.toLogical(e.clientX, e.clientY); };
    /* e.timeStamp 跟 performance.now() 是同一個時間基準；合成事件或舊瀏覽器給怪值時退回 now */
    /* 事件時間：e.timeStamp 與 performance.now() 同一個時間基準；合成事件給怪值時退回現在時間 */
    kit.evT = function (e) {
        var now = performance.now();
        var t = e && e.timeStamp;
        return (t > 0 && t <= now + 50 && t > now - 60000) ? t : now;
    };

    /* 玩法說明彈窗是否開著（Dlg.rule，見 js/dialog.js） */
    kit.ruleOpen = function () {
        return !!(global.Dlg && Dlg.ruleOpen && Dlg.ruleOpen());
    };

    /* 【一局的生命週期】每款遊戲的 round() 開頭都 new 一個 kit.round()，所有計時器、動畫迴圈都從它身上排；重玩時呼叫舊的 dispose()，這一局排過的東西全部作廢（計時器清掉、迴圈停掉）。 */
    /* ═══ 一局的生命週期 ═══
       每一款遊戲的 round() 開頭 new 一個 kit.round()，所有計時器、迴圈都從它身上排；
       重開一局時呼叫舊的 dispose()，這一局排過的東西全部作廢（計時器清掉、迴圈停掉、
       還沒完成的 Promise 永遠不會 resolve，所以接在後面的 .then 也不會再執行）。 */
    /* r：這一局的管家物件：dead 是否已作廢、timers 排過的計時器、rafs 動畫迴圈、hooks 作廢時要做的事 */
    kit.round = function () {
        var r = { dead: false, timers: [], rafs: {}, hooks: [] };
        var rafSeq = 0;

        /* r.after(毫秒, 函式)：延遲執行，局已作廢就不執行 */
        r.after = function (ms, fn) {
            var id = global.setTimeout(function () { if (!r.dead) fn(); }, ms);
            r.timers.push(id);
            return id;
        };
        /* r.cancel：取消某個計時器 */
        r.cancel = function (id) { global.clearTimeout(id); };
        /* r.wait(毫秒)：回傳 Promise，到時間 resolve（可搭配 .then 串接） */
        r.wait = function (ms) {
            return new Promise(function (res) { r.after(ms, res); });
        };

        /* rAF 迴圈：fn(now, dt) 回傳 false 就停；dispose 也會停。dt 最多 50ms，避免分頁從背景回來時一次吃到很大的 dt 讓東西瞬間飛走 */
        /* rAF 迴圈：fn(now, dt) 回傳 false 就停；dispose 也會停。dt 最多 50ms，
           避免分頁從背景回來時一次吃到很大的 dt 讓東西瞬間飛走。 */
        r.loop = function (fn) {
            var last = null, my = ++rafSeq, handle = { stopped: false };
            function frame(now) {
                if (r.dead || handle.stopped) { delete r.rafs[my]; return; }
                var dt = last == null ? 16 : Math.min(50, now - last);
                last = now;
                if (fn(now, dt) === false) { handle.stopped = true; delete r.rafs[my]; return; }
                r.rafs[my] = global.requestAnimationFrame(frame);
            }
            r.rafs[my] = global.requestAnimationFrame(frame);
            handle.stop = function () {
                handle.stopped = true;
                if (r.rafs[my] != null) { global.cancelAnimationFrame(r.rafs[my]); delete r.rafs[my]; }
            };
            return handle;
        };

        /* 補間（tween）：duration 毫秒內 p 從 0 跑到 1，每影格呼叫 onFrame(eased p)。回傳 Promise；另有保底計時器，rAF 被暫停時時間到了直接跳到終點 */
        /* 補間：duration 毫秒內 p 從 0 跑到 1，每影格呼叫 onFrame(eased p)。
           回傳 Promise，跑完（或保底時間到）resolve。 */
        r.tween = function (duration, onFrame, ease) {
            ease = ease || kit.easeInOutCubic;
            return new Promise(function (resolve) {
                if (REDUCED || duration <= 0) { onFrame(1); resolve(); return; }
                var done = false;
                function finish() {
                    if (done) return;
                    done = true;
                    onFrame(1);
                    resolve();
                }
                var t0 = performance.now();
                var loop = r.loop(function (now) {
                    var p = Math.min(1, (now - t0) / duration);
                    onFrame(ease(p));
                    if (p >= 1) { finish(); return false; }
                });
                /* 保底：rAF 被暫停時，時間到了直接跳到終點 */
                r.after(duration + 400, function () { loop.stop(); finish(); });
            });
        };

        /* r.onDispose：登記「這局作廢時」要做的清理 */
        r.onDispose = function (fn) { r.hooks.push(fn); };
        /* r.dispose：作廢這一局：清掉所有計時器、停掉所有迴圈、執行清理函式 */
        r.dispose = function () {
            if (r.dead) return;
            r.dead = true;
            r.timers.forEach(function (id) { global.clearTimeout(id); });
            for (var k in r.rafs) global.cancelAnimationFrame(r.rafs[k]);
            r.hooks.forEach(function (fn) { try { fn(); } catch (e) { } });
        };
        return r;
    };

    /* SVG 鏡頭推進：改 viewBox 就是移動／放大「鏡頭」，向量圖永遠銳利 */
    /* ─── SVG 鏡頭推進 ─── */
    kit.setViewBox = function (svg, b) {
        svg.setAttribute('viewBox', b.vx + ' ' + b.vy + ' ' + b.vw + ' ' + b.vh);
    };
    /* 把 viewBox 從 from 補間到 to（r 是 kit.round()）；onFrame(box, p) 讓呼叫端
       跟著放大倍率調整其他東西（例如越放大越顯示更細的刻度） */
    /* 把 viewBox 從 from 補間到 to；onFrame(box, p) 讓呼叫端跟著放大倍率調整其他東西 */
    kit.tweenViewBox = function (r, svg, from, to, ms, ease, onFrame) {
        return r.tween(ms, function (e) {
            var b = {
                vx: from.vx + (to.vx - from.vx) * e,
                vy: from.vy + (to.vy - from.vy) * e,
                vw: from.vw + (to.vw - from.vw) * e,
                vh: from.vh + (to.vh - from.vh) * e
            };
            kit.setViewBox(svg, b);
            if (onFrame) onFrame(b, e);
        }, ease || kit.easeInOutCubic);
    };

    /* ═══ 結算彈窗（所有遊戲共用的公版）═══
       疊在遊戲畫面上，外框與卡片是彈窗公版（js/dialog.js 的 Dlg.open、css/dialog.css），
       所以寬度、暗底、字級、按鈕尺寸與顏色跟玩法說明、世界前 30 名完全一樣。
       內容由上到下：o.num 大數字、o.label 評語、o.lines 說明行、o.isNew 新紀錄、o.note 備註、o.extra 其他元素、
       按鈕（o.onAgain 再玩一次；o.resume 闖關失敗後從前幾關繼續）、最底下一顆「我有話要說」（打開意見彈窗，
       意見會連同這是哪一款遊戲一起存進資料庫）。
       o.score：這一局的最終成績——有給才會送世界排行榜（超出該遊戲 score.min～max 的成績，例如 0 關，
       Leaderboard.submit 會自己略過）。
       o.sfx：'win'（過關）／'fail'（失敗）／'perfect'／'neutral'——reaction.js 的 MutationObserver 看到 data-sfx
       就會自動播對應短旋律＋結算背景音樂；o.bgm === false 只播短旋律。
       o.dock：'top'／'bottom'——結算畫面需要讓玩家看到後面的「放大揭曉」（六點鐘方向、倒到八分滿、不可能任務、
       色不異空）時，彈窗改成貼在畫面上緣／下緣、背後不壓暗，按鈕併成一排，揭曉的畫面才不會被蓋住。
       回傳彈窗外框的 DOM 元素。 */
    kit.result = function (root, o) {
        var kids = [];
        if (o.num != null) kids.push(h('div', { 'class': 'rx-result__num', text: o.num }));
        if (o.label) kids.push(h('div', { 'class': 'rx-result__label', text: o.label }));
        (o.lines || []).forEach(function (t) { kids.push(h('div', { 'class': 'hint rx-result__line', text: t })); });
        if (o.isNew) kids.push(h('div', { 'class': 'hint hint--ok', text: '新紀錄！' }));
        if (o.note) kids.push(h('div', { 'class': 'hint rx-result__note', text: o.note }));
        (o.extra || []).forEach(function (n) { if (n) kids.push(n); });
        var btns = [];
        /* 闖關式遊戲失敗：預設從「失敗關卡的前 5 關」繼續，也可以從第 1 關重來；進度只存在這一頁的記憶體，回主選單再進來就是第 1 關 */
        if (o.resume && o.resume.level > 1 && o.onAgain) {
            /* 闖關式遊戲失敗：預設從「失敗關卡的前 RESUME_BACK 關」繼續，也可以從第 1 關重來。
               進度只存在這一頁的記憶體（closure）裡，回主選單再進來一律是第 1 關。 */
            btns.push({ text: '從第 ' + o.resume.level + ' 關繼續', kind: 'primary', onClick: function () { o.resume.run(); } });
            btns.push({ text: '從第 1 關重來', kind: 'line', onClick: function () { o.onAgain(); } });
        } else if (o.onAgain) {
            btns.push({ text: o.againText || '再挑戰一次', kind: 'primary', onClick: function () { o.onAgain(); } });
        }
        /* 最底下：我有話要說（keep：按了不關結算彈窗，意見彈窗疊在上面） */
        if (o.feedback !== false) {
            btns.push({
                html: UI.icon('chat') + '<span>我有話要說</span>', kind: 'line', cls: 'btn--sm dlg__feedback', keep: true,
                onClick: function () { if (global.Dlg && Dlg.feedback) Dlg.feedback(Reaction.current); }
            });
        }
        /* data-sfx 屬性讓 js/reaction.js 自動播過關／失敗的短旋律與結算背景音樂 */
        var attrs = { 'data-sfx': o.sfx || 'neutral' };
        if (o.bgm === false) attrs['data-bgm'] = '0';
        var ctl = Dlg.open({
            host: root, attrs: attrs, children: kids, buttons: btns,
            cls: 'dlg--result' + (o.dock ? ' dlg--dock dlg--dock-' + o.dock : ''),
            btnRow: !!o.dock && btns.length === 2
        });
        /* 世界排行榜：一定要等結算卡片「已經在畫面上」才送——排行榜靠畫面上有沒有結算卡片
           （Reaction.resultShowing）判斷玩家是不是還在看結果，太早送的話，進榜的恭喜就只剩小提示。 */
        if (o.score != null && global.Leaderboard && Reaction.current) global.Leaderboard.submit(Reaction.current, o.score);
        return ctl.el;
    };

    /* 按住／放開：down 在 pointerdown 呼叫，up 在放開時呼叫一次；分頁切到背景、視窗失焦一律視為放開 */
    /* ═══ 按住／放開 ═══
       down(e) 在 pointerdown 呼叫，up(e, reason) 在放開時呼叫一次（reason：
       'up'／'cancel'／'hidden'／'api'）。分頁切到背景、視窗失焦一律視為放開。 */
    kit.hold = function (el, o) {
        var holding = false;
        function up(e, reason) {
            if (!holding) return;
            holding = false;
            if (o.up) o.up(e, reason);
        }
        /* pointerdown：開始按住；setPointerCapture 讓手指移出元素外仍能收到放開事件 */
        el.addEventListener('pointerdown', function (e) {
            if (holding || (o.enabled && !o.enabled())) return;
            e.preventDefault();
            holding = true;
            try { el.setPointerCapture(e.pointerId); } catch (err) { }
            o.down(e);
        });
        el.addEventListener('pointerup', function (e) { up(e, 'up'); });
        el.addEventListener('pointercancel', function (e) { up(e, 'cancel'); });
        function onHidden() { if (document.hidden) up(null, 'hidden'); }
        function onBlur() { up(null, 'hidden'); }
        document.addEventListener('visibilitychange', onHidden);
        global.addEventListener('blur', onBlur);
        return {
            isHolding: function () { return holding; },
            release: function () { up(null, 'api'); },
            destroy: function () {
                document.removeEventListener('visibilitychange', onHidden);
                global.removeEventListener('blur', onBlur);
            }
        };
    };

    /* kit.meta：把「第 N 關」「最佳 …」這類字串用「・」接起來，空字串會被略過 */
    /* 回傳遊戲 id 專屬的 meta 文字小工具：把「第 N 關・最佳 …」這類字串接起來 */
    kit.meta = function (parts) { return parts.filter(function (p) { return p; }).join('・'); };

    /* 後來新增的小工具 */
    /* ─── 1.16.0 新增的小工具 ─── */
    /* kit.localPt：事件座標換成「某個元素左上角」為原點的邏輯 px（舞台縮放後也準） */
    /* 事件座標換成「某個元素左上角」為原點的邏輯 px（舞台縮放後也準） */
    kit.localPt = function (e, el) {
        var r = el.getBoundingClientRect();
        var a = Stage.toLogical(e.clientX, e.clientY), o = Stage.toLogical(r.left, r.top);
        return { x: a.x - o.x, y: a.y - o.y };
    };
    /* kit.timebar：時間條，set(0～1) 設定剩餘比例 */
    /* 時間條：回傳 { el, set(0~1) }，樣式沿用 .ld-time */
    kit.timebar = function (parent) {
        var fill = h('div', { 'class': 'ld-time__fill' });
        var bar = h('div', { 'class': 'ld-time' }, [fill]);
        if (parent) parent.appendChild(bar);
        return { el: bar, set: function (f) { fill.style.width = (100 * kit.clamp(f, 0, 1)).toFixed(1) + '%'; } };
    };
    /* 線性插值：t 從 0 到 1，結果從 a 走到 b */
    kit.lerp = function (a, b, t) { return a + (b - a) * t; };

    /* kit.resumeFrom：失敗後預設從「失敗關卡 − 5」繼續（最少第 1 關） */
    /* 闖關式遊戲失敗後，預設從「失敗關卡的前 RESUME_BACK 關」繼續（最少第 1 關）。
       進度只存在各遊戲頁面的記憶體裡，回主選單再進來就是第 1 關。 */
    kit.RESUME_BACK = 5;
    kit.resumeFrom = function (failLevel) { return Math.max(1, failLevel - kit.RESUME_BACK); };

    /* 匯出 REDUCED，並把 kit 掛到 Reaction 底下 */
    kit.REDUCED = REDUCED;
    Reaction.kit = kit;
})(window);
