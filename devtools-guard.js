(function () {
  "use strict";

  if (window.__curiosityGuardInstalled) return;
  window.__curiosityGuardInstalled = true;

  // Cho phép tắt tạm khi cần phát triển: thêm ?dev vào URL.
  if (new URLSearchParams(window.location.search).has("dev")) return;

  window.__curiosityGuardActive = false;

  function isDesktopDevice() {
    var uaData = navigator.userAgentData;
    if (uaData && typeof uaData.mobile === "boolean" && uaData.mobile) {
      return false;
    }

    var ua = navigator.userAgent || "";

    // Android (kể cả tablet), iPhone/iPad cũ, Opera Mini, tablet nói chung.
    if (/Android|iPhone|iPod|iPad|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) {
      return false;
    }

    // iPadOS 13+ giả làm Macintosh.
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) {
      return false;
    }

    // Điện thoại bật "Desktop site" vẫn có màn hình nhỏ.
    if (
      window.screen &&
      Math.min(window.screen.width, window.screen.height) < 768
    ) {
      return false;
    }

    return true;
  }

  // Chỉ chống tò mò trên laptop/PC; mobile để yên.
  if (!isDesktopDevice()) return;

  var THRESHOLD_PX = 160;
  var ABSOLUTE_WIDTH_PX = 160;
  var ABSOLUTE_HEIGHT_PX = 200;
  var CHECK_INTERVAL_MS = 1000;
  var RESHOW_DELAY_MS = 4000;
  var MIN_VISIBLE_MS = 1200;

  var overlay = null;
  var dismissButton = null;
  var isVisible = false;
  var shownAt = 0;
  var dismissedUntil = 0;
  var lastFocusedElement = null;
  var baselineWidthGap = null;
  var baselineHeightGap = null;
  var lastDpr = window.devicePixelRatio || 1;

  function isViewportMeasurable() {
    // Trên một số trình duyệt di động, outerWidth/outerHeight bằng 0.
    return window.outerWidth > 0 && window.outerHeight > 0;
  }

  function measureGaps() {
    return {
      widthGap: window.outerWidth - window.innerWidth,
      heightGap: window.outerHeight - window.innerHeight,
    };
  }

  function resetBaseline() {
    if (!isViewportMeasurable()) return;

    var gaps = measureGaps();
    baselineWidthGap = gaps.widthGap;
    baselineHeightGap = gaps.heightGap;
    lastDpr = window.devicePixelRatio || 1;
  }

  function isDevtoolsOpen() {
    if (!isViewportMeasurable()) return false;

    var gaps = measureGaps();
    var widthGap = Math.max(gaps.widthGap, 0);
    var heightGap = Math.max(gaps.heightGap, 0);

    // Bắt trường hợp DevTools đã mở sẵn từ trước khi tải lại trang (F5 / Ctrl+R).
    // Ngưỡng này đo phần chrome của trình duyệt nên không phụ thuộc OS scaling.
    if (widthGap > ABSOLUTE_WIDTH_PX || heightGap > ABSOLUTE_HEIGHT_PX) {
      return true;
    }

    var dpr = window.devicePixelRatio || 1;
    if (dpr !== lastDpr) {
      // Zoom trình duyệt làm thay đổi số đo, không phải DevTools.
      baselineWidthGap = gaps.widthGap;
      baselineHeightGap = gaps.heightGap;
      lastDpr = dpr;
      return false;
    }

    if (baselineWidthGap === null) {
      baselineWidthGap = gaps.widthGap;
      baselineHeightGap = gaps.heightGap;
      return false;
    }

    return (
      gaps.widthGap - baselineWidthGap > THRESHOLD_PX ||
      gaps.heightGap - baselineHeightGap > THRESHOLD_PX
    );
  }

  function createOverlay() {
    overlay = document.createElement("div");
    overlay.className = "curiosity-guard";
    overlay.id = "curiosityGuard";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "curiosityGuardTitle");
    overlay.setAttribute("aria-describedby", "curiosityGuardText");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML =
      '<div class="curiosity-guard-card">' +
      '<div class="curiosity-guard-emoji" aria-hidden="true">👀</div>' +
      '<h2 class="curiosity-guard-title" id="curiosityGuardTitle">Bạn đừng tò mò nhé</h2>' +
      '<p class="curiosity-guard-text" id="curiosityGuardText">Ở đây chỉ có hoa thôi. Đừng tò mò gì nữa nhé 😅</p>' +
      '<button type="button" class="curiosity-guard-button">Mình hứa không tò mò nữa</button>' +
      "</div>";

    dismissButton = overlay.querySelector(".curiosity-guard-button");
    dismissButton.addEventListener("click", dismissOverlay);
    document.body.appendChild(overlay);
  }

  function showOverlay() {
    if (!overlay) createOverlay();
    if (isVisible) return;

    isVisible = true;
    shownAt = Date.now();
    lastFocusedElement = document.activeElement;
    overlay.classList.add("is-visible");
    overlay.setAttribute("aria-hidden", "false");
    dismissButton.focus({ preventScroll: true });
  }

  function hideOverlay() {
    if (!overlay || !isVisible) return;

    isVisible = false;
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");

    if (lastFocusedElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus({ preventScroll: true });
    }
    lastFocusedElement = null;
  }

  function dismissOverlay() {
    dismissedUntil = Date.now() + RESHOW_DELAY_MS;
    hideOverlay();
  }

  function emitGuardEvent(name) {
    var event;
    if (typeof CustomEvent === "function") {
      event = new CustomEvent(name);
    } else {
      event = document.createEvent("Event");
      event.initEvent(name, false, false);
    }
    window.dispatchEvent(event);
  }

  function setGuardActive(active) {
    if (window.__curiosityGuardActive === active) return;

    window.__curiosityGuardActive = active;
    emitGuardEvent(active ? "curiosityguard:block" : "curiosityguard:release");
  }

  function sync() {
    var open = isDevtoolsOpen();
    setGuardActive(open);

    if (!open) {
      // Giữ bảng hiện đủ lâu để người bấm F12 kịp đọc, dù DevTools mở dạng cửa sổ riêng.
      if (isVisible && Date.now() - shownAt < MIN_VISIBLE_MS) return;

      dismissedUntil = 0;
      hideOverlay();
      return;
    }

    if (Date.now() < dismissedUntil) {
      hideOverlay();
      return;
    }

    showOverlay();
  }

  function isDevtoolsShortcut(event) {
    var key = (event.key || "").toLowerCase();

    if (event.key === "F12") return true;

    if (event.ctrlKey && event.shiftKey && ["i", "j", "c"].indexOf(key) !== -1) {
      return true;
    }

    // Phím tắt macOS: Cmd + Option + I/J/C.
    if (event.metaKey && event.altKey && ["i", "j", "c"].indexOf(key) !== -1) {
      return true;
    }

    return false;
  }

  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key === "Escape" && isVisible) {
        event.preventDefault();
        dismissOverlay();
        return;
      }

      if (!isDevtoolsShortcut(event)) return;

      event.preventDefault();
      dismissedUntil = 0;
      showOverlay();
    },
    true
  );

  window.addEventListener("resize", sync);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) sync();
  });
  window.addEventListener("load", sync);

  resetBaseline();
  sync();
  window.setInterval(sync, CHECK_INTERVAL_MS);
})();
