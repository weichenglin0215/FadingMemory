/* ═══════════════════════════════════════════════════════════════════
   reaction_mixcolor.js — 秒反應・混出什麼色（原企劃「099 混出什麼色」的復活版）
   樣式：css/games/reaction_mixcolor.css（這款專屬的 class 一律以「mixcolor-」開頭；共用元件在 css/reaction_common.css）
   介面跟「色不異空」很像：上方左右兩個色塊，中間隔著一條黑色長方形。左邊是目標顏色（不變）；
   右邊是你要調出來的顏色：下方有三對六顆按鈕，分別控制右邊色塊的紅、綠、藍：
       左邊一對：亮紅「＋」（按住增加紅色）、暗紅「－」（按住減少紅色）
       中間一對：亮綠「＋」／暗綠「－」控制綠色
       右邊一對：亮藍「＋」／暗藍「－」控制藍色
   最下方「確定」：兩個色塊靠在一起，告訴你「顏色差異度」（跟色不異空同一把尺：CIE L*a*b* 的 ΔE，
   0％＝一模一樣、黑白＝100％）。單回合、一次機會，成績＝差異度（越小越好，追求 0.0000％）。
   ───────────────────────────────────────────────────────────────────
   · 不顯示任何數字，只能靠眼睛比。右邊色塊一開始的顏色離目標至少 START_MIN（ΔE）。
   · 按住：一按下去就先增減 1；按住越久變得越快（每秒 RATE[0] → RATE[1] 單位，RAMP_S 秒內線性加快，
     所以細調很容易、大調也不會太慢）。可以同時按好幾顆（多指）。
   · 紅綠藍各 0～255，用畫面上實際顯示的（四捨五入後）顏色算差異度，所以可以真的剛好 0.0000％。
   · 計時與判定一律用 performance.now()，不依賴 rAF（rAF 被暫停時有備援計時器）。
   · 防誤觸「確定」：「確定」按下去就結算（單回合、不能反悔），而且它緊貼在下排「－」按鈕的下面，手指點「－」的時候稍微滑到下緣、或放開時
     碰到它，就會變成「才按一下 ＋／－ 遊戲就結束了」。所以：①「確定」跟按鈕之間隔開一段距離（css/games/reaction_mixcolor.css 的 .mixcolor-ok）；
     ②只要有任何一顆 ＋／－ 還按著、或是剛放開不到 OK_GUARD_MS（0.3 秒），按「確定」都不算。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'mixcolor'：選單、成績、存檔都靠它；樣式在 css/games/reaction_mixcolor.css，裡面的 class 名稱一律以 mixcolor- 開頭。 */
    'use strict';

    var ID = 'mixcolor';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'min', decimals: 4, format: '{v}%', label: '差異度', min: 0, max: 300 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var GAP_PX = 100;                           /* 兩個色塊中間黑色長方形的寬度（跟色不異空一樣） */
    var CLOSE_MS = 500;                         /* 按「確定」後兩個色塊靠攏的時間 */
    var RATE = [28, 150];                       /* 按住時每秒變化多少單位（0～255）：剛按下 → 按住 RAMP_S 秒之後 */
    var RAMP_S = 1.4;                               /* 按住按鈕時，變化速度從「剛按下」加快到「最快」所花的秒數（速度範圍見上面的 RATE） */
    var OK_GUARD_MS = 300;                      /* 放開 ＋／－ 之後這麼久之內，按「確定」不算（防止手指滑到、碰到而誤觸） */
    var START_MIN = 30;                         /* 右邊色塊一開始離目標至少多遠（差異度 ΔE） */
    var TARGET_RANGE = [40, 215];               /* 目標顏色每個頻道的範圍（避免太黑太白不好比） */

    /* ═══ 顏色換算（跟 js/reaction_matchcolor.js 同一套公式）═══ */
    function cssRgb(c) { return 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')'; }
    function toLinear(u) { var c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function labF(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    function rgbToLab(c) {
        var r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
        var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
        var y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
        var z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
        var fx = labF(x), fy = labF(y), fz = labF(z);
        return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
    }
    /* 顏色差異度（%）＝ΔE76 */
    function diffPercent(c1, c2) {
        var p = rgbToLab(c1), q = rgbToLab(c2);
        return Math.sqrt(Math.pow(p.L - q.L, 2) + Math.pow(p.a - q.a, 2) + Math.pow(p.b - q.b, 2));
    }
    function roundRgb(c) { return { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 按住 holdSec 秒時的變化速度（單位／秒）：線性加快到上限 */
    function rateAt(holdSec) { return RATE[0] + (RATE[1] - RATE[0]) * Math.min(1, Math.max(0, holdSec / RAMP_S)); }
    /* 一個頻道按住 dt 毫秒（目前已按住 holdSec 秒）後的新值，夾在 0～255 */
    function stepChannel(v, dir, holdSec, dtMs) { return Math.min(255, Math.max(0, v + dir * rateAt(holdSec) * dtMs / 1000)); }
    /* 出一局：目標色、右邊色塊的起始色（離目標至少 START_MIN，三個頻道各偏一點） */
    function newRound(rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var T = TARGET_RANGE, target = { r: Math.round(kit.randFloat(T[0], T[1], rand)), g: Math.round(kit.randFloat(T[0], T[1], rand)), b: Math.round(kit.randFloat(T[0], T[1], rand)) };
        for (var i = 0; i < 400; i++) {
            var s = { r: Math.round(kit.randFloat(0, 255, rand)), g: Math.round(kit.randFloat(0, 255, rand)), b: Math.round(kit.randFloat(0, 255, rand)) };
            if (diffPercent(target, s) >= START_MIN) return { target: target, start: s };
        }
        return { target: target, start: { r: target.r > 128 ? 0 : 255, g: target.g > 128 ? 0 : 255, b: target.b > 128 ? 0 : 255 } };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(e) {
        if (e < 0.5) return '神乎其技！';
        if (e < 2) return '高手！';
        if (e < 5) return '很準！';
        if (e < 12) return '不錯喔！';
        return '再試一次，會更準！';
    }
    function fmtPct(v) { return v.toFixed(4) + '%'; }
    function fmtBest(v) { return v == null ? '' : '最佳 ' + fmtPct(v); }

    /* 六顆按鈕：頻道、方向、顏色變數（css/theme.css 的 --cm-*） */
    var BUTTONS = [
        { id: 'r+', ch: 'r', dir: 1, cls: 'mixcolor-btn--r-hi', text: '+' }, { id: 'g+', ch: 'g', dir: 1, cls: 'mixcolor-btn--g-hi', text: '+' }, { id: 'b+', ch: 'b', dir: 1, cls: 'mixcolor-btn--b-hi', text: '+' },
        { id: 'r-', ch: 'r', dir: -1, cls: 'mixcolor-btn--r-lo', text: '−' }, { id: 'g-', ch: 'g', dir: -1, cls: 'mixcolor-btn--g-lo', text: '−' }, { id: 'b-', ch: 'b', dir: -1, cls: 'mixcolor-btn--b-lo', text: '−' }
    ];

    /* mount：選單按下這款遊戲時會呼叫它，負責把遊戲畫面建立在 root（遊戲區）裡；ctx 是選單給的工具（例如 ctx.setMeta 設定標題列右邊的文字）。 */
    function mount(root, ctx) {
        root.classList.add('mixcolor-bg');
        var R = null;

        function round() {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';
            ctx.setMeta(fmtBest(Reaction.getBest(ID)));
            var rd = newRound();
            var cur = { r: rd.start.r, g: rd.start.g, b: rd.start.b };         /* 浮點數，顯示時四捨五入 */
            var leftEl = h('div', { 'class': 'mixcolor-block' }), gapEl = h('div', { 'class': 'mixcolor-gap' }), rightEl = h('div', { 'class': 'mixcolor-block' });
            leftEl.style.background = cssRgb(rd.target);
            gapEl.style.flexBasis = GAP_PX + 'px';
            root.appendChild(h('div', { 'class': 'mixcolor-field' }, [leftEl, gapEl, rightEl]));
            /* 重畫畫面：依目前的狀態（選中了什麼、填了什麼、對或錯…）更新每個元素的外觀 */
            function paint() { rightEl.style.background = cssRgb(cur); }
            paint();
            console.log('[混出什麼色] 目標 rgb(' + rd.target.r + ',' + rd.target.g + ',' + rd.target.b + ')；起始 rgb(' + rd.start.r + ',' + rd.start.g + ',' + rd.start.b + ')；起始差異 ' + diffPercent(rd.target, rd.start).toFixed(2) + '%');

            var pad = h('div', { 'class': 'mixcolor-pad' }), okBtn = h('button', { 'class': 'btn btn--go mixcolor-ok', text: '確定' });
            var btnEls = {};
            BUTTONS.forEach(function (b) {
                var el = h('button', { 'class': 'mixcolor-btn ' + b.cls, text: b.text, attrs: { 'aria-label': ({ r: '紅', g: '綠', b: '藍' })[b.ch] + (b.dir > 0 ? '增加' : '減少') } });
                btnEls[b.id] = el; pad.appendChild(el);
            });
            var foot = h('div', { 'class': 'mixcolor-foot' }, [h('div', { 'class': 'mixcolor-hint', text: '按住 ＋ ／ － 調整右邊色塊的顏色，\n調到跟左邊一樣，再按「確定」。' }), pad, okBtn]);
            root.appendChild(foot);

            /* 按住：held[pointerId] ＝ { b: 按鈕, t0: 開始按的時間 }；每個畫面（或備援計時器）依經過的時間改變頻道 */
            var held = {}, locked = false, lastNow = null, hint = null, lastAdjust = -1e9;   /* lastAdjust：最後一次按下／放開 ＋／－ 的時間（防誤觸「確定」用） */
            function anyHeld() { for (var k in held) return true; return false; }
            function tick(now) {
                if (locked) return;
                var dt = lastNow == null ? 0 : Math.min(60, now - lastNow);
                lastNow = now;
                if (!anyHeld()) { lastNow = null; return; }
                var changed = false;
                for (var k in held) { var it = held[k]; cur[it.b.ch] = stepChannel(cur[it.b.ch], it.b.dir, (now - it.t0) / 1000, dt); changed = true; }
                if (changed) paint();
            }
            my.loop(function (now) { tick(now); if (locked) return false; });
            (function again() { my.after(40, function () { if (!locked) { tick(performance.now()); again(); } }); })();
            BUTTONS.forEach(function (b) {
                var el = btnEls[b.id];
                el.addEventListener('pointerdown', function (e) {
                    if (locked) return;
                    e.preventDefault();
                    try { el.setPointerCapture(e.pointerId); } catch (err) { }
                    if (hint) { hint.remove(); hint = null; }
                    held[e.pointerId] = { b: b, t0: performance.now() };
                    lastAdjust = performance.now();
                    cur[b.ch] = Math.min(255, Math.max(0, cur[b.ch] + b.dir));          /* 一按下去先動 1 個單位（點一下也能微調） */
                    el.classList.add('mixcolor-btn--on'); paint(); Sfx.play('click');
                });
                function up(e) { if (held[e.pointerId]) { delete held[e.pointerId]; el.classList.remove('mixcolor-btn--on'); lastAdjust = performance.now(); } }
                el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
            });
            /* 操作提示（只在第一次進遊戲時）：手指按住「差最多的那個頻道要按的那顆按鈕」（第一次的正確方向） */
            if (kit.once('mixcolor.hint')) {
                var best = null, bd = -1;
                ['r', 'g', 'b'].forEach(function (ch) { var d = Math.abs(rd.target[ch] - rd.start[ch]); if (d > bd) { bd = d; best = ch + (rd.target[ch] > rd.start[ch] ? '+' : '-'); } });
                hint = kit.hintOn(root, btnEls[best], { mode: 'hold', delay: 500, text: '請按住按鈕調整顏色' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
            }

            /* 確定：右邊色塊定住，兩個色塊靠攏，顯示差異度 */
            kit.onTap(okBtn, function () {
                if (locked) return;
                /* 防誤觸：還有 ＋／－ 按著、或剛放開不久，這一下很可能是手指滑到「確定」，不算 */
                if (anyHeld() || performance.now() - lastAdjust < OK_GUARD_MS) return;
                locked = true; held = {};
                if (hint) { hint.remove(); hint = null; }
                var shown = roundRgb(cur), real = diffPercent(rd.target, shown);
                var diff = Leaderboard.fake4(real);
                console.log('混出什麼色：實際差異度 ' + real.toFixed(6) + '% → 成績 ' + fmtPct(diff) + '；你調到 rgb(' + shown.r + ',' + shown.g + ',' + shown.b + ')');
                var isNew = Reaction.setBest(ID, diff, function (v, b) { return v < b; });
                ctx.setMeta(fmtBest(Reaction.getBest(ID)));
                gapEl.classList.add('mixcolor-gap--closed');
                Sfx.play('click');
                foot.style.visibility = 'hidden';
                my.after(CLOSE_MS + 150, function () {
                    kit.result(root, {
                        num: '顏色差異度 ' + fmtPct(diff), isNew: isNew, score: diff, dock: 'bottom',
                        lines: ['你調到 rgb(' + shown.r + ', ' + shown.g + ', ' + shown.b + ')', '目標是 rgb(' + rd.target.r + ', ' + rd.target.g + ', ' + rd.target.b + ')'],
                        label: rating(diff),
                        sfx: diff <= 1 ? 'perfect' : (diff <= 5 ? 'win' : 'neutral'), againText: '再玩一次', onAgain: round
                    });
                });
            });
            G.debug = {
                state: function () { return { target: rd.target, cur: roundRgb(cur), locked: locked }; },
                solve: function () { lastAdjust = -1e9; cur.r = rd.target.r; cur.g = rd.target.g; cur.b = rd.target.b; paint(); okBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 91 })); },
                wrong: function () { lastAdjust = -1e9; cur.r = rd.target.r > 128 ? 0 : 255; cur.g = rd.target.g > 128 ? 0 : 255; cur.b = rd.target.b > 128 ? 0 : 255; paint(); okBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 92 })); },
                /* 模擬按住某顆按鈕 ms 毫秒（走跟真手指一樣的路徑） */
                hold: function (id, ms) {
                    var el = btnEls[id];
                    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 93 }));
                    return new Promise(function (res) { setTimeout(function () { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 93 })); res(roundRgb(cur)); }, ms); });
                }
            };
        }
        round();
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '混出什麼色',
        rule: '左邊是目標顏色，右邊是你要調出來的顏色。下方三對按鈕分別控制右邊色塊的紅、綠、藍：亮色的「＋」按住會增加、暗色的「－」按住會減少，按越久變得越快。沒有任何數字，只能靠眼睛比；**調到你覺得兩邊完全一樣時按「確定」**，兩個色塊會靠在一起並告訴你顏色差異度，越接近 0% 越準，**只有一次機會**。',
        mount: mount,
        score: SCORE,
        test: { OK_GUARD_MS: OK_GUARD_MS, rateAt: rateAt, stepChannel: stepChannel, newRound: newRound, diffPercent: diffPercent, roundRgb: roundRgb, RATE: RATE, RAMP_S: RAMP_S, START_MIN: START_MIN, TARGET_RANGE: TARGET_RANGE, BUTTONS: BUTTONS }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
