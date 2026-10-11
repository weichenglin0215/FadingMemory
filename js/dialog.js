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
     Dlg.rule(game, o)    玩法說明彈窗（reaction.js 進場與右上角「?」用）；內文一句一行、**重點**用粗體黑字（Dlg.richText）
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

    /* ═══ 一之二、玩法說明的排版：一句一行＋重點句子用粗體黑字 ═══
       玩法說明（各遊戲 Reaction.register 的 rule）以前是一整段、同一種顏色，字一多就全擠在一起很難讀。
       現在 Dlg.richText(text) 會把它排成：
         · 一句一行：句尾標點（。！？；）後面換行；標點後面如果緊接著右引號／右括號（」』）），
           要等到「真正的句尾標點」才換行，所以「按下「重疊！」。」不會被切在引號中間。
           想在別的地方換行，在文字裡寫 \n 就行（例如引號裡的問句結束後）。
         · 重點句子：用 ** 前後包起來，例如  '請在**心裡默數至零**，快速點擊按鈕。'
           重點會畫成粗體（--fw-bold）黑色（--c-black），其他字維持一般粗細的次要文字色（樣式在 css/dialog.css）。
           ** 沒有成對時，那個 ** 會被忽略，整句當一般文字，不會讓後面全部變成粗體。
       emParts／lines 是純函式（不碰 DOM），Node 測試可以直接驗證（見 test/reaction/t_ruletext.js）。 */
    var SENT_END = '。！？；';      /* 句尾標點：後面要換行 */
    var CLOSERS = '」』）)';         /* 緊接在句尾標點後面的右引號／右括號：算同一個句尾，不單獨換行 */

    /* '請在**心裡默數至零**，快速' → [{t:'請在',em:false},{t:'心裡默數至零',em:true},{t:'，快速',em:false}] */
    function emParts(text) {
        var parts = String(text == null ? '' : text).split('**');
        if (parts.length % 2 === 0) {          /* 有一個 ** 沒有成對：把最後一段接回前一段，一律當一般文字 */
            var last = parts.pop();
            parts[parts.length - 1] += last;
        }
        var out = [];
        parts.forEach(function (p, i) { if (p) out.push({ t: p, em: i % 2 === 1 }); });
        return out;
    }

    /* 把一行的字（每個字帶著 em 旗標）合併成片段：相鄰而且粗細相同的字併在一起 */
    function mergeRun(chars) {
        var segs = [];
        chars.forEach(function (c) {
            var last = segs[segs.length - 1];
            if (last && last.em === c.em) last.t += c.c;
            else segs.push({ t: c.c, em: c.em });
        });
        return segs;
    }

    /* 把說明文字切成一行一行，回傳 [[{t, em}, …], …]（每一行是一串片段）。
       重點（**）可以跨過標點：先把全部的字展開成 {字, 是否重點}，再決定哪裡換行，所以不會把 ** 切壞。 */
    function lines(text) {
        var chars = [];
        emParts(text).forEach(function (seg) {
            Array.from(seg.t).forEach(function (c) { chars.push({ c: c, em: seg.em }); });
        });
        var out = [], cur = [], i = 0;
        function flush() {
            while (cur.length && /\s/.test(cur[0].c)) cur.shift();                      /* 行首、行尾的空白不要 */
            while (cur.length && /\s/.test(cur[cur.length - 1].c)) cur.pop();
            if (cur.length) out.push(mergeRun(cur));
            cur = [];
        }
        while (i < chars.length) {
            var ch = chars[i].c;
            i++;
            if (ch === '\n') { flush(); continue; }
            cur.push({ c: ch, em: chars[i - 1].em });
            if (SENT_END.indexOf(ch) >= 0) {
                /* 吃掉緊跟著的句尾標點與右引號／右括號；最後一個字是句尾標點才換行（「…？」下面」這種不換） */
                while (i < chars.length && (SENT_END.indexOf(chars[i].c) >= 0 || CLOSERS.indexOf(chars[i].c) >= 0)) { cur.push(chars[i]); i++; }
                if (SENT_END.indexOf(cur[cur.length - 1].c) >= 0) flush();
            }
        }
        flush();
        return out;
    }

    /* 玩法說明的內文元素：一句一個 <p class="dlg__line">，重點是 <strong class="dlg__em">（全部用 textContent，文字不會被當成 HTML） */
    Dlg.richText = function (text) {
        var box = h('div', { 'class': 'dlg__text dlg__rich' });
        lines(text).forEach(function (segs) {
            box.appendChild(h('p', { 'class': 'dlg__line' }, segs.map(function (s) {
                return s.em ? h('strong', { 'class': 'dlg__em', text: s.t }) : s.t;
            })));
        });
        return box;
    };
    Dlg.test = { emParts: emParts, lines: lines };

    /* ═══ 二、玩法說明彈窗 ═══
       game：Reaction.register 登記的遊戲物件（用它的 name 與 rule；rule 的排版見上面的 Dlg.richText）
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
        ruleCtl = Dlg.open({ low: true, cls: 'dlg--rule', title: game.name, children: [Dlg.richText(game.rule)], buttons: btns });
        fitRuleCard(ruleCtl);
        return ruleCtl;
    };

    /* 玩法說明太長、卡片比舞台放得下的還高時（說明很長的遊戲，加上右上角「?」重看時多一顆「世界排行榜」按鈕），
       把內文字級一格一格縮小，縮到剛好放得下為止（最小到 --fs-xs）。
       可用高度＝彈窗外框（標題列以下的舞台）的高度扣掉上下留白。網路字型載好之後字寬會變，所以載好再重算一次。 */
    function fitRuleCard(ctl) {
        var text = ctl.card.querySelector('.dlg__rich');
        if (!text) return;
        function run() {
            text.style.fontSize = '';
            var cs = global.getComputedStyle(ctl.el);
            var avail = ctl.el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
            var size = parseFloat(global.getComputedStyle(text).fontSize) || 26;
            var min = global.UI.cssPx ? global.UI.cssPx('--fs-xs', 22) : 22;
            var guard = 40;
            while (avail > 0 && ctl.card.offsetHeight > avail && size > min && guard-- > 0) {
                size -= 1;
                text.style.fontSize = size + 'px';
            }
        }
        run();
        if (global.document.fonts && global.document.fonts.ready) global.document.fonts.ready.then(function () { if (ctl.isOpen()) run(); });
    }

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
