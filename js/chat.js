window.TitanChat = (() => {
  const { apiPost } = window.TitanApi;

  function addChatMessage(elements, role, message) {
    if (!elements.chatMessages) return;

    const row = document.createElement("div");
    row.className = `chat-row ${role === "user" ? "chat-row-user" : "chat-row-ai"}`;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`;
    bubble.textContent = String(message || "");

    row.appendChild(bubble);
    elements.chatMessages.appendChild(row);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  function updateChatUi(elements, appState) {
    if (elements.chatStatus) {
      elements.chatStatus.textContent = appState.loggedIn ? "Unlocked" : "Locked";
      elements.chatStatus.classList.remove("locked", "unlocked");
      elements.chatStatus.classList.add(appState.loggedIn ? "unlocked" : "locked");
    }

    if (elements.loginState) {
      elements.loginState.textContent = appState.loggedIn ? "Logged in" : "Owner-only analysis";
    }

    if (elements.chatInput) {
      elements.chatInput.disabled = !appState.loggedIn;
      elements.chatInput.placeholder = appState.loggedIn
        ? "Ask about BTC, ETH, BNB, risk, setup, execution..."
        : "Login first to use AI chat...";
    }

    if (elements.sendChatBtn) {
      elements.sendChatBtn.disabled = !appState.loggedIn;
    }
  }

  function buildChatSnapshot(snapshot) {
    return JSON.stringify({
      overview: snapshot.overview,
      coins: snapshot.coins,
      coinFocus: snapshot.coinFocus,
      whales: snapshot.whales,
      alerts: snapshot.alerts
    });
  }

  async function handleLogin(elements, appState) {
    try {
      const username = elements.username ? elements.username.value : "";
      const password = elements.password ? elements.password.value : "";

      await apiPost("/login", { username, password });

      appState.loggedIn = true;
      updateChatUi(elements, appState);
      addChatMessage(elements, "ai", "Login successful. AI chat unlocked.");
    } catch (err) {
      appState.loggedIn = false;
      updateChatUi(elements, appState);
      addChatMessage(elements, "ai", err.message || "Login failed.");
    }
  }

  async function handleSendChat(elements, appState, prefilledQuestion = "") {
    if (!appState.loggedIn) return;

    const question = String(
      prefilledQuestion || (elements.chatInput ? elements.chatInput.value : "")
    ).trim();

    if (!question) return;

    addChatMessage(elements, "user", question);

    if (elements.chatInput && !prefilledQuestion) {
      elements.chatInput.value = "";
    }

    try {
      const data = await apiPost("/chat", {
        question,
        snapshot: buildChatSnapshot(appState.snapshot)
      });

      addChatMessage(elements, "ai", data?.reply || "No reply.");
    } catch (err) {
      addChatMessage(elements, "ai", err.message || "Chat request failed.");
    }
  }

  function bindChatEvents(elements, appState) {
    if (elements.loginBtn) {
      elements.loginBtn.addEventListener("click", () => handleLogin(elements, appState));
    }

    if (elements.sendChatBtn) {
      elements.sendChatBtn.addEventListener("click", () => handleSendChat(elements, appState));
    }

    if (elements.chatInput) {
      elements.chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSendChat(elements, appState);
        }
      });
    }

    if (elements.askAnalyzeBTC) {
      elements.askAnalyzeBTC.addEventListener("click", () => {
        handleSendChat(elements, appState, "ช่วยวิเคราะห์ BTC แบบลึกจากข้อมูลจริงตอนนี้");
      });
    }

    if (elements.askCompareCoins) {
      elements.askCompareCoins.addEventListener("click", () => {
        handleSendChat(elements, appState, "ช่วยเปรียบเทียบ BTC ETH และ BNB ตอนนี้ เหรียญไหนน่าสนใจกว่า");
      });
    }

    if (elements.askRisk) {
      elements.askRisk.addEventListener("click", () => {
        handleSendChat(elements, appState, "ช่วยสรุประดับความเสี่ยงของตลาดตอนนี้");
      });
    }

    updateChatUi(elements, appState);
  }

  return {
    addChatMessage,
    updateChatUi,
    buildChatSnapshot,
    handleLogin,
    handleSendChat,
    bindChatEvents
  };
})();
