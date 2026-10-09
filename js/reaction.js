/* ═══════════════════════════════════════════════════════════════════
   reaction.js — 秒反應（reaction.html）進場控制
   · 主選單的挑選彈窗（js/menu.js）會帶 ?game=<id> 進來，指定要玩哪一個；
     找不到對應的 id（例如直接開 reaction.html 沒帶參數）才退回舊行為，
     從 Reaction.list() 隨機挑一個。
   · 先彈出說明彈窗（彈窗公版 Dlg.rule，見 js/dialog.js；它蓋在標題列「下面」，所以還沒開始遊戲就能按左上的「返回」），
     按「開始挑戰」才進遊戲；同一個遊戲可以無限次重玩（見各遊戲檔案）。
     有接上世界排行榜的遊戲（Reaction.register 時有 score 設定，見 js/leaderboard.js），
     流程多一步：說明彈窗按「下一步」→ 世界前 30 名彈窗（js/leaderboard_ui.js）→ 按「開始挑戰」才進遊戲；
     榜單在進場那一刻就開始背景下載（Leaderboard.prefetch），看說明的時候就已經抓好了。
     右上角「?」重看說明時多一顆「世界排行榜」按鈕，隨時可以再看榜。
   · 左上角「返回」永遠回主選單；右上角「?」可以隨時重看規則；「喇叭」開關音效。
   · 音效（js/sfx.js）統一在這裡接線：
       - 整個頁面的 pointerdown／pointerup／click／keydown 都呼叫 Sfx.unlock()
         （瀏覽器規定要有使用者手勢才能出聲）。
       - 用 MutationObserver 盯著 #screen：有「結算卡片」被加進來（帶 data-sfx，
         或舊遊戲的 .rx-result__num／.mc-result）就播過關／失敗的短旋律，接著循環
         播結算背景音樂；卡片被移除（再玩一次）就停。這樣七款舊遊戲不用改結算
         程式就有結算音樂。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var h = UI.h;
    var screen, barTitle, barMeta, barBack, barHelp, barSound;
    var game;
    /* hasBoard：這款遊戲有沒有接上世界排行榜（進場時決定） */
    var hasBoard = false;

    /* 這個函式本身存在的理由：各遊戲模組（reaction_drop.js 等）拿到的 ctx 物件
       只看得到 ctx.setMeta，看不到、也不需要知道 barMeta 這個 DOM 元素變數本身
       ——用一層函式包起來，遊戲模組不用知道標題列的 DOM 結構長怎樣，以後要改
       標題列的 HTML 結構，也只要改這個檔案，不用動到任何一個遊戲模組。 */
    function setMeta(text) { barMeta.textContent = text || ''; }

    /* 顯示玩法說明彈窗（彈窗公版 Dlg.rule）。onClose 是「使用者按下開始挑戰之後要做什麼」，由呼叫端
       決定——進場時傳的是「真的開始 mount 遊戲」（有排行榜的遊戲是「先彈排行榜」），
       右上角「?」重看規則時傳的是空函式（什麼都不用做，因為遊戲早就已經在進行中了）。
       opts.okText：主按鈕文字（預設「開始挑戰」）；
       opts.softSound：主按鈕只播輕觸聲（下一步不是真的開始，不播「開始」的嗶聲）；
       opts.boardButton：多放一顆「世界排行榜」按鈕，點了可以隨時看榜。 */
    function showRule(onClose, opts) {
        opts = opts || {};
        Dlg.rule(game, { okText: opts.okText, softSound: opts.softSound, boardButton: opts.boardButton, onClose: onClose });
    }

    /* 喇叭按鈕：圖示跟著目前是否靜音換 */
    function paintSound() {
        barSound.innerHTML = UI.icon(Sfx.isMuted() ? 'mute' : 'volume');
        barSound.setAttribute('aria-label', Sfx.isMuted() ? '開啟音效' : '關閉音效');
    }

    /* 結算畫面偵測（見檔案最上面的說明） */
    var RESULT_SEL = '[data-sfx], .rx-result__num, .mc-result';
    function findResult(node) {
        if (!node || node.nodeType !== 1) return null;
        if (node.matches && node.matches(RESULT_SEL)) return node;
        return node.querySelector ? node.querySelector(RESULT_SEL) : null;
    }
    function watchResults() {
        if (!window.MutationObserver) return;
        var showing = null;
        var bgmTimer = null;
        /* 讓排行榜（js/leaderboard.js）知道「現在畫面上有沒有結算卡片」：
           沒有就代表玩家已經開始下一局，進榜的恭喜不要用大彈窗打斷他 */
        Reaction.resultShowing = function () { return !!showing; };
        new MutationObserver(function (list) {
            list.forEach(function (m) {
                Array.prototype.forEach.call(m.addedNodes, function (n) {
                    var el = findResult(n);
                    if (!el || showing) return;
                    showing = el;
                    var kind = el.getAttribute && el.getAttribute('data-sfx');
                    /* 帶 data-sfx 的卡片自己決定輸贏；舊遊戲的結算不知道輸贏，播中性的「完成」音 */
                    Sfx.play(kind === 'win' ? 'win' : kind === 'fail' ? 'fail' : kind === 'perfect' ? 'perfect' : 'done');
                    clearTimeout(bgmTimer);
                    /* data-bgm="0"：只播短旋律，不接結算背景音樂（例如多關卡遊戲每一關的小結算） */
                    if (!el.getAttribute || el.getAttribute('data-bgm') !== '0') {
                        bgmTimer = setTimeout(function () { if (showing) Sfx.bgm('result'); }, 1100);
                    }
                });
                Array.prototype.forEach.call(m.removedNodes, function (n) {
                    if (showing && findResult(n)) {
                        showing = null;
                        clearTimeout(bgmTimer);
                        Sfx.stopBgm();
                    }
                });
            });
        }).observe(screen, { childList: true, subtree: true });
    }

    UI.ready(function () {
        Stage.init();
        screen = document.getElementById('screen');
        barTitle = document.getElementById('bar-title');
        barMeta = document.getElementById('bar-meta');
        barBack = document.getElementById('bar-back');
        barHelp = document.getElementById('bar-help');
        barSound = document.getElementById('bar-sound');

        barBack.innerHTML = UI.icon('back') + '<span>返回</span>';
        barBack.addEventListener('click', function () { Sfx.stopBgm(); location.href = 'index.html'; });
        barHelp.addEventListener('click', function () {
            Sfx.play('click');
            showRule(function () { }, hasBoard ? { okText: '知道了', softSound: true, boardButton: true } : null);
        });
        if (barSound) {
            paintSound();
            barSound.addEventListener('click', function () {
                Sfx.unlock();
                Sfx.toggle();
                paintSound();
                Sfx.play('click');
            });
        }

        ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend'].forEach(function (ev) {
            document.addEventListener(ev, Sfx.unlock, true);
        });
        watchResults();

        var list = Reaction.list();
        /* 從網址的 query string 讀 ?game=xxx（js/menu.js 的挑選彈窗會帶這個參數）；
           用正規表達式抓出 game= 後面的英文字母。找不到符合的 id（m 是 null，
           或清單裡沒有這個 id）就退回隨機挑一個，保留「直接開 reaction.html
           不帶參數」也能玩的舊行為。 */
        var m = /[?&]game=([a-z0-9]+)/.exec(location.search);
        var want = m && list.filter(function (g) { return g.id === m[1]; })[0];
        game = want || list[Math.floor(Math.random() * list.length)];
        barTitle.textContent = game.name;
        /* 告訴共用工具「現在玩的是哪一款」：kit.result 帶 score 時，會用它把成績送到這一款的世界排行榜 */
        Reaction.current = game;

        /* 世界排行榜：這款遊戲有 score 設定、而且排行榜的畫面檔有載入，才接上排行榜。
           Leaderboard.init() 會（稍後）補送上次沒送出去的成績；
           Leaderboard.prefetch() 馬上開始背景下載這款遊戲的榜單，玩家看玩法說明的時候就抓好了。 */
        hasBoard = !!(window.Leaderboard && Leaderboard.supports(game) && typeof Leaderboard.showBoard === 'function');
        if (window.Leaderboard) Leaderboard.init();
        if (hasBoard) Leaderboard.prefetch(game);

        /* 先秀規則彈窗，使用者按「開始挑戰」才真正呼叫 game.mount()——
           把畫面交給選中的那個遊戲模組自己接手畫、自己管理狀態，
           這個檔案從這之後就不再插手這局遊戲怎麼進行。
           有排行榜的遊戲：說明彈窗按「下一步」→ 世界前 30 名彈窗 → 按「開始挑戰」才開始。 */
        function startGame() { game.mount(screen, { setMeta: setMeta }); }
        if (hasBoard) {
            showRule(function () {
                Leaderboard.showBoard(game, { startText: '開始挑戰', onClose: startGame });
            }, { okText: '下一步', softSound: true });
        } else {
            showRule(startGame);
        }
    });
})();
