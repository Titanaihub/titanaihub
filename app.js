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
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.setActiveNavByIndex(index);

        const target = this.sections[index];
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIndex = 0;
        let bestRatio = 0;

        entries.forEach((entry) => {
          const index = this.sections.indexOf(entry.target);
          if (index >= 0 && entry.isIntersecting && entry.intersectionRatio >= bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIndex = index;
          }
        });

        this.setActiveNavByIndex(bestIndex);
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
      const apiOverview = await window.TitanApi.getOverview();
      overview = { ...overview, ...apiOverview };
    } catch (err) {
      console.warn("Failed to load overview:", err);
    }

    try {
      const btc = await window.TitanApi.getCoin("btc");
      coins.btc = { ...coins.btc, ...btc };
    } catch (err) {
      console.warn("Failed to load BTC:", err);
    }

    try {
      const eth = await window.TitanApi.getCoin("eth");
      coins.eth = { ...coins.eth, ...eth };
    } catch (err) {
      console.warn("Failed to load ETH:", err);
    }

    try {
      const bnb = await window.TitanApi.getCoin("bnb");
      coins.bnb = { ...coins.bnb, ...bnb };
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
