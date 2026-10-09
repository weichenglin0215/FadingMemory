/* ═══════════════════════════════════════════════════════════════════
   dialog.js — 秒反應「彈窗公版」（玩法說明、世界前 30 名、輸入暱稱、進榜恭喜、結算、我有話要說）
   ───────────────────────────────────────────────────────────────────
   【為什麼要有公版】
   以前每種彈窗各畫各的：玩法說明有自己的外框、排行榜有自己的、結算卡片又是另一套，
   寬度、背後壓暗的顏色、字級、按鈕尺寸都不一樣，而且玩法說明會把上方的標題列一起壓黑，
   「返回」按不到。現在全部走這裡的 Dlg.open()，外框與卡片的樣式只有一份（css/dialog.css，
   數值在 css/theme.css :root 的「彈窗公版」那一段），要改長相只改那一處。

   【對外介面】（都掛在全域 Dlg 底下）
     Dlg.open(o)          開一個彈窗，回傳 { el, card, close(), isOpen() }
                            o.host      放在哪個容器（預設整個舞台 #stage；結算彈窗放在遊戲畫面 #screen 裡）
                            o.title／o.sub／o.text   標題、副標題、內文（靠左）
                            o.children  卡片中間要放的其他元素（陣列）
                            o.buttons   按鈕陣列 [{text|html, kind:'primary'|'go'|'sky'|'line', cls, keep, sfx, onClick(ctl, el)}]
                                        · 預設按下去會先關掉彈窗再呼叫 onClick；keep:true＝按了不關
                            o.btnRow    true＝按鈕左右並排（預設直向排列）
                            o.foot      卡片最底下再放的元素（陣列，結算彈窗的「我有話要說」放這裡）
                            o.tall      卡片拉到整個高度（世界前 30 名用）
                            o.low       疊放層級低一點（玩法說明用，這樣從它打開排行榜會疊在上面）
                            o.cls／o.cardCls／o.attrs   額外的 class／資料屬性
                            o.onClose   彈窗關掉（不管怎麼關）之後要做的事
     Dlg.rule(game, o)    玩法說明彈窗（reaction.js 進場與右上角「?」用）
     Dlg.feedback(game)   「我有話要說」意見彈窗（結算彈窗最下方的按鈕會打開它）
     Dlg.toast(text)      畫面下方短暫的小提示
   彈窗都蓋在標題列「下面」，所以上方的「返回」「喇叭」「?」隨時都點得到。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var h = global.UI.h;
    var Dlg = {};

    function stageEl() { return document.getElementById('stage') || document.body; }
    function sfx(name) { if (global.Sfx) { global.Sfx.unlock(); global.Sfx.play(name); } }
    function removeEl(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

    /* ═══ 一、公版：開一個彈窗 ═══ */
    Dlg.open = function (o) {
        o = o || {};
        var host = o.host || stageEl();
        var cls = ['dlg', host === stageEl() ? 'dlg--stage' : 'dlg--in'];
        if (o.low) cls.push('dlg--low');
        if (o.tall) cls.push('dlg--tall');
        if (o.cls) cls.push(o.cls);
        var ov = h('div', { 'class': cls.join(' '), attrs: o.attrs || {} });
        var card = h('div', { 'class': 'dlg__card' + (o.cardCls ? ' ' + o.cardCls : '') });
        var closed = false;
        var ctl = {
            el: ov, card: card, buttons: [],
            isOpen: function () { return !closed; },
            close: function () {
                if (closed) return;
                closed = true;
                removeEl(ov);
                if (o.onClose) o.onClose();
            }
        };
        if (o.title) card.appendChild(h('div', { 'class': 'dlg__title', text: o.title }));
        if (o.sub) card.appendChild(h('div', { 'class': 'dlg__sub', text: o.sub }));
        if (o.text) card.appendChild(h('div', { 'class': 'dlg__text', text: o.text }));
        (o.children || []).forEach(function (c) { if (c) card.appendChild(c); });
        if (o.buttons && o.buttons.length) {
            var wrap = h('div', { 'class': 'dlg__btns' + (o.btnRow ? ' dlg__btns--row' : '') });
            o.buttons.forEach(function (b) {
                var el = h('button', {
                    'class': 'btn btn--' + (b.kind || 'primary') + (b.cls ? ' ' + b.cls : ''),
                    text: b.html != null ? null : b.text,
                    html: b.html,
                    on: {
                        click: function () {
                            if (el.disabled) return;
                            sfx(b.sfx || 'click');
                            if (!b.keep) ctl.close();
                            if (b.onClick) b.onClick(ctl, el);
                        }
                    }
                });
                ctl.buttons.push(el);
                wrap.appendChild(el);
            });
            card.appendChild(wrap);
        }
        (o.foot || []).forEach(function (c) { if (c) card.appendChild(c); });
        ov.appendChild(card);
        host.appendChild(ov);
        return ctl;
    };

    /* ═══ 二、玩法說明彈窗 ═══
       game：Reaction.register 登記的遊戲物件（用它的 name 與 rule）
       o.okText：主按鈕文字（預設「開始挑戰」）；o.softSound：只播輕觸聲（「下一步」不是真的開始，不播「開始」的嗶聲）；
       o.boardButton：多放一顆「世界排行榜」按鈕；o.onClose：玩家按下主按鈕之後要做的事。
       同一時間只會有一個玩法說明：已經開著的時候再呼叫，直接回傳那一個。 */
    var ruleCtl = null;
    Dlg.rule = function (game, o) {
        o = o || {};
        if (ruleCtl && ruleCtl.isOpen()) return ruleCtl;
        var btns = [{
            text: o.okText || '開始挑戰', kind: 'primary', sfx: o.softSound ? 'click' : 'go',
            onClick: function () { if (o.onClose) o.onClose(); }
        }];
        if (o.boardButton) {
            btns.push({
                html: global.UI.icon('trophy') + '<span>世界排行榜</span>', kind: 'line', keep: true,
                onClick: function () { if (global.Leaderboard && global.Leaderboard.showBoard) global.Leaderboard.showBoard(game, {}); }
            });
        }
        ruleCtl = Dlg.open({ low: true, cls: 'dlg--rule', title: game.name, text: game.rule, buttons: btns });
        return ruleCtl;
    };

    /* 玩法說明現在開著嗎（有些遊戲在說明彈窗開著時要先暫停，例如七彩陷阱） */
    Dlg.ruleOpen = function () { return !!(ruleCtl && ruleCtl.isOpen()); };

    /* ═══ 三、小提示（toast） ═══ */
    Dlg.toast = function (text) {
        var el = h('div', { 'class': 'dlg-toast', text: text });
        stageEl().appendChild(el);
        global.setTimeout(function () { el.classList.add('is-out'); }, 3200);
        global.setTimeout(function () { removeEl(el); }, 3700);
    };

    /* ═══ 四、「我有話要說」意見彈窗 ═══
       玩家寫下意見 → Leaderboard.sendFeedback 送到資料庫的 MF_feedback（每一列都記著是哪一款遊戲）。
       連不上網路時意見先存在這支手機，下次開頁面時補送（見 js/leaderboard.js）。 */
    var FB_MAX = 300;
    Dlg.feedback = function (game) {
        var LB = global.Leaderboard;
        var ta = h('textarea', {
            'class': 'dlg-input dlg-input--area',
            attrs: { maxlength: String(FB_MAX), rows: '6', placeholder: '想說什麼都可以：哪裡不好玩、哪裡看不懂、想要什麼新遊戲…', 'aria-label': '你的意見' }
        });
        var count = h('div', { 'class': 'dlg__count', text: '0 / ' + FB_MAX });
        var ctl = Dlg.open({
            cls: 'dlg--feedback', title: '我有話要說', sub: game && game.name ? game.name : '',
            children: [ta, count],
            buttons: [
                { text: '送出', kind: 'primary', keep: true, sfx: 'ok', onClick: send },
                { text: '取消', kind: 'line' }
            ]
        });
        var sendBtn = ctl.buttons[0], busy = false;
        function value() { return (LB && LB.cleanFeedback) ? LB.cleanFeedback(ta.value) : String(ta.value || '').trim(); }
        function sync() {
            count.textContent = Array.from(ta.value).length + ' / ' + FB_MAX;
            sendBtn.disabled = busy || Array.from(value()).length < 2;
        }
        function send() {
            var text = value();
            if (busy || Array.from(text).length < 2) return;
            busy = true;
            sendBtn.textContent = '送出中…';
            sync();
            var p = (LB && LB.sendFeedback) ? LB.sendFeedback(game, text) : Promise.resolve({ status: 'offline' });
            p.then(function (r) {
                busy = false;
                var st = r && r.status;
                if (st === 'sent') { ctl.close(); Dlg.toast('謝謝你的意見，我們收到了！'); }
                else if (st === 'queued') { ctl.close(); Dlg.toast('目前連不上網路，意見先存在這支手機，下次連線時會自動送出'); }
                else if (st === 'too-many') { sendBtn.textContent = '送出'; sync(); Dlg.toast('今天寄的意見有點多，明天再寄吧！'); }
                else { sendBtn.textContent = '送出'; sync(); Dlg.toast('這次沒有送成功，請稍後再試'); }
            });
        }
        ta.addEventListener('input', sync);
        sync();
        try { ta.focus(); } catch (e) { }
        return ctl;
    };

    global.Dlg = Dlg;
})(window);
