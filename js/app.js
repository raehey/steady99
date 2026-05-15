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

  // ── 카운터 DOM ────────────────────────────
  var quoteCounter = document.getElementById("quote-counter");

  // ── 시계 DOM ──────────────────────────────
  var clockDisplay = document.getElementById("clock-display");
  var clockTimer = null;

  // ── 즐겨찾기 하트 DOM ─────────────────────
  var heartAnim = document.getElementById("heart-anim");
  var heartRemoveAnim = document.getElementById("heart-remove-anim");

  // ── 공유 버튼 & 토스트 DOM ────────────────
  var shareBtn = document.getElementById("share-btn");
  var toastEl = document.getElementById("toast");

  // ── 하트 버튼 & 캡처 버튼 DOM ──────────────
  var heartBtn = document.getElementById("heart-btn");
  var heartIcon = document.getElementById("heart-icon");
  var captureBtn = document.getElementById("capture-btn");

  // ── 즐겨찾기 카운트 DOM ───────────────────
  var favoritesCount = document.getElementById("favorites-count");

  // ── 설정 상태 ────────────────────────────
  var settings = {
    font: "Noto Sans KR",
    bgColor: "#000000",
    textColor: "#ffffff",
    fontSize: 5,
    autoSpeed: 60000,
    categories: {},
    showClock: false,
    showCounter: false,
    favoritesOnly: false,
    showShare: false,
    showCapture: false,
    showHeart: false,
    gradient: "none",
    transition: "fade",
    clockSize: 2,
    clockPosition: "bottom-center",
    clockOpacity: 15
  };

  // ── 그라디언트 프리셋 ───────────────────────
  var GRADIENT_PRESETS = {
    none: null,
    neon: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
    aurora: "linear-gradient(135deg, #0a1628, #1a4a3a, #0a3d6b)",
    sunset: "linear-gradient(135deg, #1a0a2e, #3d1a1a, #4a2a0a)",
    ocean: "linear-gradient(135deg, #0a0a2e, #0a2a4a, #0a1a3d)",
    forest: "linear-gradient(135deg, #0a1a0a, #1a2a1a, #0a2a1a)",
    midnight: "linear-gradient(135deg, #020111, #1a1a2e, #16222a)",
    wine: "linear-gradient(135deg, #1a0a0a, #3d1a2a, #2a0a1a)"
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

  // ── 즐겨찾기 데이터 ──────────────────────
  var favorites = {};  // key: "text|||author" → true

  function makeQuoteKey(q) {
    return (q.text || "") + "|||" + (q.author || "");
  }

  function isFavorite(q) {
    return favorites[makeQuoteKey(q)] === true;
  }

  function toggleFavorite(q) {
    var key = makeQuoteKey(q);
    if (favorites[key]) {
      delete favorites[key];
      return false;
    } else {
      favorites[key] = true;
      return true;
    }
  }

  function loadFavorites() {
    try {
      var stored = localStorage.getItem("quoteFavorites");
      if (stored) {
        favorites = JSON.parse(stored);
      }
    } catch (e) {}
  }

  function saveFavorites() {
    try {
      localStorage.setItem("quoteFavorites", JSON.stringify(favorites));
    } catch (e) {}
  }

  function showHeartAnimation(added) {
    var el = added ? heartAnim : heartRemoveAnim;
    el.classList.remove("show");
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add("show");
    setTimeout(function () {
      el.classList.remove("show");
    }, 850);
  }

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
      if (settings.categories[cat] === false) return false;
      if (settings.favoritesOnly && !isFavorite(q)) return false;
      return true;
    });
    if (filteredQuotes.length === 0) {
      // 즐겨찾기 모드인데 비어있으면 전체 표시
      filteredQuotes = quotes.filter(function (q) {
        var cat = q.category || "기타";
        return settings.categories[cat] !== false;
      });
      if (filteredQuotes.length === 0) {
        filteredQuotes = quotes.slice();
      }
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
        if (typeof loaded.showClock === "boolean") settings.showClock = loaded.showClock;
        if (typeof loaded.showCounter === "boolean") settings.showCounter = loaded.showCounter;
        if (typeof loaded.favoritesOnly === "boolean") settings.favoritesOnly = loaded.favoritesOnly;
        if (typeof loaded.showShare === "boolean") settings.showShare = loaded.showShare;
        if (typeof loaded.showCapture === "boolean") settings.showCapture = loaded.showCapture;
        if (typeof loaded.showHeart === "boolean") settings.showHeart = loaded.showHeart;
        if (loaded.gradient && GRADIENT_PRESETS.hasOwnProperty(loaded.gradient)) settings.gradient = loaded.gradient;
        if (loaded.transition && ["fade", "slide", "zoom"].indexOf(loaded.transition) !== -1) settings.transition = loaded.transition;
        if (loaded.clockSize) settings.clockSize = loaded.clockSize;
        if (loaded.clockPosition) settings.clockPosition = loaded.clockPosition;
        if (loaded.clockOpacity) settings.clockOpacity = loaded.clockOpacity;
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
    var gradientValue = GRADIENT_PRESETS[settings.gradient];
    if (!dark) {
      layer.style.backgroundColor = settings.bgColor;
      layer.style.backgroundImage = gradientValue || "none";
      layer.querySelector(".quote-text").style.color = settings.textColor;
    } else {
      layer.style.backgroundColor = invertColor(settings.bgColor);
      if (gradientValue) {
        layer.style.backgroundImage = invertGradient(gradientValue);
      } else {
        layer.style.backgroundImage = "none";
      }
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

  // ── 그라디언트 색상 반전 ──────────────────
  function invertGradient(gradientStr) {
    return gradientStr.replace(/#[0-9a-fA-F]{6}/g, function (hex) {
      return invertColor(hex);
    });
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

  // ── 전환 효과 적용 ────────────────────────
  var lastDirection = "next"; // 스와이프/탭 방향 추적

  function applyTransitionMode() {
    var app = document.getElementById("app");
    app.classList.remove("transition-slide", "transition-zoom");
    if (settings.transition === "slide") {
      app.classList.add("transition-slide");
    } else if (settings.transition === "zoom") {
      app.classList.add("transition-zoom");
    }
  }

  // ── 크로스페이드/슬라이드/줌 전환 (공통) ──
  function transitionTo(newIndex, direction) {
    if (isAnimating) return;
    isAnimating = true;

    lastDirection = direction || "next";
    current = newIndex;
    isDark = !isDark;

    fillLayer(hiddenLayer, current, isDark);

    if (settings.transition === "slide") {
      // 슬라이드 전환
      var inFrom = lastDirection === "next" ? "slide-in-right" : "slide-in-left";
      var outTo = lastDirection === "next" ? "slide-out-left" : "slide-out-right";

      // 시작 위치 설정 (트랜지션 없이)
      hiddenLayer.style.transition = "none";
      hiddenLayer.classList.remove("active", "slide-out-left", "slide-out-right", "slide-in-left", "slide-in-right");
      hiddenLayer.classList.add(inFrom);

      // Force reflow
      void hiddenLayer.offsetWidth;

      // 트랜지션 복원 후 애니메이션
      hiddenLayer.style.transition = "";
      hiddenLayer.classList.remove(inFrom);
      hiddenLayer.classList.add("active");

      activeLayer.classList.remove("active");
      activeLayer.classList.add(outTo);

      var prevActive = activeLayer;
      activeLayer = hiddenLayer;
      hiddenLayer = prevActive;

      setTimeout(function () {
        hiddenLayer.classList.remove("slide-out-left", "slide-out-right", "slide-in-left", "slide-in-right");
        isAnimating = false;
      }, FADE_DURATION);

    } else if (settings.transition === "zoom") {
      // 줌 전환
      hiddenLayer.style.transition = "none";
      hiddenLayer.classList.remove("active", "zoom-out");

      // Force reflow
      void hiddenLayer.offsetWidth;

      hiddenLayer.style.transition = "";
      hiddenLayer.classList.add("active");

      activeLayer.classList.remove("active");
      activeLayer.classList.add("zoom-out");

      var prevActive = activeLayer;
      activeLayer = hiddenLayer;
      hiddenLayer = prevActive;

      setTimeout(function () {
        hiddenLayer.classList.remove("zoom-out");
        isAnimating = false;
      }, FADE_DURATION);

    } else {
      // 페이드 (기본)
      hiddenLayer.classList.add("active");
      activeLayer.classList.remove("active");

      var prevActive = activeLayer;
      activeLayer = hiddenLayer;
      hiddenLayer = prevActive;

      setTimeout(function () {
        isAnimating = false;
      }, FADE_DURATION);
    }

    updateCounter();
    updateHeartIcon();
  }

  function nextQuote() {
    transitionTo(current + 1, "next");
  }

  function prevQuote() {
    var newIndex = current - 1;
    if (newIndex < 0) {
      newIndex = quoteIndices.length - 1;
    }
    transitionTo(newIndex, "prev");
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

    // ── 그라디언트 버튼 ──────────────────────
    var gradientButtons = document.querySelectorAll(".gradient-btn");
    for (var gi = 0; gi < gradientButtons.length; gi++) {
      (function (btn) {
        btn.classList.remove("active");
        if (btn.getAttribute("data-gradient") === settings.gradient) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.gradient = this.getAttribute("data-gradient");
          for (var k = 0; k < gradientButtons.length; k++) {
            gradientButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          fillLayer(activeLayer, current, isDark);
          saveSettings();
        });
      })(gradientButtons[gi]);
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

    // ── 시계 표시 토글 ────────────────────────
    var clockToggle = document.getElementById("clock-toggle");
    var clockOptions = document.getElementById("clock-options");
    if (settings.showClock) {
      clockToggle.classList.add("active");
      clockToggle.textContent = "ON";
      clockOptions.style.display = "block";
    }
    clockToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      settings.showClock = !settings.showClock;
      this.classList.toggle("active");
      this.textContent = settings.showClock ? "ON" : "OFF";
      clockOptions.style.display = settings.showClock ? "block" : "none";
      applyClock();
      saveSettings();
    });

    // ── 시계 크기 버튼 ────────────────────────
    var clockSizeButtons = document.querySelectorAll(".clock-size-buttons .clock-option-btn");
    for (var csi = 0; csi < clockSizeButtons.length; csi++) {
      (function (btn) {
        btn.classList.remove("active");
        if (parseInt(btn.getAttribute("data-clock-size")) === settings.clockSize) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.clockSize = parseInt(this.getAttribute("data-clock-size"));
          for (var k = 0; k < clockSizeButtons.length; k++) {
            clockSizeButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          applyClock();
          saveSettings();
        });
      })(clockSizeButtons[csi]);
    }

    // ── 시계 위치 버튼 ────────────────────────
    var clockPositionButtons = document.querySelectorAll(".clock-position-buttons .clock-option-btn");
    for (var cpi = 0; cpi < clockPositionButtons.length; cpi++) {
      (function (btn) {
        btn.classList.remove("active");
        if (btn.getAttribute("data-clock-position") === settings.clockPosition) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.clockPosition = this.getAttribute("data-clock-position");
          for (var k = 0; k < clockPositionButtons.length; k++) {
            clockPositionButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          applyClock();
          saveSettings();
        });
      })(clockPositionButtons[cpi]);
    }

    // ── 시계 투명도 버튼 ───────────────────────
    var clockOpacityButtons = document.querySelectorAll(".clock-opacity-buttons .clock-option-btn");
    for (var coi = 0; coi < clockOpacityButtons.length; coi++) {
      (function (btn) {
        btn.classList.remove("active");
        if (parseInt(btn.getAttribute("data-clock-opacity")) === settings.clockOpacity) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.clockOpacity = parseInt(this.getAttribute("data-clock-opacity"));
          for (var k = 0; k < clockOpacityButtons.length; k++) {
            clockOpacityButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          applyClock();
          saveSettings();
        });
      })(clockOpacityButtons[coi]);
    }

    // ── 명언 카운터 토글 ──────────────────────
    var counterToggle = document.getElementById("counter-toggle");
    if (settings.showCounter) {
      counterToggle.classList.add("active");
      counterToggle.textContent = "ON";
    }
    counterToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      settings.showCounter = !settings.showCounter;
      this.classList.toggle("active");
      this.textContent = settings.showCounter ? "ON" : "OFF";
      applyCounter();
      saveSettings();
    });

    // ── 즐겨찾기만 보기 토글 ────────────────
    var favoritesToggle = document.getElementById("favorites-toggle");
    if (settings.favoritesOnly) {
      favoritesToggle.classList.add("active");
      favoritesToggle.textContent = "ON";
    }
    updateFavoritesCount();
    favoritesToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var favCount = Object.keys(favorites).length;
      if (!settings.favoritesOnly && favCount === 0) {
        showToast("즐겨찾기한 명언이 없습니다");
        return;
      }
      settings.favoritesOnly = !settings.favoritesOnly;
      this.classList.toggle("active");
      this.textContent = settings.favoritesOnly ? "ON" : "OFF";
      rebuildFilteredQuotes();
      fillLayer(activeLayer, current, isDark);
      updateCounter();
      saveSettings();
    });

    // ── 캡처 버튼 표시 토글 ──────────────────────
    var captureToggle = document.getElementById("capture-toggle");
    if (settings.showCapture) {
      captureToggle.classList.add("active");
      captureToggle.textContent = "ON";
    }
    captureToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      settings.showCapture = !settings.showCapture;
      this.classList.toggle("active");
      this.textContent = settings.showCapture ? "ON" : "OFF";
      applyCaptureBtn();
      saveSettings();
    });

    // ── 즐겨찾기 버튼 표시 토글 ───────────────
    var heartToggle = document.getElementById("heart-toggle");
    if (settings.showHeart) {
      heartToggle.classList.add("active");
      heartToggle.textContent = "ON";
    }
    heartToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      settings.showHeart = !settings.showHeart;
      this.classList.toggle("active");
      this.textContent = settings.showHeart ? "ON" : "OFF";
      applyHeart();
      updateHeartIcon();
      saveSettings();
    });

    // ── 공유 버튼 표시 토글 ────────────────────
    var shareToggle = document.getElementById("share-toggle");
    if (settings.showShare) {
      shareToggle.classList.add("active");
      shareToggle.textContent = "ON";
    }
    shareToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      settings.showShare = !settings.showShare;
      this.classList.toggle("active");
      this.textContent = settings.showShare ? "ON" : "OFF";
      applyShare();
      saveSettings();
    });

    // ── 전환 효과 버튼 ────────────────────────
    var transitionButtons = document.querySelectorAll(".transition-btn");
    for (var tri = 0; tri < transitionButtons.length; tri++) {
      (function (btn) {
        btn.classList.remove("active");
        if (btn.getAttribute("data-transition") === settings.transition) {
          btn.classList.add("active");
        }
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          settings.transition = this.getAttribute("data-transition");
          for (var k = 0; k < transitionButtons.length; k++) {
            transitionButtons[k].classList.remove("active");
          }
          this.classList.add("active");
          applyTransitionMode();
          saveSettings();
        });
      })(transitionButtons[tri]);
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

  // ── 시계 표시 ─────────────────────────────
  function updateClock() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    clockDisplay.textContent =
      (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  function applyClock() {
    if (settings.showClock) {
      clockDisplay.style.display = "block";
      clockDisplay.style.fontSize = settings.clockSize + "vw";
      clockDisplay.style.opacity = (settings.clockOpacity / 100).toString();
      // 위치 클래스 갱신
      clockDisplay.classList.remove("top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right");
      clockDisplay.classList.add(settings.clockPosition);
      updateClock();
      clearInterval(clockTimer);
      clockTimer = setInterval(updateClock, 10000);
    } else {
      clockDisplay.style.display = "none";
      clearInterval(clockTimer);
    }
  }

  // ── 명언 카운터 ───────────────────────────
  function updateCounter() {
    if (!settings.showCounter) return;
    var displayNum = current + 1;
    var total = filteredQuotes.length;
    quoteCounter.textContent = displayNum + " / " + total;
  }

  function applyCounter() {
    if (settings.showCounter) {
      quoteCounter.style.display = "block";
      updateCounter();
    } else {
      quoteCounter.style.display = "none";
    }
  }

  // ── 토스트 알림 ────────────────────────────
  var toastTimer = null;
  function showToast(msg) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 1800);
  }

  // ── 공유 기능 ─────────────────────────────
  function getCurrentQuote() {
    if (quoteIndices.length === 0 || filteredQuotes.length === 0) return null;
    var quoteIndex = quoteIndices[current % quoteIndices.length];
    return filteredQuotes[quoteIndex] || null;
  }

  function shareQuote() {
    var q = getCurrentQuote();
    if (!q) return;
    var shareText = q.text + (q.author ? "\n— " + q.author : "");

    if (navigator.share) {
      navigator.share({
        text: shareText
      }).catch(function () {
        // 사용자가 취소한 경우 무시
      });
    } else {
      // 폴백: 클립보드에 복사
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(function () {
          showToast("클립보드에 복사되었습니다");
        }).catch(function () {
          showToast("복사에 실패했습니다");
        });
      } else {
        // 구형 브라우저 폴백
        var ta = document.createElement("textarea");
        ta.value = shareText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          showToast("클립보드에 복사되었습니다");
        } catch (e) {
          showToast("복사에 실패했습니다");
        }
        document.body.removeChild(ta);
      }
    }
  }

  function applyShare() {
    shareBtn.style.display = settings.showShare ? "block" : "none";
  }

  // ── 하트 버튼 표시 & 상태 업데이트 ─────────
  function applyHeart() {
    heartBtn.style.display = settings.showHeart ? "block" : "none";
  }

  function updateHeartIcon() {
    if (!settings.showHeart) return;
    var q = getCurrentQuote();
    if (!q) return;
    var isFav = isFavorite(q);
    heartIcon.textContent = isFav ? "♥" : "♡";
    if (isFav) {
      heartIcon.style.color = "#ff4466";
    } else {
      heartIcon.style.color = "#ffffff";
    }
  }

  // ── 캡처 기능 ───────────────────────────────
  function applyCaptureBtn() {
    captureBtn.style.display = settings.showCapture ? "block" : "none";
  }

  function captureQuote() {
    if (!window.html2canvas) {
      showToast("캡처 라이브러리 로딩 중...");
      return;
    }

    // 캡처 버튼 숨기기
    captureBtn.style.display = "none";

    var app = document.getElementById("app");
    html2canvas(app, {
      backgroundColor: null,
      useCORS: true,
      logging: false
    }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");

        // 파일명: steady99_명언_YYYYMMDD_HHMMSS.png
        var now = new Date();
        var year = now.getFullYear();
        var month = String(now.getMonth() + 1).padStart(2, "0");
        var date = String(now.getDate()).padStart(2, "0");
        var hours = String(now.getHours()).padStart(2, "0");
        var minutes = String(now.getMinutes()).padStart(2, "0");
        var seconds = String(now.getSeconds()).padStart(2, "0");
        var timestamp = year + month + date + "_" + hours + minutes + seconds;

        link.href = url;
        link.download = "steady99_명언_" + timestamp + ".png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast("캡처 저장 완료");

        // 캡처 버튼 다시 표시
        if (settings.showCapture) {
          captureBtn.style.display = "block";
        }
      });
    }).catch(function (err) {
      showToast("캡처 실패");
      if (settings.showCapture) {
        captureBtn.style.display = "block";
      }
    });
  }

  // ── 즐겨찾기 카운트 업데이트 ───────────────
  function updateFavoritesCount() {
    var count = Object.keys(favorites).length;
    if (count === 0) {
      favoritesCount.textContent = "";
    } else {
      favoritesCount.textContent = "(" + count + "개)";
    }
  }

  shareBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    shareQuote();
  });
  shareBtn.addEventListener("touchstart", function (e) {
    e.preventDefault();
    e.stopPropagation();
    shareQuote();
  }, { passive: false });

  // ── 하트 버튼 이벤트 ───────────────────────
  heartBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var q = getCurrentQuote();
    if (!q) return;
    var added = toggleFavorite(q);
    saveFavorites();
    showHeartAnimation(added);
    updateHeartIcon();
    // 즐겨찾기 모드 중 해제 시 리빌드
    if (settings.favoritesOnly && !added) {
      rebuildFilteredQuotes();
      fillLayer(activeLayer, current, isDark);
      updateCounter();
    }
  });
  heartBtn.addEventListener("touchstart", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var q = getCurrentQuote();
    if (!q) return;
    var added = toggleFavorite(q);
    saveFavorites();
    showHeartAnimation(added);
    updateHeartIcon();
    if (settings.favoritesOnly && !added) {
      rebuildFilteredQuotes();
      fillLayer(activeLayer, current, isDark);
      updateCounter();
    }
  }, { passive: false });

  // ── 캡처 버튼 이벤트 ───────────────────────
  captureBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    captureQuote();
  });
  captureBtn.addEventListener("touchstart", function (e) {
    e.preventDefault();
    e.stopPropagation();
    captureQuote();
  }, { passive: false });

  // ── 스와이프 감지 상태 ────────────────────
  var swipeStartX = null;
  var swipeStartY = null;
  var swipeStartTime = 0;
  var SWIPE_THRESHOLD = 50;   // 최소 스와이프 거리 (px)
  var SWIPE_MAX_TIME = 500;   // 최대 스와이프 시간 (ms)

  // ── 롱프레스 감지 상태 ────────────────────
  var longPressTimer = null;
  var longPressFired = false;
  var LONG_PRESS_DURATION = 800;  // ms

  // ── 이벤트 바인딩 ─────────────────────────
  document.addEventListener("click", function (e) {
    if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
      // 클릭 위치 기반: 화면 중앙(window.innerWidth / 2) 기준
      if (e.clientX >= window.innerWidth / 2) {
        nextQuote();
      } else {
        prevQuote();
      }
      resetAutoTimer();
    }
  });

  document.addEventListener("touchstart", function (e) {
    if (settingsPanel.contains(e.target) || settingsBtn.contains(e.target)) return;
    e.preventDefault();
    var touch = e.touches[0];
    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
    swipeStartTime = Date.now();

    // 롱프레스 타이머 시작
    longPressFired = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(function () {
      longPressFired = true;
      // 현재 명언 즐겨찾기 토글
      if (quoteIndices.length === 0 || filteredQuotes.length === 0) return;
      var quoteIndex = quoteIndices[current % quoteIndices.length];
      var q = filteredQuotes[quoteIndex];
      if (!q) return;
      var added = toggleFavorite(q);
      saveFavorites();
      showHeartAnimation(added);
      updateHeartIcon();
      updateFavoritesCount();
      // 즐겨찾기 모드 중 해제 시 리빌드
      if (settings.favoritesOnly && !added) {
        rebuildFilteredQuotes();
        fillLayer(activeLayer, current, isDark);
        updateCounter();
      }
    }, LONG_PRESS_DURATION);
  }, { passive: false });

  document.addEventListener("touchmove", function (e) {
    if (longPressTimer && swipeStartX !== null) {
      var touch = e.touches[0];
      var dx = Math.abs(touch.clientX - swipeStartX);
      var dy = Math.abs(touch.clientY - swipeStartY);
      // 움직임이 크면 롱프레스 취소
      if (dx > 15 || dy > 15) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
  }, { passive: true });

  document.addEventListener("touchend", function (e) {
    if (settingsPanel.contains(e.target) || settingsBtn.contains(e.target)) return;

    // 롱프레스 타이머 정리
    clearTimeout(longPressTimer);
    longPressTimer = null;

    // 롱프레스가 발동했으면 네비게이션 스킵
    if (longPressFired) {
      longPressFired = false;
      swipeStartX = null;
      swipeStartY = null;
      return;
    }

    if (swipeStartX === null) return;

    var touch = e.changedTouches[0];
    var dx = touch.clientX - swipeStartX;
    var dy = touch.clientY - swipeStartY;
    var elapsed = Date.now() - swipeStartTime;

    var savedStartX = swipeStartX;
    swipeStartX = null;
    swipeStartY = null;

    // 스와이프 판정: 가로 이동이 충분하고, 세로보다 크고, 시간 내에 완료
    if (elapsed < SWIPE_MAX_TIME && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        // 왼쪽 스와이프 → 다음 명언
        nextQuote();
      } else {
        // 오른쪽 스와이프 → 이전 명언
        prevQuote();
      }
      resetAutoTimer();
      return;
    }

    // 스와이프가 아닌 일반 탭 → 터치 위치 기반 처리
    // 화면 중앙(window.innerWidth / 2) 기준: 오른쪽 = 다음, 왼쪽 = 이전
    if (savedStartX >= window.innerWidth / 2) {
      nextQuote();
    } else {
      prevQuote();
    }
    resetAutoTimer();
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

  // ── Service Worker 등록 (오프라인 모드) ───
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {
      // 등록 실패 시 무시 (오프라인 기능만 비활성)
    });
  }

  // ── 초기화 ────────────────────────────────
  initializeCategories();
  loadFavorites();
  loadSettings();
  rebuildFilteredQuotes();
  initializeSettingsUI();
  applyFont();
  applyFontSize();
  applyTransitionMode();
  fillLayer(activeLayer, current, isDark);
  applyClock();
  applyCounter();
  applyShare();
  applyHeart();
  applyCaptureBtn();
  updateHeartIcon();
  updateFavoritesCount();
  requestWakeLock();
  resetAutoTimer();
})();
