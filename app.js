window.TitanApp = {
  setActiveNav(activeId) {
    const buttons = document.querySelectorAll(".quick-nav");
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.id === activeId);
    });
  },

  bindNav() {
    const sections = {
      overviewBtn: document.getElementById("heroOverviewSection"),
      coinsBtn: document.getElementById("coinsSection"),
      whalesBtn: document.getElementById("whalesSection"),
      rawBtn: document.getElementById("rawSection"),
      chatBtn: document.getElementById("chatSection")
    };

    const buttons = document.querySelectorAll(".quick-nav");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = sections[btn.id];
        this.setActiveNav(btn.id);

        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      });
    });

    this.setActiveNav("overviewBtn");
  },

  async loadDashboard() {
    let overview = window.loadMockOverviewData();
    let coins = window.loadMockCoinData();
    let whales = window.loadMockWhaleData();

    try {
      overview = { ...overview, ...(await window.TitanApi.getOverview()) };
    } catch (err) {
      console.warn("Failed to load overview:", err);
    }

    try {
      coins.btc = { ...coins.btc, ...(await window.TitanApi.getCoin("btc")) };
    } catch (err) {
      console.warn("Failed to load BTC:", err);
    }

    try {
      coins.eth = { ...coins.eth, ...(await window.TitanApi.getCoin("eth")) };
    } catch (err) {
      console.warn("Failed to load ETH:", err);
    }

    try {
      coins.bnb = { ...coins.bnb, ...(await window.TitanApi.getCoin("bnb")) };
    } catch (err) {
      console.warn("Failed to load BNB:", err);
    }

    try {
      const rows = await window.TitanApi.getWhales();
      if (Array.isArray(rows)) whales = rows;
    } catch (err) {
      console.warn("Failed to load whales:", err);
    }

    window.TitanDashboard.renderOverview(overview);
    window.TitanDashboard.renderCoin("btc", coins.btc);
    window.TitanDashboard.renderCoin("eth", coins.eth);
    window.TitanDashboard.renderCoin("bnb", coins.bnb);
    window.TitanDashboard.renderWhales(whales);
    window.TitanDashboard.renderRawSnapshot({ overview, coins, whales });
  },

  init() {
    this.bindNav();
    window.TitanChat.bindEvents();
    this.loadDashboard();
    setInterval(() => this.loadDashboard(), window.TitanConfig.REFRESH_MS);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  window.TitanApp.init();
});
