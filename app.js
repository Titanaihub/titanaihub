window.TitanApp = {
  async loadDashboard() {
    let overview = window.loadMockOverviewData();
    let coins = window.loadMockCoinData();
    let whales = window.loadMockWhaleData();

    try {
      overview = { ...overview, ...(await window.TitanApi.getOverview()) };
    } catch {}

    try {
      coins.btc = { ...coins.btc, ...(await window.TitanApi.getCoin("btc")) };
    } catch {}

    try {
      coins.eth = { ...coins.eth, ...(await window.TitanApi.getCoin("eth")) };
    } catch {}

    try {
      coins.bnb = { ...coins.bnb, ...(await window.TitanApi.getCoin("bnb")) };
    } catch {}

    try {
      const rows = await window.TitanApi.getWhales();
      if (Array.isArray(rows)) whales = rows;
    } catch {}

    window.TitanDashboard.renderOverview(overview);
    window.TitanDashboard.renderCoin("btc", coins.btc);
    window.TitanDashboard.renderCoin("eth", coins.eth);
    window.TitanDashboard.renderCoin("bnb", coins.bnb);
    window.TitanDashboard.renderWhales(whales);
    window.TitanDashboard.renderRawSnapshot({ overview, coins, whales });
  },

  init() {
    window.TitanChat.bindEvents();
    this.loadDashboard();
    setInterval(() => this.loadDashboard(), window.TitanConfig.REFRESH_MS);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  window.TitanApp.init();
});
