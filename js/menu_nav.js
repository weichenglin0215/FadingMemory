/* ═══════════════════════════════════════════════════════════════════
   menu_nav.js — 主選單（index.html）左上角的漢堡選單（V1.38.0）
   ───────────────────────────────────────────────────────────────────
   點左上角的漢堡按鈕，往下展開兩項：
     「設定」→ 設定彈窗：顯示暱稱、「修改暱稱」按鈕、「音樂音效」喇叭圖示（預設開；點一下切換，關掉＝全部靜音，跟遊戲裡右上角的喇叭是同一個開關）。
              暱稱的規則見 js/identity.js：沒有帳號的訪客還沒有暱稱（成績進世界前 30 名時才請他取），
              所以訪客的「修改暱稱」是灰的，旁邊給一顆「我已有帳號，登入」。
     「成績」→ 成績彈窗：每款遊戲的世界名次，由前到後排；右邊的「玩」直接進那款遊戲。列表用手指上下拖曳，放手帶慣性（js/scroller.js，
              跟「選一個想玩的遊戲」、世界排行榜是同一個元件）。
              資料有兩個來源：
                ① 世界名次：資料庫 MF_get_my_ranks（Leaderboard.myRanks；只有進了前 30 名的遊戲才有名次，要登入才查）；
                ② 玩過但還沒進榜的遊戲：這支手機上的個人最佳（fm.reaction.best.<id>）。★ 只收「已確認是現行單位」的（.sync 記號，見 js/identity.js），
                   有些遊戲改版時換過成績單位，舊紀錄要等進那款遊戲時才會換算，直接顯示會是錯的數字。
              成績怎麼顯示（'12.3456 秒'、'第 21 關'）靠 js/score_specs.js（自動產生）加上 Leaderboard.fmt。
   buildRows 是純函式（不碰網路、不碰畫面），Node 測試直接驗證（test/reaction/t_menunav.js）。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var h = global.UI.h;
    var LB = global.Leaderboard;
    var ID = global.Identity;
    var M = global.FMMenu;
    var KEY_BEST = 'fm.reaction.best.';
    var SCROLL_THRESHOLD = 8;          /* 手指移動超過幾個舞台像素才算拖曳（沒超過就是點一下，「玩」按鈕照常收到點擊） */

    function sfx(name) { if (global.Sfx) { global.Sfx.unlock(); global.Sfx.play(name); } }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
    function toast(text) { if (global.Dlg && global.Dlg.toast) global.Dlg.toast(text); }
    function byId(id) { return document.getElementById(id); }

    /* ═══════════════════════════════════════════════════════════════
       一、純函式
       ═══════════════════════════════════════════════════════════════ */

    /* 成績列。
       o.ranks   資料庫回傳的 [ { game_id, rank, score }, … ]（進了前 30 名的遊戲）；
       o.bests   這支手機上「確認過單位」的個人最佳 { 遊戲id: 數字 }；
       o.order   選單裡全部遊戲的 id（照選單順序；不在裡面的 id 一律丟掉，同名次時也照這個順序）；
       o.recent  最近玩過的 id（最新的在前面）。
       回傳 { ranked: [ {id, rank, score} ]（依名次由前到後）, played: [ {id, score} ]（玩過但不在 ranked 裡，最近玩的在前面） }。 */
    function buildRows(o) {
        o = o || {};
        var order = {};
        (o.order || []).forEach(function (id, i) { order[id] = i; });  /* forEach：對陣列的每個元素各做一次 */
        var seen = {}, ranked = [];
        (o.ranks || []).forEach(function (x) {          /* forEach：對陣列的每個元素各做一次 */
            if (!x || order[x.game_id] == null || seen[x.game_id]) return;
            if (typeof x.rank !== 'number' || !(x.rank >= 1) || x.rank !== Math.floor(x.rank) || typeof x.score !== 'number' || !isFinite(x.score)) return;  /* Math.floor：無條件捨去成整數 */
            seen[x.game_id] = true;
            ranked.push({ id: x.game_id, rank: x.rank, score: x.score });
        });
        ranked.sort(function (a, b) { return (a.rank - b.rank) || (order[a.id] - order[b.id]); });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */

        var recent = {};
        (o.recent || []).forEach(function (id, i) { recent[id] = i; });
        var played = [];
        Object.keys(o.bests || {}).forEach(function (id) {
            var v = o.bests[id];
            if (order[id] == null || seen[id] || typeof v !== 'number' || !isFinite(v)) return;
            played.push({ id: id, score: v });
        });
        played.sort(function (a, b) {                   /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
            var ra = recent[a.id] != null ? recent[a.id] : 1e6, rb = recent[b.id] != null ? recent[b.id] : 1e6;
            return (ra - rb) || (order[a.id] - order[b.id]);
        });
        return { ranked: ranked, played: played };
    }

    /* 成績數字 → 顯示文字（'12.3456 秒'）；沒有這款遊戲的格式就照數字顯示 */
    function scoreText(id, v) {
        var spec = global.FM_SCORE_SPECS && global.FM_SCORE_SPECS[id];
        return spec ? LB.fmt(spec, v) : String(v);
    }

    /* 這支手機上「確認過單位」、而且有成績格式的個人最佳（見檔案開頭的說明） */
    function localBests() {
        var out = {}, st = global.UI.store;
        M.GAME_CELLS.forEach(function (c) {
            if (!(global.FM_SCORE_SPECS && global.FM_SCORE_SPECS[c.id])) return;
            var v = st.get(KEY_BEST + c.id, null);
            if (typeof v === 'number' && isFinite(v) && st.get(KEY_BEST + c.id + '.sync', false)) out[c.id] = v;
        });
        return out;
    }

    /* ═══════════════════════════════════════════════════════════════
       二、「設定」彈窗
       ═══════════════════════════════════════════════════════════════ */
    function openSettings() {
        var nickEl = h('div', { 'class': 'set-nick' });
        var hint = h('div', { 'class': 'set-hint' });
        var loginBtn = h('button', { 'class': 'pill pill--blue set-login', on: { click: function () { sfx('click'); ID.askLogin().then(paint); } } });
        var rename = h('button', { 'class': 'btn btn--sky btn--sm', text: '修改暱稱', on: { click: onRename } });

        /* 音樂音效：右邊一顆喇叭圖示，點一下開／關（預設是開；沒有存過靜音設定就是開）。
           跟遊戲裡右上角的喇叭共用同一個設定（Sfx.setMuted 存在 localStorage）：開＝喇叭有聲波，關＝喇叭打叉。 */
        var soundRow = null;
        if (global.Sfx) {
            var soundIco = h('span', { 'class': 'set-sound__ico' });
            soundRow = h('button', { 'class': 'set-sound', attrs: { role: 'switch' } }, [h('span', { 'class': 'set-sound__txt', text: '音樂音效' }), soundIco]);
            var paintSound = function () {
                var on = !global.Sfx.isMuted();
                soundIco.innerHTML = global.UI.icon(on ? 'volume' : 'mute');
                soundRow.classList.toggle('is-off', !on);  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                soundRow.setAttribute('aria-checked', on ? 'true' : 'false');  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
                soundRow.setAttribute('aria-label', '音樂音效：' + (on ? '開' : '關'));  /* setAttribute：設定元素的 HTML 屬性（例如 aria-label、data-xxx） */
            };
            soundRow.addEventListener('click', function () {
                global.Sfx.setMuted(!global.Sfx.isMuted());
                paintSound();
                if (!global.Sfx.isMuted()) sfx('ok');           /* 剛打開聲音：播一聲讓他聽見 */
            });
            paintSound();
        }

        /* 依目前身分重畫暱稱區（登入、改暱稱之後也會呼叫） */
        function paint() {
            var st = LB.identityState(), nick = LB.getNick();
            nickEl.textContent = nick || '（還沒有暱稱）';     /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            nickEl.classList.toggle('set-nick--none', !nick);  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            var text = '', login = '';
            if (st === 'guest') { text = '成績進入世界前 30 名時，就能取暱稱。'; login = '我已有帳號，登入'; }
            else if (st === 'relogin') { text = '登入已經失效，請重新登入後再修改暱稱。'; login = '重新登入'; }
            else if (st === 'legacy') { text = '你的暱稱還沒有設密碼，按「修改暱稱」會先請你建立密碼。'; }
            hint.textContent = text;                    /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            hint.hidden = !text;
            loginBtn.textContent = login;
            loginBtn.hidden = !login;
            rename.disabled = st === 'guest' || st === 'relogin';
        }

        function onRename() {
            var st = LB.identityState();
            if (st === 'legacy') { ID.ensureLegacy({}).then(paint); return; }
            if (st !== 'in') return;
            ID.ui.renameDialog().then(function (ok) { if (ok) { paint(); toast('暱稱已經改成「' + LB.getNick() + '」'); } });
        }

        Dlg.open({
            cls: 'dlg--set', title: '設定',
            children: [
                h('div', { 'class': 'set-row' }, [h('div', { 'class': 'set-label', text: '暱稱' }), nickEl]),
                hint, loginBtn, rename, soundRow
            ],
            buttons: [{ text: '關閉', kind: 'line', cls: 'nav-close' }]          /* 白底藍框藍字，高度 2/3（.nav-close） */
        });
        paint();
    }

    /* ═══════════════════════════════════════════════════════════════
       三、「成績」彈窗
       ═══════════════════════════════════════════════════════════════ */

    /* 一列：名次（前三名是金銀銅牌，沿用世界排行榜的樣式）｜遊戲名稱＋成績｜「玩」。r.rank 是 null＝玩過但還沒進榜（名次欄放「—」） */
    function rowEl(r) {
        var cell = M.gameById[r.id];
        var ranked = r.rank != null, top = ranked && r.rank <= 3;
        var cls = 'lb-row sc-row' + (top ? ' lb-row--top lb-row--r' + r.rank : (ranked ? (r.rank % 2 ? '' : ' lb-row--alt') : ' sc-row--played lb-row--alt'));
        var rank = top
            ? h('div', { 'class': 'lb-rank' }, [
                r.rank === 1 ? h('span', { 'class': 'lb-crown', html: global.UI.icon('crown') }) : null,
                h('span', { 'class': 'lb-medal', text: String(r.rank) })
            ])
            : h('div', { 'class': 'lb-rank lb-rank--n', text: ranked ? String(r.rank) : '—' });
        return h('div', { 'class': cls, attrs: { 'data-id': r.id } }, [
            rank,
            h('div', { 'class': 'sc-main' }, [
                h('div', { 'class': 'sc-name', text: cell.name }),
                h('div', { 'class': 'sc-score', text: scoreText(r.id, r.score) })
            ]),
            h('button', {
                'class': 'sc-play', text: '玩', attrs: { 'aria-label': '玩' + cell.name },
                on: { click: function (e) { e.stopPropagation(); M.pickGame(r.id); } }
            })
        ]);
    }

    function openScores() {
        var limit = LB.CFG.LIMIT_DEFAULT;
        var sub = h('div', { 'class': 'lb-sub' });
        var note = h('div', { 'class': 'lb-note' });
        var list = h('div', { 'class': 'lb-list' });
        var thumb = h('div', { 'class': 'lb-thumb' });
        var viewport = h('div', { 'class': 'lb-viewport' }, [list, thumb]);
        var scroller = global.Scroller.make(viewport, list, thumb, { threshold: SCROLL_THRESHOLD });
        var closed = false;
        var order = M.GAME_CELLS.map(function (c) { return c.id; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */

        /* ranks：資料庫的名次（可以是 null＝還沒拿到／連不上）；offline：連不上網路 */
        function render(ranks, offline) {
            var rows = buildRows({ ranks: ranks || [], bests: localBests(), order: order, recent: M.recentIds() });
            var st = LB.identityState();
            list.innerHTML = '';                        /* innerHTML = ''：把元素裡面的東西全部清掉 */
            if (!rows.ranked.length && !rows.played.length) {
                list.appendChild(h('div', { 'class': 'lb-msg lb-msg--first' }, [  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
                    h('span', { html: global.UI.icon('trophy', 'lb-msg__icon') }),
                    h('div', { text: '還沒有成績' }),
                    h('div', { 'class': 'lb-msg__sub', text: '到「秒反應」玩一款吧！' })
                ]));
            } else {
                rows.ranked.forEach(function (r) { list.appendChild(rowEl(r)); });  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
                if (rows.played.length) {
                    list.appendChild(h('div', { 'class': 'sc-sep', text: rows.ranked.length ? '還沒進世界前 ' + limit + ' 名' : '你玩過的遊戲' }));
                    rows.played.forEach(function (r) { list.appendChild(rowEl({ id: r.id, rank: null, score: r.score })); });
                }
            }
            /* 副標題要短（標題右邊只放得下約 11 個字，太長會被「…」收掉） */
            if (rows.ranked.length) sub.textContent = '世界前 ' + limit + ' 名：' + rows.ranked.length + ' 款';
            else sub.textContent = st === 'in' ? '還沒進榜，繼續加油！' : '進前 ' + limit + ' 名就有名次';
            note.textContent = offline ? '目前連不上網路，世界名次先不顯示' : (rows.ranked.length || rows.played.length ? '名次依世界排行榜，點「玩」直接挑戰' : '');
            scroller.refresh();
        }

        Dlg.open({
            tall: true, cls: 'dlg--scores',
            onClose: function () { closed = true; scroller.destroy(); },
            children: [
                h('div', { 'class': 'lb-head' }, [
                    h('div', { 'class': 'lb-head__icon', html: global.UI.icon('trophy') }),
                    h('div', { 'class': 'lb-head__txt' }, [h('div', { 'class': 'lb-title', text: '我的成績' }), sub])
                ]),
                viewport,
                note
            ],
            buttons: [{ text: '關閉', kind: 'line', cls: 'nav-close' }]          /* 白底藍框藍字，高度 2/3（.nav-close） */
        });

        /* 先畫上次存的名次（沒有就只畫玩過的），網路回來再更新 */
        var cached = LB.cachedMyRanks ? LB.cachedMyRanks() : null;
        render(cached, false);
        if (LB.myRanks && LB.isLoggedIn()) {
            LB.myRanks().then(function (list2) {
                if (closed) return;
                if (list2) render(list2, false);
                else render(cached, true);
            });
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       四、漢堡按鈕與往下展開的選單
       ═══════════════════════════════════════════════════════════════ */
    function initNav() {
        var btn = byId('nav-btn'), pop = byId('nav-pop');
        if (!btn || !pop) return;
        byId('icon-nav').innerHTML = global.UI.icon('menu');
        byId('icon-nav-settings').innerHTML = global.UI.icon('gear');
        byId('icon-nav-scores').innerHTML = global.UI.icon('trophy');
        byId('icon-nav-offline').innerHTML = global.UI.icon('download');

        function setOpen(on) {
            pop.hidden = !on;
            btn.setAttribute('aria-expanded', on ? 'true' : 'false');
        }
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            sfx('click');
            setOpen(pop.hidden);
        });
        /* 點選單以外的地方、按 Esc，都把選單收起來 */
        document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target)) setOpen(false); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) setOpen(false); });

        byId('nav-settings').addEventListener('click', function () { setOpen(false); sfx('click'); openSettings(); });
        byId('nav-scores').addEventListener('click', function () { setOpen(false); sfx('click'); openScores(); });
        byId('nav-offline').addEventListener('click', function () { setOpen(false); sfx('click'); if (global.OfflineDialog) global.OfflineDialog.show(); });
    }

    /* 給 Node 測試用（test/reaction/t_menunav.js） */
    global.FMNav = { buildRows: buildRows, scoreText: scoreText };

    global.UI.ready(initNav);
})(window);
