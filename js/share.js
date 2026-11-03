/* ═══════════════════════════════════════════════════════════════════
   share.js — 主選單右上角的分享按鈕：彈出遊戲網址的 QR Code
   · 按鈕在 index.html 裡（#share-btn），彈窗容器也預先放在 #stage 裡（#share-dlg，
     跟 quiz.html 的 #confirm 一樣的做法），這樣才會跟著 Stage 的縮放走。
   · QR Code 用 qrcodejs（davidshimjs，MIT）畫，檔案放在 vendor/qrcode.min.js（跟遊戲一起離線快取，
     沒網路也能當面秀 QR Code 給朋友掃），第一次打開才載入；本機檔案載不到才改試 CDN。
   · 分享出去的網址（QR Code、複製連結、「分享出去」）都帶 ?openExternalBrowser=1：LINE 看到這個參數，
     會改用手機的瀏覽器（Safari／Chrome）開啟，而不是 LINE 內建的瀏覽器（內建瀏覽器不能加到主畫面、
     成績記錄也跟瀏覽器分開）。進站後 js/boot.js 會把這個參數從網址列拿掉，不會被存進書籤。
   · 「加到主畫面」按鈕：手機（還沒安裝、不在 LINE 之類的內建瀏覽器裡）才會出現，邏輯在 js/pwa.js。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* SHARE_URL：畫面上顯示的乾淨網址（給人看、給人手打）；SHARE_LINK：真正分享出去的連結，多一個
       LINE 認得的 ?openExternalBrowser=1（QR Code、複製連結、「分享出去」都用這個）。 */
    var SHARE_URL = 'https://weichenglin0215.github.io/FadingMemory/';
    var SHARE_LINK = SHARE_URL + '?openExternalBrowser=1';
    var SHARE_TITLE = '記憶模糊';
    var SHARE_TEXT = '推薦你一起玩「記憶模糊」，練習把紙條上的事情一件一件記起來！';
    /* QR Code 程式庫：先用專案裡的 vendor/（離線也能用），載不到才改試 CDN（版本號跟 vendor 裡的檔案一樣） */
    var QR_LIB_SRCS = [
        'vendor/qrcode.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    ];
    var QR_SIZE = 300;

    var h = UI.h;
    var dlg, qrWrap, copyBtn;
    var built = false;
    var qrDone = false;

    /* QR Code 畫圖的程式庫不是這個專案自己寫的（是別人寫好的套件 qrcodejs），但檔案放在
       vendor/ 裡跟遊戲一起發佈、一起被 sw.js 離線快取。不在 js/boot.js 的清單裡「一開始就載」，
       是因為大多數玩家根本不會點分享按鈕——等真的點了才載，省掉不需要的載入時間。
       window.QRCode 是這個套件載入完成後，自己掛到全域 window 上的建構子，
       所以「已經有 window.QRCode」就代表之前已經成功載過一次，不用重複載入。
       QR_LIB_SRCS 依序試：第一個失敗（onerror）就換下一個，全部失敗才顯示錯誤。 */
    function loadQrLib(cb, i) {
        i = i || 0;
        if (window.QRCode) { cb(); return; }
        if (i >= QR_LIB_SRCS.length) { qrWrap.textContent = 'QR Code 載入失敗，請檢查網路連線。'; return; }  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
        var s = document.createElement('script');
        s.src = QR_LIB_SRCS[i];
        s.onload = cb;
        s.onerror = function () { document.head.removeChild(s); loadQrLib(cb, i + 1); };
        document.head.appendChild(s);                   /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
    }

    function renderQr() {
        loadQrLib(function () {
            if (!window.QRCode || !qrWrap) return;
            qrWrap.innerHTML = '';                      /* innerHTML = ''：把元素裡面的東西全部清掉 */
            new window.QRCode(qrWrap, {
                text: SHARE_LINK,
                width: QR_SIZE,
                height: QR_SIZE,
                colorDark: '#4A3B1E',
                colorLight: '#FFFFFF',
                correctLevel: window.QRCode.CorrectLevel.H
            });
            qrDone = true;
        });
    }

    /* 複製連結到剪貼簿：優先用現代的 navigator.clipboard API，但它只在「安全環境」
       （HTTPS，或 localhost）才能用，所以本機用 file:// 雙擊打開、或透過不支援的
       舊瀏覽器開啟時，要有備援方案（fallback）——用一個看不見的 <textarea>、
       把文字塞進去、選取、呼叫瀏覽器最古老的 document.execCommand('copy') 複製指令。
       done()：複製成功後，按鈕文字短暫變成「已經複製」給使用者回饋，2.2 秒後
       改回原本文字。 */
    function copyLink() {
        var orig = copyBtn.textContent;
        function done() {
            copyBtn.textContent = '已經複製';
            UI.wait(2200).then(function () { copyBtn.textContent = orig; });
        }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = SHARE_LINK;
            ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) { }
            document.body.removeChild(ta);
            done();
        }
        if (navigator.clipboard && window.isSecureContext) {
            /* 有些環境（例如等使用者授權）會一直不 resolve，逾時就改用備援。
               mark() 包一層「settled」旗標：不管是 clipboard 的 Promise 先完成、
               還是 600 毫秒的逾時先到，只有第一個會真的執行，避免 done()/fallback()
               被重複呼叫兩次（例如先逾時跑了 fallback，結果 clipboard 又慢慢地
               也成功了，不該再跑一次 done()）。 */
            var settled = false;
            var mark = function (fn) { return function () { if (!settled) { settled = true; fn(); } }; };
            navigator.clipboard.writeText(SHARE_LINK).then(mark(done), mark(fallback));
            UI.wait(600).then(mark(fallback));
        } else {
            fallback();
        }
    }

    /* 「加到主畫面」按鈕（常駐入口；自動跳出的提示見 js/pwa.js）：PWA.canGuide() 為真才有
       （手機、還沒安裝、不在 LINE 之類的內建瀏覽器裡）。按下去先關掉分享彈窗，再打開安裝說明，
       不然兩個彈窗會疊在一起。沒有的話回傳 null，UI.h 會跳過 null 的子元素。 */
    function installBtn() {
        if (!window.PWA || !window.PWA.canGuide()) return null;
        return h('button', {
            'class': 'btn btn--go btn--sm', text: '加到手機主畫面',
            on: { click: function (e) { e.stopPropagation(); hide(); window.PWA.openGuide(); } }
        });
    }

    /* 「懶惰建立」（lazy-build）：彈窗的 DOM 內容不在頁面一打開就先建好，而是等
       使用者第一次真的按下分享按鈕才建立（build 旗標避免重複建立）。這個套路在
       js/menu.js 的主軸／遊戲挑選彈窗也用同一招——理由都一樣：大部分玩家可能
       整局都不會打開這些彈窗，先建好只是浪費。
       另外要注意「點擊外面關閉、點卡片本身不關閉」的做法：卡片（card）自己的
       click 事件呼叫 e.stopPropagation() 擋住事件往上冒泡，彈窗外層（dlg）的
       click 監聽器才會只在「點到卡片以外的地方」時觸發（見最下面 dlg.addEventListener
       ('click', hide)）。 */
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
                        navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_LINK }).catch(function () { });  /* catch：Promise（承諾）失敗時才執行的函式，這裡用來吞掉錯誤，避免整個程式中斷 */
                    }
                }
            }));
        }
        var card = h('div', { 'class': 'share-dlg__card', on: { click: function (e) { e.stopPropagation(); } } }, [
            h('div', { 'class': 'share-dlg__title', text: '掃碼分享給朋友' }),
            qrWrap,
            h('div', { 'class': 'share-dlg__url', text: SHARE_URL }),
            h('div', { 'class': 'row' }, actions),
            installBtn(),
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
