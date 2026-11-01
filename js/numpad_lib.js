/* ═══════════════════════════════════════════════════════════════════
   numpad_lib.js — 「秒反應」共用的數字鍵盤（V1.42.0；時刻表補字、水果進出貨、抱著量體重 共用）
   樣式：css/numpad_lib.css（class 一律以「numpad-」開頭）
   ───────────────────────────────────────────────────────────────────
   · Reaction.numpad(parent, o)：在 parent 裡畫一個 3 欄的數字鍵盤，回傳 { el, setEnabled(bool) }。
       排列：7 8 9 ／ 4 5 6 ／ 1 2 3 ／ 清除 0 ⌫（跟計算機一樣，數字大的在上面）
       o.onKey(k)：按下任一鍵時呼叫；k 是 '0'～'9'、'del'（退一格）、'clr'（整格清掉）
       o.keyH：每顆鍵的高度（px，預設 64）
   · 只負責「按了哪一顆」，數字要填到哪一格、可以填幾位，由各遊戲自己決定。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    var h = UI.h, kit = Reaction.kit;

    Reaction.numpad = function (parent, o) {
        o = o || {};
        var keyH = o.keyH || 64;
        var rows = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['clr', '0', 'del']];
        var LABEL = { clr: '清除', del: '⌫' };
        var el = h('div', { 'class': 'numpad-wrap' });
        el.style.setProperty('--numpad-key-h', keyH + 'px');
        var btns = [];
        rows.forEach(function (row) {
            row.forEach(function (k) {
                var b = h('button', { 'class': 'btn btn--line numpad-key' + (k === 'clr' || k === 'del' ? ' numpad-key--fn' : ''), type: 'button', text: LABEL[k] || k });
                kit.onTap(b, function () { if (!b.disabled && o.onKey) o.onKey(k); });
                el.appendChild(b); btns.push(b);
            });
        });
        parent.appendChild(el);
        return {
            el: el,
            /* 整組鍵盤可不可以按（例如過關之後、電腦思考的時候） */
            setEnabled: function (on) { btns.forEach(function (b) { b.disabled = !on; }); }
        };
    };
})();
