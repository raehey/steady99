(function () {
  "use strict";

  const layerA = document.getElementById("layer-a");
  const layerB = document.getElementById("layer-b");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsPanel = document.getElementById("settings-panel");
  const settingsBackdrop = document.getElementById("settings-backdrop");

  let current = 0;
  let isAnimating = false;
  let activeLayer = layerA;
  let hiddenLayer = layerB;
  let autoTimer = null;
  
  // 기본 설정
  let settings = {
    font: "'Noto Sans KR'",
    color: "#000000",
    size: "5",
    speed: 60000,
    categories: {}
  };

  let filteredQuotes = [];

  function loadSettings() {
    const saved = localStorage.getItem("steady99_settings");
    if (saved) {
      settings = Object.assign(settings, JSON.parse(saved));
    }
  }

  function saveSettings() {
    localStorage.setItem("steady99_settings", JSON.stringify(settings));
  }

  // 필터링 및 셔플
  function rebuildFilteredQuotes() {
    const activeCats = Object.keys(settings.categories).filter(c => settings.categories[c]);
    filteredQuotes = quotes.filter(q => activeCats.includes(q.category));
    
    // 다 꺼져있으면 안전장치로 전체 로드
    if (filteredQuotes.length === 0) filteredQuotes = [...quotes];
    
    // 피셔-예이츠 셔플 알고리즘
    for (let i = filteredQuotes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filteredQuotes[i], filteredQuotes[j]] = [filteredQuotes[j], filteredQuotes[i]];
    }
    current = 0;
  }

  // 폰트 즉시 적용 (CSS 변수)
  function applyFont() {
    document.documentElement.style.setProperty('--app-font', settings.font);
  }

  function applyColor() {
    document.documentElement.style.setProperty('--bg-color', settings.color);
  }

  function applySize() {
    document.body.setAttribute("data-size", settings.size);
  }

  function nextQuote() {
    if (isAnimating || filteredQuotes.length === 0) return;
    isAnimating = true;

    const data = filteredQuotes[current];
    hiddenLayer.querySelector(".quote-text").textContent = data.text;
    hiddenLayer.querySelector(".quote-author").textContent = data.author ? `- ${data.author}` : "";

    activeLayer.classList.remove("active");
    hiddenLayer.classList.add("active");

    [activeLayer, hiddenLayer] = [hiddenLayer, activeLayer];
    current = (current + 1) % filteredQuotes.length;

    setTimeout(() => { isAnimating = false; }, 1200);
  }

  function startAutoTimer() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(nextQuote, settings.speed);
  }

  // 설정 UI 초기화 (버튼/이벤트 바인딩)
  function initializeUI() {
    // 1. 카테고리 버튼 세팅
    const pillContainer = document.getElementById("category-pills");
    pillContainer.innerHTML = "";
    
    // quotes 데이터에서 유니크 카테고리 추출
    const allCats = [...new Set(quotes.map(q => q.category))];
    allCats.forEach(cat => {
      // 처음 접속 시 전부 True로 설정
      if (settings.categories[cat] === undefined) settings.categories[cat] = true;
      
      const pill = document.createElement("div");
      pill.className = "category-pill" + (settings.categories[cat] ? " active" : "");
      pill.textContent = cat;
      
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        settings.categories[cat] = !settings.categories[cat]; // 상태 반전
        pill.classList.toggle("active");
        rebuildFilteredQuotes();
        saveSettings();
      });
      pillContainer.appendChild(pill);
    });

    // 2. 글씨체 버튼
    document.querySelectorAll(".font-btn").forEach(btn => {
      if (btn.dataset.font === settings.font) btn.classList.add("active");
      else btn.classList.remove("active");
      
      btn.addEventListener("click", () => {
        document.querySelectorAll(".font-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        settings.font = btn.dataset.font;
        applyFont();
        saveSettings();
      });
    });

    // 3. 색상, 4. 크기, 5. 속도는 기존과 동일 패턴
    document.querySelectorAll(".color-btn").forEach(btn => {
      if (btn.dataset.color === settings.color) btn.classList.add("active");
      btn.addEventListener("click", () => {
        document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        settings.color = btn.dataset.color;
        applyColor();
        saveSettings();
      });
    });

    document.querySelectorAll(".size-btn").forEach(btn => {
      if (btn.dataset.size === settings.size) btn.classList.add("active");
      btn.addEventListener("click", () => {
        document.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        settings.size = btn.dataset.size;
        applySize();
        saveSettings();
      });
    });

    document.querySelectorAll(".speed-btn").forEach(btn => {
      if (parseInt(btn.dataset.speed) === settings.speed) btn.classList.add("active");
      btn.addEventListener("click", () => {
        document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        settings.speed = parseInt(btn.dataset.speed);
        startAutoTimer();
        saveSettings();
      });
    });
  }

  // 설정창 토글
  function toggleSettings() {
    settingsPanel.classList.toggle("open");
    settingsBackdrop.classList.toggle("open");
  }

  settingsBtn.addEventListener("click", toggleSettings);
  settingsBackdrop.addEventListener("click", toggleSettings);
  
  // 화면 클릭 시 다음 명언 (모바일 터치 포함)
  document.addEventListener("click", (e) => {
    if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
      nextQuote();
      startAutoTimer(); // 클릭 시 타이머 리셋
    }
  });

  // 초기 실행 구동
  loadSettings();
  initializeUI();
  applyFont();
  applyColor();
  applySize();
  rebuildFilteredQuotes();
  nextQuote();
  startAutoTimer();

})();