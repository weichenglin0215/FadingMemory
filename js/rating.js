/* ═══════════════════════════════════════════════════════════════════
   rating.js — 「五星評價」（V1.25.0 起）
   ───────────────────────────────────────────────────────────────────
   【玩家看到的】
   · 秒反應每款遊戲的結算彈窗，「我有話要說」下方多一顆「五星評價」（Rating.button，js/reaction_kit.js 的 kit.result 放進去）。
     點了跳出「五星評價」彈窗（Rating.open）：上方說明文字、中間五顆只有外框線的空心星星、下方「確認」。
       - 點第 N 顆星 → 第 1～N 顆變成實心的黃色星星（再點一次同一顆＝取消勾選，全部變回空心）；
       - 一顆都沒勾就按「確認」→ 這次不評分，直接關掉；
       - 送出成功 → 小提示「謝謝你的評價！」，結算彈窗裡的「五星評價」按鈕跟著消失。
   · 同一位玩家、同一款遊戲，一天（台灣時間）只能評一次：資料庫（MF_submit_rating）會擋第二次；
     這支手機也記著「今天評過哪幾款」（localStorage fm.rate.done），評過的遊戲結算時直接不顯示「五星評價」按鈕。
   · 主選單「選一個想玩的遊戲」每一格的遊戲名稱下面，用實心黃色星星顯示這款遊戲的平均星數（Rating.bar／Rating.paint，
     平均 3.5 顆＝前 3 顆全黃、第 4 顆黃一半，其餘是淡色的空位）。

   【網路（省流量的設計）】
   · 送評價：每評一次 1 個請求；回應裡直接附上這款遊戲最新的平均與次數，順手更新手機裡的快取。
   · 讀平均：一次拿回全部遊戲的平均（MF_get_ratings，幾 KB），存在 localStorage，CFG.STATS_TTL_MS（3 小時）內不重抓；
     資料庫那邊平均值是「每寫一筆就把總星數、次數加上去」的小統計表，讀的時候不用把所有評價加總。
     所以平均值不是即時的（使用者同意：不需要非常即時，避免過度的網路查詢）。
   · 連不上網路：送評價失敗就請玩家稍後再試（不排隊補送）；讀平均失敗就繼續用舊的，10 分鐘後才再試。
   · 資料庫腳本：supabase/MF_leaderboard.sql 第 6 節（資料表 MF_ratings、MF_rating_stats）。

   【用到的其他檔案】
   js/leaderboard.js（Leaderboard.rpc 呼叫資料庫、Leaderboard.pid 玩家代號）、js/dialog.js（Dlg.open 彈窗公版、Dlg.toast）、
   js/ui.js（UI.h、UI.store、UI.icon）。樣式在 css/rating.css，顏色與尺寸是 css/theme.css 的 --rate-* 變數。
   這個檔案在主選單（index.html）與秒反應（reaction.html）兩頁都會載入（js/boot.js 的 PAGES）。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var CFG = {
        TZ_OFFSET_MIN: 8 * 60,               /* 「一天」用台灣時間（UTC+8）算：資料庫 MF_submit_rating 的 c_tz 也是 Asia/Taipei，兩邊要一致 */
        STATS_TTL_MS: 3 * 3600 * 1000,       /* 平均星數在手機裡存多久才重抓 */
        STATS_RETRY_MS: 10 * 60 * 1000,      /* 讀平均失敗後，多久之後才再試 */
        TIMEOUT_MS: 8000                     /* 網路請求最多等幾毫秒 */
    };
    var KEY_DONE = 'fm.rate.done';           /* { 遊戲id: '2026-10-13' }：這支手機今天評過哪幾款（只留今天的） */
    var KEY_STATS = 'fm.rate.stats';         /* { at, data: { 遊戲id: [平均星數, 評價次數] } }：平均星數的快取 */
    var MAX = 5;
    /* 選了幾顆星時，星星下面顯示的話（給長輩看得懂的說法） */
    var LABELS = ['', '不喜歡', '不太喜歡', '還可以', '喜歡', '非常喜歡'];
    /* 星星的形狀（24×24 的 viewBox，五個角、上下左右置中）：評價彈窗的星星按鈕用；css/rating.css 的遮罩是同一個形狀 */
    var STAR_PATH = 'M12 1.6L14.7 9.38 22.94 9.55 16.37 14.52 18.76 22.4 12 17.7 5.24 22.4 7.63 14.52 1.06 9.55 9.3 9.38Z';

    var Rating = {};
    var statsInflight = null;

    function h() { return global.UI.h.apply(null, arguments); }
    function store() { return global.UI.store; }
    function LB() { return global.Leaderboard; }
    function sfx(name) { if (global.Sfx) { global.Sfx.unlock(); global.Sfx.play(name); } }

    /* ═══ 一、純函式（Node 測試直接呼叫：test/reaction/t_rating.js）═══ */

    /* 台灣時間的「今天」，格式 'YYYY-MM-DD'（now 是毫秒時間戳，預設現在） */
    function today(now) {
        var t = (typeof now === 'number' ? now : Date.now()) + CFG.TZ_OFFSET_MIN * 60000;
        return new Date(t).toISOString().slice(0, 10);
    }

    /* 平均星數 → 黃色要塗滿整排星星的幾 %（0～100）：3.5 顆 → 70%。沒有評價（0、null、NaN）→ 0 */
    function pct(avg) {
        var a = Number(avg);
        if (!(a > 0)) return 0;
        return Math.min(100, a / MAX * 100);
    }

    /* 資料庫回傳（或 localStorage 裡）的平均清單只留格式正確的：{ id: [1～5 的平均, ≥1 的整數次數] } */
    function cleanStats(raw) {
        var out = {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
        Object.keys(raw).forEach(function (id) {
            var v = raw[id];
            if (!/^[a-z0-9_]{1,32}$/.test(id) || !Array.isArray(v)) return;
            var a = Number(v[0]), n = Number(v[1]);
            if (a >= 1 && a <= MAX && n >= 1 && n === Math.floor(n)) out[id] = [a, n];
        });
        return out;
    }

    /* ═══ 二、今天評過了沒（這支手機的紀錄）═══ */
    function doneMap() {
        var m = store().get(KEY_DONE, {});
        return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    }
    function ratedToday(id, now) {
        return !!id && doneMap()[id] === today(now);
    }
    /* 記下「今天評過 id」；順便把不是今天的舊紀錄清掉，這份資料永遠只有今天評過的那幾款 */
    function markRated(id, now) {
        var d = today(now), m = doneMap(), out = {};
        Object.keys(m).forEach(function (k) { if (m[k] === d) out[k] = d; });
        out[id] = d;
        store().set(KEY_DONE, out);
    }

    /* ═══ 三、平均星數：快取與讀取 ═══ */

    /* 手上的平均清單（同步，不連網；沒有就是 {}） */
    function stats() {
        var c = store().get(KEY_STATS, null);
        return cleanStats(c && c.data);
    }

    /* 送評價之後，用資料庫回傳的最新平均更新快取裡的那一款（快取的時間不動，到期照樣會整份重抓） */
    function patchStats(id, avg, cnt) {
        var c = store().get(KEY_STATS, null) || {};
        var data = cleanStats(c.data), raw = {};
        raw[id] = [Number(avg), Number(cnt)];
        var one = cleanStats(raw);
        if (!one[id]) return;
        data[id] = one[id];
        store().set(KEY_STATS, { at: c.at || 0, data: data });
    }

    /* 讀全部遊戲的平均（回傳 Promise，一定 resolve 一個 {id: [平均, 次數]}）：
       快取還在 CFG.STATS_TTL_MS 之內 → 不連網；否則連網抓一次（同時好幾個地方在要，只連一次）；
       連不上 → 繼續用舊的，並且把快取時間設成「CFG.STATS_RETRY_MS 之後到期」，不會每開一次頁面就再試一次。
       opts.force：不管快取，強制重抓。 */
    function loadStats(opts) {
        opts = opts || {};
        var c = store().get(KEY_STATS, null), now = Date.now();
        if (!opts.force && c && c.data && now - c.at >= 0 && now - c.at < CFG.STATS_TTL_MS) return Promise.resolve(stats());
        if (statsInflight) return statsInflight;
        var lb = LB();
        if (!lb || !lb.rpc) return Promise.resolve(stats());
        statsInflight = lb.rpc('MF_get_ratings', {}, CFG.TIMEOUT_MS).then(function (r) {
            statsInflight = null;
            if (r.ok && r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
                var data = cleanStats(r.data);
                store().set(KEY_STATS, { at: Date.now(), data: data });
                return data;
            }
            var old = stats();
            store().set(KEY_STATS, { at: Date.now() - CFG.STATS_TTL_MS + CFG.STATS_RETRY_MS, data: old });
            return old;
        });
        return statsInflight;
    }

    /* ═══ 四、送出評價 ═══
       回傳 Promise<{status, avg, cnt}>，status：
         sent     寫進資料庫了；already 今天已經評過這款（這次不算）——這兩種都會記下「今天評過」；
         offline  連不上（或資料庫還沒有這個函式）；rejected 資料庫拒絕（遊戲沒登記、星數不對）。 */
    function submit(ref, stars, retried) {
        var id = ref && typeof ref === 'object' ? ref.id : ref;
        var lb = LB();
        stars = Math.round(Number(stars));
        if (!id || !(stars >= 1 && stars <= MAX)) return Promise.resolve({ status: 'rejected' });
        if (!lb || !lb.rpc || !lb.pid) return Promise.resolve({ status: 'offline' });
        /* p_token：已登入就帶裝置憑證（用帳號的編號評價）；沒登入給 null＝匿名評價（沒有帳號的玩家也能評；匿名不能冒用已建立帳號的編號） */
        return lb.rpc('MF_submit_rating', { p_game_id: id, p_player_id: lb.pid(), p_stars: stars, p_token: (lb.token && lb.token()) || null }, CFG.TIMEOUT_MS).then(function (r) {
            var d = r.data;
            /* 憑證失效（例如在別台改了密碼）：標記需要重新登入，這次改用匿名代號再評一次（評價不該因為憑證失效就送不出去） */
            if (r.ok && d && d.error === 'bad_token' && !retried && lb.markRelogin) { lb.markRelogin(); return submit(ref, stars, true); }
            if (r.ok && d && d.ok) {
                markRated(id);
                if (d.cnt > 0 && d.avg != null) patchStats(id, d.avg, d.cnt);
                return { status: d.saved ? 'sent' : 'already', avg: d.avg, cnt: d.cnt };
            }
            if (r.ok || r.error === 'http_400') return { status: 'rejected', error: d && d.error };
            return { status: 'offline', error: r.error };
        });
    }

    /* ═══ 五、畫面 ═══ */

    /* 一排五顆星的平均星數（主選單的遊戲格子、「阿嬤都比你厲害」的格子用）：
       外觀是 css/rating.css 的 .rate-bar——用星星形狀的遮罩，底色從左邊塗黃色塗到 --rate-p，其餘是淡色空位。 */
    function bar(id) {
        var el = h('span', { 'class': 'rate-bar', attrs: { role: 'img' } });
        paint(el, id);
        return el;
    }

    /* 把某款遊戲目前的平均（快取裡的）畫到 bar 上；data 不給就自己讀快取 */
    function paint(el, id, data) {
        var v = (data || stats())[id];
        el.style.setProperty('--rate-p', pct(v && v[0]).toFixed(1) + '%');
        var label = v ? '平均 ' + v[0].toFixed(1) + ' 顆星（' + v[1] + ' 次評價）' : '還沒有人評價';
        el.setAttribute('aria-label', label);
        el.setAttribute('title', label);
    }

    function starSvg() {
        return '<svg class="rate-pick__svg" viewBox="-1 -1 26 26" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
    }

    /* 「五星評價」彈窗。game：Reaction.register 登記的遊戲物件；onDone({status})：彈窗關掉之後要做的事
       （status 多一種 'cancel'：一顆星都沒勾就按「確認」）。 */
    function open(game, onDone) {
        if (!game || !game.id || !global.Dlg) return null;
        var Dlg = global.Dlg;
        var stars = 0, busy = false, starEls = [];
        var row = h('div', { 'class': 'rate-pick', attrs: { role: 'radiogroup', 'aria-label': '給幾顆星' } });
        for (var i = 1; i <= MAX; i++) {
            (function (n) {
                var b = h('button', {
                    'class': 'rate-pick__star', type: 'button', html: starSvg(),
                    attrs: { role: 'radio', 'aria-checked': 'false', 'aria-label': n + ' 顆星' },
                    on: { click: function () { if (busy) return; sfx('pop'); stars = (stars === n) ? 0 : n; paintPick(); } }
                });
                starEls.push(b);
                row.appendChild(b);
            })(i);
        }
        var say = h('div', { 'class': 'rate-pick__say' });
        var intro = Dlg.richText ? Dlg.richText('你喜歡這款遊戲嗎？\n點星星打分數，**5 顆星是最喜歡**。\n每款遊戲每天可以評一次。')
            : h('div', { 'class': 'dlg__text', text: '你喜歡這款遊戲嗎？點星星打分數，5 顆星是最喜歡。每款遊戲每天可以評一次。' });
        var ctl = Dlg.open({
            cls: 'dlg--rate', title: '五星評價', sub: game.name || '',
            children: [intro, row, say],
            buttons: [{ text: '確認', kind: 'primary', keep: true, sfx: 'ok', onClick: confirm }]
        });
        var okBtn = ctl.buttons[0];

        function paintPick() {
            starEls.forEach(function (b, k) {
                var on = k < stars;
                b.classList.toggle('is-on', on);
                b.setAttribute('aria-checked', k === stars - 1 ? 'true' : 'false');
            });
            say.textContent = stars ? stars + ' 顆星：' + LABELS[stars] : '還沒選星星（不選就不評分）';
            say.classList.toggle('is-on', stars > 0);
        }

        function finish(r) {
            ctl.close();
            if (onDone) onDone(r);
        }

        function confirm() {
            if (busy) return;
            if (!stars) { finish({ status: 'cancel' }); return; }
            busy = true;
            okBtn.disabled = true;
            okBtn.textContent = '送出中…';
            submit(game, stars).then(function (r) {
                var st = r && r.status;
                if (st === 'sent') Dlg.toast('謝謝你的評價！');
                else if (st === 'already') Dlg.toast('今天已經評過這款遊戲了，明天再來評吧！');
                else if (st === 'offline') Dlg.toast('目前連不上網路，這次沒有評到，請稍後再試');
                else Dlg.toast('這次沒有評價成功，請稍後再試');
                finish(r);
            });
        }

        paintPick();
        return ctl;
    }

    /* 結算彈窗用的「五星評價」按鈕（放在「我有話要說」下面）。今天已經評過這款 → 回傳 null（不顯示）；
       評價送出成功（或資料庫說今天評過了）之後，按鈕自己從結算彈窗消失。 */
    function button(game) {
        if (!game || !game.id || ratedToday(game.id)) return null;
        var el = h('button', {
            'class': 'btn btn--line btn--sm dlg__feedback dlg__rate', type: 'button',
            html: global.UI.icon('star') + '<span>五星評價</span>',
            on: {
                click: function () {
                    sfx('click');
                    open(game, function () { if (ratedToday(game.id) && el.parentNode) el.parentNode.removeChild(el); });
                }
            }
        });
        return el;
    }

    /* ═══ 六、對外介面 ═══ */
    Rating.CFG = CFG;
    Rating.LABELS = LABELS;
    Rating.today = today;
    Rating.ratedToday = ratedToday;
    Rating.stats = stats;
    Rating.loadStats = loadStats;
    Rating.submit = submit;
    Rating.bar = bar;
    Rating.paint = paint;
    Rating.open = open;
    Rating.button = button;
    Rating.test = { pct: pct, cleanStats: cleanStats, markRated: markRated, patchStats: patchStats, KEY_DONE: KEY_DONE, KEY_STATS: KEY_STATS, STAR_PATH: STAR_PATH };

    global.Rating = Rating;
})(window);
