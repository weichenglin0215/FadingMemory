/* ═══════════════════════════════════════════════════════════════════
   reaction.js — 秒反應（reaction.html）進場控制
   · 主選單的挑選彈窗（js/menu.js）會帶 ?game=<id> 進來，指定要玩哪一個；
     找不到對應的 id（例如直接開 reaction.html 沒帶參數）才退回舊行為，
     從 Reaction.list() 隨機挑一個。
   · 先彈出說明彈窗，按「開始挑戰」才進遊戲；同一個遊戲可以無限次重玩（見各遊戲檔案）。
   · 左上角「返回」永遠回主選單；右上角「?」可以隨時重看規則。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var h = UI.h;
    var screen, barTitle, barMeta, barBack, barHelp, ruleDlg;
    var game;

    /* 這個函式本身存在的理由：各遊戲模組（reaction_drop.js 等）拿到的 ctx 物件
       只看得到 ctx.setMeta，看不到、也不需要知道 barMeta 這個 DOM 元素變數本身
       ——用一層函式包起來，遊戲模組不用知道標題列的 DOM 結構長怎樣，以後要改
       標題列的 HTML 結構，也只要改這個檔案，不用動到任何一個遊戲模組。 */
    function setMeta(text) { barMeta.textContent = text || ''; }

    /* 顯示玩法說明彈窗。onClose 是「使用者按下開始挑戰之後要做什麼」，由呼叫端
       決定——進場時傳的是「真的開始 mount 遊戲」，右上角「?」重看規則時傳的是
       空函式（什麼都不用做，因為遊戲早就已經在進行中了）。 */
    function showRule(onClose) {
        ruleDlg.innerHTML = '';
        ruleDlg.appendChild(h('div', { 'class': 'rule-dlg__card' }, [
            h('div', { 'class': 'rule-dlg__title', text: game.name }),
            h('div', { 'class': 'rule-dlg__text', text: game.rule }),
            h('button', {
                'class': 'btn btn--primary', text: '開始挑戰',
                on: { click: function () { ruleDlg.hidden = true; onClose(); } }
            })
        ]));
        ruleDlg.hidden = false;
    }

    UI.ready(function () {
        Stage.init();
        screen = document.getElementById('screen');
        barTitle = document.getElementById('bar-title');
        barMeta = document.getElementById('bar-meta');
        barBack = document.getElementById('bar-back');
        barHelp = document.getElementById('bar-help');
        ruleDlg = document.getElementById('rule-dlg');

        barBack.innerHTML = UI.icon('back') + '<span>返回</span>';
        barBack.addEventListener('click', function () { location.href = 'index.html'; });
        barHelp.addEventListener('click', function () { showRule(function () { }); });

        var list = Reaction.list();
        /* 從網址的 query string 讀 ?game=xxx（js/menu.js 的挑選彈窗會帶這個參數）；
           用正規表達式抓出 game= 後面的英文字母。找不到符合的 id（m 是 null，
           或清單裡沒有這個 id）就退回隨機挑一個，保留「直接開 reaction.html
           不帶參數」也能玩的舊行為。 */
        var m = /[?&]game=([a-z]+)/.exec(location.search);
        var want = m && list.filter(function (g) { return g.id === m[1]; })[0];
        game = want || list[Math.floor(Math.random() * list.length)];
        barTitle.textContent = game.name;

        /* 先秀規則彈窗，使用者按「開始挑戰」才真正呼叫 game.mount()——
           把畫面交給選中的那個遊戲模組自己接手畫、自己管理狀態，
           這個檔案從這之後就不再插手這局遊戲怎麼進行。 */
        showRule(function () { game.mount(screen, { setMeta: setMeta }); });
    });
})();
