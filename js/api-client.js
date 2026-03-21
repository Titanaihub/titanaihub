window.TitanApi = {
  async fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  },

  async getOverview() {
    return this.fetchJson(`${window.TitanConfig.API_BASE}/api/overview`);
  },

  async getCoin(symbol) {
    return this.fetchJson(`${window.TitanConfig.API_BASE}/api/coin/${symbol}`);
  },

  async getWhales() {
    return this.fetchJson(`${window.TitanConfig.API_BASE}/api/whales`);
  },

  async login(username, password) {
    return this.fetchJson(`${window.TitanConfig.API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
  },

  async askChat(question, snapshot) {
    return this.fetchJson(`${window.TitanConfig.API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, snapshot })
    });
  }
};
