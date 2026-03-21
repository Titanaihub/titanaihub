window.TitanApp = {
  navButtons: [],
  sections: [],

  setActiveNavByIndex(index) {
    this.navButtons.forEach((btn, i) => {
      btn.classList.toggle("active", i === index);
    });
  },

  bindNav() {
    this.navButtons = Array.from(document.querySelectorAll(".quick-nav"));
    this.sections = [
      document.getElementById("overviewSection"),
      document.getElementById("coinsSection"),
      document.getElementById("whalesSection"),
      document.getElementById("rawSection"),
      document.getElementById("chatSection")
    ];

    this.navButtons.forEach((btn, index) => {
      btn.addEventListener("click", () => {
        this.setActiveNavByIndex(index);
      });
    });

    const visibleMap = new Map();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = this.sections.indexOf(entry.target);
          if (index >= 0) {
            visibleMap.set(index, entry.isIntersecting ? entry.intersectionRatio : 0);
          }
        });

        let activeIndex = 0;
        let maxRatio = 0;

        visibleMap.forEach((ratio, index) => {
          if (ratio > maxRatio) {
            maxRatio = ratio;
            activeIndex = index;
          }
        });

        this.setActiveNavByIndex(activeIndex);
      },
      {
        root: null,
        threshold: [0.2, 0.35, 0.5, 0.7]
      }
    );

    this.sections.forEach((section) => {
      if (section) observer.observe(section);
    });

    this.setActiveNavByIndex(0);
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
