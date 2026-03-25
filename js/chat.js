window.TitanChat = (() => {
  const { apiPost } = window.TitanApi;

  function addChatMessage(elements, role, message) {
    if (!elements.chatMessages) return;

    const row = document.createElement("div");
    row.className = `chat-row ${role === "user" ? "chat-row-user" : "chat-row-ai"}`;

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`;
    const bubbleText = document.createElement("div");
    bubbleText.className = "chat-bubble-text";
    bubbleText.textContent = String(message || "");

    const meta = document.createElement("div");
    meta.className = "chat-bubble-meta";
    const ts = new Date();
    meta.textContent = `${role === "user" ? "You" : "AI"} • ${ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    bubble.appendChild(bubbleText);
    bubble.appendChild(meta);

    row.appendChild(bubble);
    elements.chatMessages.appendChild(row);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  function updateChatUi(elements, appState) {
    if (elements.chatStatus) {
      elements.chatStatus.textContent = appState.loggedIn ? (appState.authRole || "Unlocked") : "Locked";
      elements.chatStatus.classList.remove("locked", "unlocked");
      elements.chatStatus.classList.add(appState.loggedIn ? "unlocked" : "locked");
    }

    if (elements.loginState) {
      elements.loginState.textContent = appState.loggedIn
        ? appState.authRole === "owner"
          ? "Owner unlocked"
          : "Unlocked"
        : "Owner-only analysis";
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

      const data = await apiPost("/login", { username, password });
      const token = data?.token || null;
      const role = data?.role || null;

      if (!token) throw new Error(data?.message || "Login token missing.");

      appState.loggedIn = true;
      appState.authToken = token;
      appState.authRole = role;
      updateChatUi(elements, appState);
      addChatMessage(elements, "ai", "Login successful. AI chat unlocked.");
    } catch (err) {
      appState.loggedIn = false;
      appState.authToken = null;
      appState.authRole = null;
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
      if (!appState.authToken) throw new Error("Session expired. Please login again.");

      const data = await apiPost(
        "/chat",
        {
          question,
          snapshot: buildChatSnapshot(appState.snapshot)
        },
        {
          Authorization: `Bearer ${appState.authToken}`
        }
      );

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
