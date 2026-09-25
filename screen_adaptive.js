/* ═══════════════════════════════════════════════════════
   screen_adaptive.js — 滿版縮放核心邏輯

   設計邏輯尺寸（依長寬比 5:8.5）：
     DESIGN_W = 500px
     DESIGN_H = 850px

   縮放公式：
     scale = Math.min(視窗寬 / DESIGN_W, 視窗高 / DESIGN_H)

   為什麼用 visualViewport 而非 vw/vh？
     → zoom 後 vw 不變，但 visualViewport.width 反映真實可用寬度。
     → 手機軟鍵盤彈出時 visualViewport 會縮小，innerHeight 不一定會。

   字體為什麼在 stage 內用 px？
     → rem / em 受系統字體大小影響，
       系統字體放大 150% → rem 跟著放大 → 元件跑版。
     → px 在 transform:scale() 容器內是固定的邏輯像素，
       整體一起縮放，不受外部 rem 基準影響。
   ═══════════════════════════════════════════════════════ */

/* ─── 邏輯尺寸常數（修改這裡即可調整長寬比） ─── */
const DESIGN_W = 500;
const DESIGN_H = 850;

/* ─── 取得舞台元素 ─── */
const stage = document.getElementById('stage');

/**
 * applyScale()
 * 計算縮放比例並套用至 #stage
 * 同時更新右上角 debug 資訊（可移除）
 */
function applyScale() {
    /* 優先用 visualViewport（手機鍵盤彈出 / iOS Safari 縮放更精確） */
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;

    /* 以「不超出畫面」為原則，取較小縮放值 */
    const scale = Math.min(vw / DESIGN_W, vh / DESIGN_H);

    const scaledW = DESIGN_W * scale;
    const scaledH = DESIGN_H * scale;

    /* 水平、垂直置中 */
    const left = (vw - scaledW) / 2;
    const top  = (vh - scaledH) / 2;

    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${left}px`;
    stage.style.top  = `${top}px`;

    /* 暴露給其他模組使用（例如 calendar.js 需要將螢幕px轉換為邏輯px） */
    window.stageScale = scale;

    /* ─── 暴露 stage 的螢幕位置/尺寸，供 overlay 元件定位 ─── */
    window.stageRect = {
        left:   left,
        top:    top,
        width:  scaledW,
        height: scaledH,
        scale:  scale
    };

    /* 通知所有已註冊的 overlay 更新自身位置 */
    if (window._overlayResizeCallbacks) {
        window._overlayResizeCallbacks.forEach(fn => { try { fn(window.stageRect); } catch(e){} });
    }

    /* Debug 資訊（可移除） */
    const elScale = document.getElementById('info-scale');
    const elSize  = document.getElementById('info-size');
    if (elScale) elScale.textContent = `×${scale.toFixed(3)}`;
    if (elSize)  elSize.textContent  = `${Math.round(vw)} × ${Math.round(vh)}`;
}

/**
 * registerOverlayResize(fn)
 * 讓需要跟隨 stage 位置的 overlay（intro、achievement、poem_dialog 等）
 * 在每次 applyScale 後自動收到通知並更新自身尺寸/位置。
 *
 * @param {Function} fn - 接受 stageRect 參數的回呼函式
 */
window.registerOverlayResize = function(fn) {
    if (!window._overlayResizeCallbacks) window._overlayResizeCallbacks = [];
    window._overlayResizeCallbacks.push(fn);
    /* 若 stageRect 已算好，立即執行一次 */
    if (window.stageRect) fn(window.stageRect);
};

/* ─── 事件監聽 ─── */

/* 一般視窗大小改變（電腦調整視窗、旋轉裝置） */
window.addEventListener('resize', applyScale);

/* visualViewport 事件（手機鍵盤彈出 / iOS Safari 縮放列顯示/隱藏） */
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', applyScale);
    window.visualViewport.addEventListener('scroll', applyScale);
}

/* ─── 初始化：DOM 載入後立即執行 ─── */
document.addEventListener('DOMContentLoaded', applyScale);