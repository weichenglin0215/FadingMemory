/* ═══════════════════════════════════════════════════════════════════
   share.js — 主選單右上角的分享按鈕：彈出遊戲網址的 QR Code
   · 按鈕在 index.html 裡（#share-btn），彈窗容器也預先放在 #stage 裡（#share-dlg，
     跟 quiz.html 的 #confirm 一樣的做法），這樣才會跟著 Stage 的縮放走。
   · QR Code 用 qrcodejs（davidshimjs，MIT）畫，第一次打開才從 CDN 載入。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var SHARE_URL = 'https://weichenglin0215.github.io/FadingMemory/';
    var SHARE_TITLE = '記憶模糊';
    var SHARE_TEXT = '推薦你一起玩「記憶模糊」，練習把紙條上的事情一件一件記起來！';
    var QR_LIB_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    var QR_SIZE = 300;

    var h = UI.h;
    var dlg, qrWrap, copyBtn;
    var built = false;
    var qrDone = false;

    function loadQrLib(cb) {
        if (window.QRCode) { cb(); return; }
        var s = document.createElement('script');
        s.src = QR_LIB_SRC;
        s.onload = cb;
        s.onerror = function () { qrWrap.textContent = 'QR Code 載入失敗，請檢查網路連線。'; };
        document.head.appendChild(s);
    }

    function renderQr() {
        loadQrLib(function () {
            if (!window.QRCode || !qrWrap) return;
            qrWrap.innerHTML = '';
            new window.QRCode(qrWrap, {
                text: SHARE_URL,
                width: QR_SIZE,
                height: QR_SIZE,
                colorDark: '#4A3B1E',
                colorLight: '#FFFFFF',
                correctLevel: window.QRCode.CorrectLevel.H
            });
            qrDone = true;
        });
    }

    function copyLink() {
        var orig = copyBtn.textContent;
        function done() {
            copyBtn.textContent = '已經複製';
            UI.wait(2200).then(function () { copyBtn.textContent = orig; });
        }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = SHARE_URL;
            ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) { }
            document.body.removeChild(ta);
            done();
        }
        if (navigator.clipboard && window.isSecureContext) {
            /* 有些環境（例如等使用者授權）會一直不 resolve，逾時就改用備援 */
            var settled = false;
            var mark = function (fn) { return function () { if (!settled) { settled = true; fn(); } }; };
            navigator.clipboard.writeText(SHARE_URL).then(mark(done), mark(fallback));
            UI.wait(600).then(mark(fallback));
        } else {
            fallback();
        }
    }

    function build() {
        built = true;
        qrWrap = h('div', { 'class': 'share-dlg__qr' }, [h('span', { 'class': 'hint', text: '載入中…' })]);
        copyBtn = h('button', {
            'class': 'btn btn--line btn--sm', text: '複製連結',
            on: { click: function (e) { e.stopPropagation(); copyLink(); } }
        });
        var actions = [copyBtn];
        if (navigator.share) {
            actions.unshift(h('button', {
                'class': 'btn btn--sky btn--sm', text: '分享出去',
                on: {
                    click: function (e) {
                        e.stopPropagation();
                        navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL }).catch(function () { });
                    }
                }
            }));
        }
        var card = h('div', { 'class': 'share-dlg__card', on: { click: function (e) { e.stopPropagation(); } } }, [
            h('div', { 'class': 'share-dlg__title', text: '掃碼分享給朋友' }),
            qrWrap,
            h('div', { 'class': 'share-dlg__url', text: SHARE_URL }),
            h('div', { 'class': 'row' }, actions),
            h('div', { 'class': 'share-dlg__hint', text: '點擊其他地方關閉' })
        ]);
        dlg.appendChild(card);
        dlg.addEventListener('click', hide);
    }

    function show() {
        if (!built) build();
        dlg.hidden = false;
        if (!qrDone) renderQr();
    }

    function hide() { dlg.hidden = true; }

    UI.ready(function () {
        var btn = document.getElementById('share-btn');
        var iconEl = document.getElementById('icon-share');
        dlg = document.getElementById('share-dlg');
        if (!btn || !dlg) return;
        if (iconEl) iconEl.innerHTML = UI.icon('share');
        btn.addEventListener('click', show);
    });
})();
