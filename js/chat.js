window.TitanChat = {
  isLoggedIn: false,
  username: "",
  thinkingNode: null,

  el(id) {
    return document.getElementById(id);
  },

  getMessagesBox() {
    return this.el("chatMessages");
  },

  scrollToBottom() {
    const box = this.getMessagesBox();
    if (box) box.scrollTop = box.scrollHeight;
  },

  clearMessages() {
    const box = this.getMessagesBox();
    if (box) box.innerHTML = "";
  },

  createMessage(role, text) {
    const div = document.createElement("div");
    div.className = `chat-message ${role}`;
    div.textContent = text;
    return div;
  },

  addMessage(role, text) {
    const box = this.getMessagesBox();
    if (!box) return null;

    const node = this.createMessage(role, text);
    box.appendChild(node);
    this.scrollToBottom();
    return node;
  },

  removeThinking() {
    if (this.thinkingNode && this.thinkingNode.parentNode) {
      this.thinkingNode.parentNode.removeChild(this.thinkingNode);
    }
    this.thinkingNode = null;
  },

  showThinking() {
    this.removeThinking();
    this.thinkingNode = this.addMessage("system", "AI is thinking...");
  },

  setStatus(text, tone = "neutral") {
    const status = this.el("chatStatus");
    if (!status) return;

    status.textContent = text;
    status.className = `chat-status ${tone}`;
  },

  buildSnapshot() {
    const raw = this.el("rawSnapshot");
    return raw ? raw.textContent : "{}";
  },

  setControlsDisabled(disabled) {
    const input = this.el("chatInput");
    const sendBtn = this.el("sendChatBtn");
    const quickButtons = document.querySelectorAll(".chat-actions .quick-btn");

    if (input) input.disabled = disabled;
    if (sendBtn) sendBtn.disabled = disabled;

    quickButtons.forEach((btn) => {
      btn.disabled = disabled;
    });
  },

  setLoginUI(loggedIn) {
    const loginUser = this.el("loginUser");
    const loginPass = this.el("loginPass");
    const loginBtn = this.el("loginBtn");
    const chatInput = this.el("chatInput");
    const authNote = this.el("chatAuthNote");

    this.isLoggedIn = loggedIn;

    if (loginUser) loginUser.disabled = loggedIn;
    if (loginPass) loginPass.disabled = loggedIn;

    if (loginBtn) {
      loginBtn.textContent = loggedIn ? "Logout" : "Login";
    }

    if (chatInput) {
      chatInput.placeholder = loggedIn
        ? "Ask AI about the current market..."
        : "Login first to use AI chat...";
    }

    if (authNote) {
      authNote.textContent = loggedIn
        ? `Logged in as ${this.username || "admin"}`
        : "Owner-only analysis";
    }

    this.setControlsDisabled(!loggedIn);

    if (loggedIn) {
      this.setStatus("Connected", "success");
    } else {
      this.setStatus("Locked", "muted");
    }
  },

  async loginOrLogout() {
    if (this.isLoggedIn) {
      this.username = "";
      this.removeThinking();
      this.clearMessages();
      this.addMessage("ai", "AI chat ready. Login first.");
      this.setLoginUI(false);
      return;
    }

    const username = (this.el("loginUser")?.value || "").trim();
    const password = (this.el("loginPass")?.value || "").trim();

    if (!username || !password) {
      this.addMessage("system", "Please enter username and password.");
      this.setStatus("Missing credentials", "warning");
      return;
    }

    try {
      this.setStatus("Checking login...", "warning");

      const result = await window.TitanApi.login(username, password);

      if (result?.ok || result?.success) {
        this.username = username;
        this.clearMessages();
        this.addMessage("ai", `Login successful. Welcome, ${username}.`);
        this.setLoginUI(true);
      } else {
        this.setStatus("Login failed", "danger");
        this.addMessage("system", result?.message || "Login failed.");
      }
    } catch (err) {
      this.setStatus("Login failed", "danger");
      this.addMessage("system", err?.message || "Login failed.");
    }
  },

  async sendQuestion(question) {
    const text = String(question || "").trim();
    if (!text) return;

    if (!this.isLoggedIn) {
      this.addMessage("system", "Login first.");
      this.setStatus("Locked", "muted");
      return;
    }

    const input = this.el("chatInput");
    if (input) input.value = "";

    this.addMessage("user", text);
    this.showThinking();
    this.setStatus("Processing...", "warning");

    try {
      const snapshot = this.buildSnapshot();
      const result = await window.TitanApi.askChat(text, snapshot);
      const reply = result?.reply || "No reply received.";

      this.removeThinking();
      this.addMessage("ai", reply);
      this.setStatus("Connected", "success");
    } catch (err) {
      this.removeThinking();
      this.addMessage("system", err?.message || "Chat request failed.");
      this.setStatus("Request failed", "danger");
    }
  },

  bindEvents() {
    const loginBtn = this.el("loginBtn");
    const sendBtn = this.el("sendChatBtn");
    const chatInput = this.el("chatInput");
    const quickButtons = document.querySelectorAll(".chat-actions .quick-btn");

    this.setLoginUI(false);

    if (loginBtn) {
      loginBtn.addEventListener("click", () => this.loginOrLogout());
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", () => {
        const text = this.el("chatInput")?.value || "";
        this.sendQuestion(text);
      });
    }

    if (chatInput) {
      chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendQuestion(chatInput.value);
        }
      });
    }

    quickButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const question = btn.getAttribute("data-question") || "";
        this.sendQuestion(question);
      });
    });
  }
};
