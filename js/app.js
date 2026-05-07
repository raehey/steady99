/**
 * ===================================================
 *  동기부여 명언 앱 — 작동 로직
 * ===================================================
 *  1. 페이지 로드 → 첫 번째 명언 표시
 *  2. 화면 터치/클릭 → 다음 명언
 *  3. 1분마다 자동으로 다음 명언
 *  4. 크로스페이드: 이전 화면이 사라지며 새 화면이 겹쳐서 나타남
 *  5. 설정 패널: 글씨체, 색상, 크기, 속도, 카테고리 필터
 *  6. 랜덤 순서 + 중복 방지 (Fisher-Yates Shuffle)
 *  7. Wake Lock API → 화면 꺼짐 방지
 * ===================================================
 */

(function () {
  "use strict";

  // ── DOM 요소 ──────────────────────────────
  var layerA = document.getElementById("layer-a");
  var layerB = document.getElementById("layer-b");
  var settingsBtn = document.getElementById("settings-btn");
  var settingsPanel = document.getElementById("settings-panel");
  var settingsBackdrop = document.getElementById("settings-backdrop");

  // ── 상태 ──────────────────────────────────
  var current       = 0;
  var isDark        = true;            // 현재 테마
  var isAnimating   = false;
  var activeLayer   = layerA;          // 지금 보이는 레이어
  var hiddenLayer   = layerB;          // 숨겨진 레이어
  var autoTimer     = null;
  var AUTO_INTERVAL = 60 * 1000;       // 1분
  var FADE_DURATION = 1200;            // 크로스페이드 시간 (ms)

  // ── 설정 상태 ────────────────────────────
  var settings = {
    font: "Noto Sans KR",
    bgColor: "#000000",
    textColor: "#ffffff",
    fontSize: 5,
    autoSpeed: 60000,
    categories: {}  // {category: true/false, ...}
  };

  var filteredQuotes = [];
  var quoteIndices = [];  // 셔플된 인덱스 배열

  // ── Fisher-Yates Shuffle ──────────────────
  function shuffleArray(arr) {
    var result = arr.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  // ── 카테고리 필터링 & 셔플 ────────────────
  function rebuildFilteredQuotes() {
    filteredQuotes = quotes.filter(function (q) {
      var cat = q.category || "기타";
      return settings.categories[cat] !== false;
    });
    quoteIndices = shuffleArray(Object.keys(filteredQuotes).map(function (_, i) { return i; }));
    current = 0;
  }

  // ── 초기 카테고리 초기화 ──────────────────
  function initializeCategories() {
    var cats = {};
    quotes.forEach(function (q) {
      var cat = q.category || "기타";
      if (!(cat in cats)) {
        cats[cat] = true;
      }
    });
    settings.categories = cats;
  }

  // ── localStorage 로드 ──────────────────────
  function loadSettings() {
    var stored = localStorage.getItem("quoteSettings");
    if (stored) {
      var loaded = JSON.parse(stored);
      settings.font = loaded.font || settings.font;
      settings.bgColor = loaded.bgColor || settings.bgColor;
      settings.textColor = loaded.textColor || settings.textColor;
      settings.fontSize = loaded.fontSize || settings.fontSize;
      settings.autoSpeed = loaded.autoSpeed || settings.autoSpeed;
      settings.categories = loaded.categories || settings.categories;
    }
  }

  // ── localStorage 저장 ──────────────────────
  function saveSettings() {
    localStorage.setItem("quoteSettings", JSON.stringify(settings));
  }

  // ── 레이어에 명언 채우기 ──────────────────
  function fillLayer(layer, index, dark) {
    var quoteIndex = quoteIndices[index % quoteIndices.length];
    if (index >= quoteIndices.length) {
      // 한 사이클 완료, 새로 셔플
      quoteIndices = shuffleArray(Object.keys(filteredQuotes).map(function (_, i) { return i; }));
      quoteIndex = quoteIndices[index % quoteIndices.length];
    }

    var q = filteredQuotes[quoteIndex];
    layer.querySelector(".quote-text").textContent   = q.text;
    layer.querySelector(".quote-author").textContent = q.author ? "— " + q.author : "";

    // 테마 적용
    layer.classList.remove("dark", "light");
    layer.classList.add(dark ? "dark" : "light");

    // 커스텀 색상 적용
    if (!dark) {
      // light 모드에서는 텍스트 색상을 설정값으로 변경
      layer.style.backgroundColor = settings.bgColor;
      layer.querySelector(".quote-text").style.color = settings.textColor;
    } else {
      // dark 모드에서는 배경과 텍스트 색 반전
      var bgInvert = invertColor(settings.bgColor);
      var textInvert = invertColor(settings.textColor);
      layer.style.backgroundColor = bgInvert;
      layer.querySelector(".quote-text").style.color = textInvert;
    }
  }

  // ── 색상 반전 함수 ────────────────────────
  function invertColor(hex) {
    hex = hex.replace("#", "");
    var r = 255 - parseInt(hex.substring(0, 2), 16);
    var g = 255 - parseInt(hex.substring(2, 4), 16);
    var b = 255 - parseInt(hex.substring(4, 6), 16);
    return "#" + [r, g, b].map(function (x) {
      var hex = x.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("");
  }

  // ── 글씨체 적용 ────────────────────────────
  function applyFont() {
    document.documentElement.style.fontFamily = "'" + settings.font + "', sans-serif";
  }

  // ── 글씨 크기 적용 ─────────────────────────
  function applyFontSize() {
    var root = document.documentElement;
    var texts = document.querySelectorAll(".quote-text");
    texts.forEach(function (el) {
      el.style.fontSize = settings.fontSize + "vw";
    });
  }

  // ── 크로스페이드 전환 ─────────────────────
  function nextQuote() {
    if (isAnimating) return;
    isAnimating = true;

    // 다음 명언 & 반전 테마 준비
    current += 1;
    isDark  = !isDark;

    // 숨겨진 레이어에 새 내용 세팅
    fillLayer(hiddenLayer, current, isDark);

    // 크로스페이드: 동시에 하나는 나타나고, 하나는 사라짐
    hiddenLayer.classList.add("active");
    activeLayer.classList.remove("active");

    // 전환 완료 후 레이어 역할 교체
    var prevActive = activeLayer;
    activeLayer  = hiddenLayer;
    hiddenLayer  = prevActive;

    setTimeout(function () {
      isAnimating = false;
    }, FADE_DURATION);
  }

  // ── 자동 전환 타이머 ──────────────────────
  function resetAutoTimer() {
    clearInterval(autoTimer);
    autoTimer = setInterval(nextQuote, settings.autoSpeed);
  }

  // ── 설정 패널 토글 ────────────────────────
  function toggleSettings(e) {
    if (e) {
      e.stopPropagation();
    }
    settingsPanel.classList.toggle("active");
    settingsBackdrop.classList.toggle("active");
  }

  // ── 설정 패널 닫기 ────────────────────────
  function closeSettings() {
    settingsPanel.classList.remove("active");
    settingsBackdrop.classList.remove("active");
  }

  // ── 설정 UI 초기화 ────────────────────────
  function initializeSettingsUI() {
    // 글씨체 버튼
    var fontButtons = document.querySelectorAll(".font-btn");
    fontButtons.forEach(function (btn) {
      btn.classList.remove("active");
      if (btn.dataset.font === settings.font) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        settings.font = this.dataset.font;
        fontButtons.forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        applyFont();
        saveSettings();
      });
    });

    // 배경색 버튼
    var bgColorButtons = document.querySelectorAll(".bg-colors .color-btn");
    bgColorButtons.forEach(function (btn) {
      btn.classList.remove("active");
      if (btn.dataset.color === settings.bgColor) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        settings.bgColor = this.dataset.color;
        bgColorButtons.forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        fillLayer(activeLayer, current, isDark);
        fillLayer(hiddenLayer, current, !isDark);
        saveSettings();
      });
    });

    // 글씨색 버튼
    var textColorButtons = document.querySelectorAll(".text-colors .color-btn");
    textColorButtons.forEach(function (btn) {
      btn.classList.remove("active");
      if (btn.dataset.color === settings.textColor) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        settings.textColor = this.dataset.color;
        textColorButtons.forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        fillLayer(activeLayer, current, isDark);
        fillLayer(hiddenLayer, current, !isDark);
        saveSettings();
      });
    });

    // 글씨 크기 버튼
    var sizeButtons = document.querySelectorAll(".size-btn");
    sizeButtons.forEach(function (btn) {
      btn.classList.remove("active");
      if (parseInt(btn.dataset.size) === settings.fontSize) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        settings.fontSize = parseInt(this.dataset.size);
        sizeButtons.forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        applyFontSize();
        saveSettings();
      });
    });

    // 자동 전환 속도 버튼
    var speedButtons = document.querySelectorAll(".speed-btn");
    speedButtons.forEach(function (btn) {
      btn.classList.remove("active");
      if (parseInt(btn.dataset.speed) === settings.autoSpeed) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        settings.autoSpeed = parseInt(this.dataset.speed);
        speedButtons.forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        resetAutoTimer();
        saveSettings();
      });
    });

    // 카테고리 체크박스
    var categoryCheckboxes = document.querySelector(".category-checkboxes");
    categoryCheckboxes.innerHTML = "";
    Object.keys(settings.categories).forEach(function (cat) {
      var div = document.createElement("div");
      div.className = "checkbox-item";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "cat-" + cat;
      checkbox.checked = settings.categories[cat];
      checkbox.addEventListener("change", function (e) {
        e.stopPropagation();
        settings.categories[cat] = this.checked;
        rebuildFilteredQuotes();
        saveSettings();
      });
      var label = document.createElement("label");
      label.htmlFor = "cat-" + cat;
      label.textContent = cat;
      div.appendChild(checkbox);
      div.appendChild(label);
      categoryCheckboxes.appendChild(div);
    });
  }

  // ── 이벤트 바인딩 ─────────────────────────
  document.addEventListener("click", function (e) {
    if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
      nextQuote();
      resetAutoTimer();
    }
  });

  document.addEventListener("touchstart", function (e) {
    if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
      e.preventDefault();
      nextQuote();
      resetAutoTimer();
    }
  }, { passive: false });

  settingsBtn.addEventListener("click", toggleSettings);
  settingsBackdrop.addEventListener("click", closeSettings);

  // ── Wake Lock (화면 꺼짐 방지) ─────────────
  var wakeLock = null;

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (err) {
      // 무시
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      requestWakeLock();
    }
  });

  // ── 초기화 ────────────────────────────────
  initializeCategories();
  loadSettings();
  rebuildFilteredQuotes();
  applyFont();
  applyFontSize();
  initializeSettingsUI();
  fillLayer(activeLayer, current, isDark);
  requestWakeLock();
  resetAutoTimer();
})();
