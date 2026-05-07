/**
 * ===================================================
 *  동기부여 명언 앱 — 작동 로직
 * ===================================================
 *  1. 페이지 로드 → 첫 번째 명언 표시
 *  2. 화면 터치/클릭 → 다음 명언
 *  3. 자동 전환 (설정 가능)
 *  4. 크로스페이드 + 색상 반전
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
  var isDark        = true;
  var isAnimating   = false;
  var activeLayer   = layerA;
  var hiddenLayer   = layerB;
  var autoTimer     = null;
  var FADE_DURATION = 1200;

  // ── 설정 상태 ────────────────────────────
  var settings = {
    font: "Noto Sans KR",
    bgColor: "#000000",
    textColor: "#ffffff",
    fontSize: 5,
    autoSpeed: 60000,
    categories: {}
  };

  var filteredQuotes = [];
  var quoteIndices = [];
  var randomFont = false;
  var fontList = [
    "Noto Sans KR", "Noto Serif KR", "Black Han Sans", "Do Hyeon",
    "Nanum Brush Script", "Nanum Pen Script", "Gowun Batang",
    "Dongle", "Gowun Dodum", "Song Myung"
  ];
  var fontIndex = 0;

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
    if (filteredQuotes.length === 0) {
      filteredQuotes = quotes.slice();
    }
    var indices = [];
    for (var i = 0; i < filteredQuotes.length; i++) {
      indices.push(i);
    }
    quoteIndices = shuffleArray(indices);
    current = 0;
  }

  // ── 초기 카테고리 초기화 ──────────────────
  function initializeCategories() {
    var cats = {};
    for (var i = 0; i < quotes.length; i++) {
      var cat = quotes[i].category || "기타";
      if (!(cat in cats)) {
        cats[cat] = true;
      }
    }
    settings.categories = cats;
  }

  // ── localStorage 로드 ──────────────────────
  function loadSettings() {
    try {
      var stored = localStorage.getItem("quoteSettings");
      if (stored) {
        var loaded = JSON.parse(stored);
        if (loaded.font) settings.font = loaded.font;
        if (loaded.bgColor) settings.bgColor = loaded.bgColor;
        if (loaded.textColor) settings.textColor = loaded.textColor;
        if (loaded.fontSize) settings.fontSize = loaded.fontSize;
        if (loaded.autoSpeed) settings.autoSpeed = loaded.autoSpeed;
        if (typeof loaded.randomFont === "boolean") randomFont = loaded.randomFont;
        if (loaded.categories) {
          for (var cat in loaded.categories) {
            if (cat in settings.categories) {
              settings.categories[cat] = loaded.categories[cat];
            }
          }
        }
      }
    } catch (e) {
      // localStorage 접근 불가 시 무시
    }
  }

  // ── localStorage 저장 ──────────────────────
  function saveSettings() {
    try {
      var saveData = JSON.parse(JSON.stringify(settings));
      saveData.randomFont = randomFont;
      localStorage.setItem("quoteSettings", JSON.stringify(saveData));
    } catch (e) {
      // 무시
    }
  }

  // ── 레이어에 명언 채우기 ──────────────────
  function fillLayer(layer, index, dark) {
    if (quoteIndices.length === 0) return;

    // 한 사이클 완료 시 리셔플
    if (index >= quoteIndices.length) {
      var indices = [];
      for (var i = 0; i < filteredQuotes.length; i++) {
        indices.push(i);
      }
      quoteIndices = shuffleArray(indices);
      current = 0;
      index = 0;
    }

    var quoteIndex = quoteIndices[index % quoteIndices.length];
    var q = filteredQuotes[quoteIndex];
    if (!q) return;

    layer.querySelector(".quote-text").textContent = q.text;
    layer.querySelector(".quote-author").textContent = q.author ? "— " + q.author : "";

    // 테마 적용
    layer.classList.remove("dark", "light");
    layer.classList.add(dark ? "dark" : "light");

    // 커스텀 색상 적용
    if (!dark) {
      layer.style.backgroundColor = settings.bgColor;
      layer.querySelector(".quote-text").style.color = settings.textColor;
    } else {
      layer.style.backgroundColor = invertColor(settings.bgColor);
      layer.querySelector(".quote-text").style.color = invertColor(settings.textColor);
    }

    // 글씨체 적용
    var currentFont = settings.font;
    if (randomFont) {
      currentFont = fontList[fontIndex % fontList.length];
      fontIndex++;
    }
    layer.querySelector(".quote-text").style.fontFamily = "'" + currentFont + "', sans-serif";
    layer.querySelector(".quote-author").style.fontFamily = "'" + currentFont + "', sans-serif";
  }

  // ── 색상 반전 ────────────────────────────
  function invertColor(hex) {
    hex = hex.replace("#", "");
    var r = 255 - parseInt(hex.substring(0, 2), 16);
    var g = 255 - parseInt(hex.substring(2, 4), 16);
    var b = 255 - parseInt(hex.substring(4, 6), 16);
    return "#" + [r, g, b].map(function (x) {
      var s = x.toString(16);
      return s.length === 1 ? "0" + s : s;
    }).join("");
  }

  // ── 글씨체 적용 ──────────────────────────
  function applyFont() {
    var allTexts = document.querySelectorAll(".quote-text");
    var allAuthors = document.querySelectorAll(".quote-author");
    for (var i = 0; i < allTexts.length; i++) {
      allTexts[i].style.fontFamily = "'" + settings.font + "', sans-serif";
    }
    for (var j = 0; j < allAuthors.length; j++) {
      allAuthors[j].style.fontFamily = "'" + settings.font + "', sans-serif";
    }
  }

  // ── 글씨 크기 적용 ────────────────────────
  function applyFontSize() {
    var texts = document.querySelectorAll(".quote-text");
    for (var i = 0; i < texts.length; i++) {
      texts[i].style.fontSize = settings.fontSize + "vw";
    }
  }

  // ── 크로스페이드 전환 ─────────────────────
  function nextQuote() {
    if (isAnimating) return;
    isAnimating = true;

    current += 1;
    isDark = !isDark;

    fillLayer(hiddenLayer, current, isDark);

    hiddenLayer.classList.add("active");
    activeLayer.classList.remove("active");

    var prevActive = activeLayer;
    activeLayer = hiddenLayer;
    hiddenLayer = prevActive;

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
    if (e) e.stopPropagation();
    settingsPanel.classList.toggle("active");
    settingsBackdrop.classList.toggle("active");
  }

  function closeSettings() {
    settingsPanel.classList.remove("active");
    settingsBackdrop.classList.remove("active");
  }

  // ── 설정 UI 초기화 ────────────────────────
  function initializeSettingsUI() {

    // ── 카테고리 토글 버튼 ──────────────────
    var categoryContainer = document.getElementById("category-toggles");
    categoryContainer.innerHTML = "";
    var cats = Object.keys(settings.categories);
    for (var ci = 0; ci < cats.length; ci++) {
      (function (cat) {
        var btn = document.createElement("button");
        btn.className = "cat-toggle" + (settings.categories[cat] ? " active" : "");
        btn.textContent = cat;
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.categories[cat] = !settings.categories[cat];
          this.classList.toggle("active");
          rebuildFilteredQuotes();
          fillLayer(activeLayer, current, isDark);
          saveSettings();
        });
        categoryContainer.appendChild(btn);
      })(cats[ci]);
    }

    // ── 글씨체 버튼 ────────────────────────
    var fontButtons = document.querySelectorAll(".font-btn");
    var fontRandomBtn = document.getElementById("font-random-btn");

    // 랜덤 초기 상태 복원
    if (randomFont) {
      fontRandomBtn.classList.add("active");
    }

    for (var fi = 0; fi < fontButtons.length; fi++) {
      (function (btn) {
        if (btn.id !== "font-random-btn") {
          btn.classList.remove("active");
          if (!randomFont && btn.getAttribute("data-font") === settings.font) {
            btn.classList.add("active");
          }
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var selectedFont = this.getAttribute("data-font");

          if (selectedFont === "__random__") {
            // 랜덤 토글
            randomFont = !randomFont;
            if (randomFont) {
              for (var k = 0; k < fontButtons.length; k++) {
                fontButtons[k].classList.remove("active");
              }
              this.classList.add("active");
              fontIndex = 0;
            } else {
              this.classList.remove("active");
              // 기본 폰트로 복원
              settings.font = "Noto Sans KR";
              for (var k = 0; k < fontButtons.length; k++) {
                if (fontButtons[k].getAttribute("data-font") === settings.font) {
                  fontButtons[k].classList.add("active");
                }
              }
              applyFont();
            }
            saveSettings();
            return;
          }

          // 일반 폰트 선택 시 랜덤 해제
          randomFont = false;
          settings.font = selectedFont;
          for (var k = 0; k < fontButtons.length; k++) {
            fontButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          applyFont();
          saveSettings();
        });
      })(fontButtons[fi]);
    }

    // ── 배경색 버튼 ────────────────────────
    var bgColorButtons = document.querySelectorAll(".bg-colors .color-btn");
    for (var bi = 0; bi < bgColorButtons.length; bi++) {
      (function (btn) {
        btn.classList.remove("active");
        if (btn.getAttribute("data-color") === settings.bgColor) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.bgColor = this.getAttribute("data-color");
          for (var k = 0; k < bgColorButtons.length; k++) {
            bgColorButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          fillLayer(activeLayer, current, isDark);
          saveSettings();
        });
      })(bgColorButtons[bi]);
    }

    // ── 글씨색 버튼 ────────────────────────
    var textColorButtons = document.querySelectorAll(".text-colors .color-btn");
    for (var ti = 0; ti < textColorButtons.length; ti++) {
      (function (btn) {
        btn.classList.remove("active");
        if (btn.getAttribute("data-color") === settings.textColor) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.textColor = this.getAttribute("data-color");
          for (var k = 0; k < textColorButtons.length; k++) {
            textColorButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          fillLayer(activeLayer, current, isDark);
          saveSettings();
        });
      })(textColorButtons[ti]);
    }

    // ── 글씨 크기 버튼 ──────────────────────
    var sizeButtons = document.querySelectorAll(".size-btn");
    for (var si = 0; si < sizeButtons.length; si++) {
      (function (btn) {
        btn.classList.remove("active");
        if (parseInt(btn.getAttribute("data-size")) === settings.fontSize) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.fontSize = parseInt(this.getAttribute("data-size"));
          for (var k = 0; k < sizeButtons.length; k++) {
            sizeButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          applyFontSize();
          saveSettings();
        });
      })(sizeButtons[si]);
    }

    // ── 속도 버튼 ──────────────────────────
    var speedButtons = document.querySelectorAll(".speed-btn");
    for (var spi = 0; spi < speedButtons.length; spi++) {
      (function (btn) {
        btn.classList.remove("active");
        if (parseInt(btn.getAttribute("data-speed")) === settings.autoSpeed) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.autoSpeed = parseInt(this.getAttribute("data-speed"));
          for (var k = 0; k < speedButtons.length; k++) {
            speedButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          resetAutoTimer();
          saveSettings();
        });
      })(speedButtons[spi]);
    }
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
  settingsBtn.addEventListener("touchstart", function (e) {
    e.preventDefault();
    e.stopPropagation();
    toggleSettings();
  }, { passive: false });

  settingsBackdrop.addEventListener("click", closeSettings);

  var settingsClose = document.getElementById("settings-close");
  settingsClose.addEventListener("click", function (e) {
    e.stopPropagation();
    closeSettings();
  });

  // 설정 패널 내부 클릭/터치 전파 방지
  settingsPanel.addEventListener("click", function (e) { e.stopPropagation(); });
  settingsPanel.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: false });

  // ── Wake Lock ─────────────────────────────
  var wakeLock = null;

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (err) {}
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
  initializeSettingsUI();
  applyFont();
  applyFontSize();
  fillLayer(activeLayer, current, isDark);
  requestWakeLock();
  resetAutoTimer();
})();
