(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function getText(id) {
    const el = byId(id);
    return el ? String(el.textContent || "").trim() : "";
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        msg = data?.message || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    return res.json();
  }

  function appendChatMessage(role, text) {
    const box = byId("chatMessages");
    if (!box) return;

    const row = document.createElement("div");
    row.className = `chat-row ${role === "user" ? "chat-row-user" : "chat-row-ai"}`;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`;
    bubble.textContent = text;

    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function buildSnapshot() {
    return {
      overview: {
        status: getText("systemStatus"),
        lastUpdated: getText("lastUpdated"),
        marketBias: getText("globalBias"),
        totalMarketCap: getText("totalMarketCap"),
        totalVolume24h: getText("totalVolume24h"),
        btcDominance: getText("btcDominance"),
        fearGreed: getText("fearGreed")
      },
      coins: {
        btc: {
          signal: getText("btcSignal"),
          price: getText("btcPrice"),
          change5m: getText("btc5m"),
          change15m: getText("btc15m"),
          change1h: getText("btc1h"),
          change4h: getText("btc4h"),
          funding: getText("btcFunding"),
          oi: getText("btcOI"),
          bias: getText("btcBias"),
          entry: getText("btcEntry"),
          sl: getText("btcSL"),
          tp: getText("btcTP")
        },
        eth: {
          signal: getText("ethSignal"),
          price: getText("ethPrice"),
          change5m: getText("eth5m"),
          change15m: getText("eth15m"),
          change1h: getText("eth1h"),
          change4h: getText("eth4h"),
          funding: getText("ethFunding"),
          oi: getText("ethOI"),
          bias: getText("ethBias"),
          entry: getText("ethEntry"),
          sl: getText("ethSL"),
          tp: getText("ethTP")
        },
        bnb: {
          signal: getText("bnbSignal"),
          price: getText("bnbPrice"),
          change5m: getText("bnb5m"),
          change15m: getText("bnb15m"),
          change1h: getText("bnb1h"),
          change4h: getText("bnb4h"),
          funding: getText("bnbFunding"),
          oi: getText("bnbOI"),
          bias: getText("bnbBias"),
          entry: getText("bnbEntry"),
          sl: getText("bnbSL"),
          tp: getText("bnbTP")
        }
      }
    };
  }

  let isLoggedIn = false;
  let isSending = false;

  function updateChatUI() {
    const chatInput = byId("chatInput");
    const sendBtn = byId("sendChatBtn");
    const loginBtn = byId("loginBtn");
    const loginState = byId("loginState");
    const chatStatus = byId("chatStatus");

    if (chatInput) {
      chatInput.disabled = !isLoggedIn || isSending;
      chatInput.placeholder = isLoggedIn
        ? "Ask AI about the current market..."
        : "Login first to use AI chat...";
    }

    if (sendBtn) {
      sendBtn.disabled = !isLoggedIn || isSending;
      sendBtn.textContent = isSending ? "Sending..." : "Send";
    }

    if (loginBtn) {
      loginBtn.textContent = isLoggedIn ? "Logout" : "Login";
    }

    if (loginState) {
      loginState.textContent = isLoggedIn ? "Logged in as admin" : "Owner-only analysis";
    }

    if (chatStatus) {
      chatStatus.textContent = isLoggedIn ? "Connected" : "Locked";
      chatStatus.classList.toggle("connected", isLoggedIn);
      chatStatus.classList.toggle("locked", !isLoggedIn);
    }
  }
  async function loginOrLogout() {
    if (isLoggedIn) {
      isLoggedIn = false;
      updateChatUI();
      appendChatMessage("ai", "Logged out.");
      return;
    }

    const username = byId("username");
    const password = byId("password");

    const user = username ? username.value.trim() : "";
    const pass = password ? password.value.trim() : "";

    if (!user || !pass) {
      appendChatMessage("ai", "Please enter username and password first.");
      return;
    }

    try {
      const data = await postJson("/api/login", {
        username: user,
        password: pass
      });

      if (data?.ok || data?.success) {
        isLoggedIn = true;
        updateChatUI();
        appendChatMessage("ai", `Login successful. Welcome, ${user}.`);
      } else {
        appendChatMessage("ai", data?.message || "Login failed.");
      }
    } catch (err) {
      appendChatMessage("ai", `Login failed: ${err.message}`);
    }
  }

  async function sendChat(questionText) {
    if (!isLoggedIn || isSending) return;

    const text = String(questionText || "").trim();
    if (!text) return;

    const chatInput = byId("chatInput");
    isSending = true;
    updateChatUI();

    appendChatMessage("user", text);

    if (chatInput) {
      chatInput.value = "";
    }

    try {
      const data = await postJson("/api/chat", {
        question: text,
        snapshot: JSON.stringify(buildSnapshot())
      });

      appendChatMessage("ai", data?.reply || "No reply.");
    } catch (err) {
      appendChatMessage("ai", `Chat error: ${err.message}`);
    } finally {
      isSending = false;
      updateChatUI();
    }
  }

  function wireQuickButtons() {
    const analyzeBtn = byId("askAnalyzeBTC");
    const compareBtn = byId("askCompareCoins");
    const riskBtn = byId("askRisk");

    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", function () {
        sendChat("Analyze BTC now");
      });
    }

    if (compareBtn) {
      compareBtn.addEventListener("click", function () {
        sendChat("Compare BTC ETH BNB");
      });
    }

    if (riskBtn) {
      riskBtn.addEventListener("click", function () {
        sendChat("What is the market risk now?");
      });
    }
  }

  function initChat() {
    const loginBtn = byId("loginBtn");
    const sendBtn = byId("sendChatBtn");
    const chatInput = byId("chatInput");

    if (loginBtn) {
      loginBtn.addEventListener("click", loginOrLogout);
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        sendChat(chatInput ? chatInput.value : "");
      });
    }

    if (chatInput) {
      chatInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendChat(chatInput.value);
        }
      });
    }

    wireQuickButtons();
    updateChatUI();
  }

  window.appendChatMessage = appendChatMessage;

  document.addEventListener("DOMContentLoaded", function () {
    initChat();
  });
})();
