window.TitanChat = {
  isLoggedIn: false,

  el(id) {
    return document.getElementById(id);
  },

  addMessage(role, text) {
    const box = this.el("chatMessages");
    if (!box) return;

    const div = document.createElement("div");
    div.className = `chat-message ${role}`;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  },

  clearMessages() {
    const box = this.el("chatMessages");
    if (box) box.innerHTML = "";
  },

  setLoginUI(loggedIn) {
    const loginUser = this.el("loginUser");
    const loginPass = this.el("loginPass");
    const loginBtn = this.el("loginBtn");
    const chatInput = this.el("chatInput");
    const sendBtn = this.el("sendChatBtn");
    const quickButtons = document.querySelectorAll(".chat-actions .quick-btn");

    if (loginUser) loginUser.disabled = loggedIn;
    if (loginPass) loginPass.disabled = loggedIn;

    if (loginBtn) {
      loginBtn.textContent = loggedIn ? "Logout" : "Login";
    }

    if (chatInput) {
      chatInput.disabled = !loggedIn;
      chatInput.placeholder = loggedIn
        ? "Ask AI about current data..."
        : "Login first to use AI chat...";
    }

    if (sendBtn) {
      sendBtn.disabled = !loggedIn;
      sendBtn.style.opacity = loggedIn ? "1" : "0.6";
      sendBtn.style.cursor = loggedIn ? "pointer" : "not-allowed";
    }

    quickButtons.forEach((btn) => {
      btn.disabled = !loggedIn;
      btn.style.opacity = loggedIn ? "1" : "0.6";
      btn.style.cursor = loggedIn ? "pointer" : "not-allowed";
    });
  },

  buildSnapshot() {
    const raw = this.el("rawSnapshot");
    return raw ? raw.textContent : "{}";
  },

  async loginOrLogout() {
    if (this.isLoggedIn) {
      this.isLoggedIn = false;
      this.setLoginUI(false);
      this.clearMessages();
      this.addMessage("ai", "AI chat ready. Login first.");
      return;
    }

    const username = (this.el("loginUser")?.value || "").trim();
    const password = (this.el("loginPass")?.value || "").trim();

    if (!username || !password) {
      this.addMessage("ai", "Please enter username and password.");
      return;
    }

    try {
      const result = await window.TitanApi.login(username, password);

      if (result?.ok || result?.success) {
        this.isLoggedIn = true;
        this.setLoginUI(true);
        this.clearMessages();
        this.addMessage("ai", `Login successful. Welcome, ${username}.`);
      } else {
        this.addMessage("ai", result?.message || "Login failed.");
      }
    } catch (err) {
      this.addMessage("ai", err?.message || "Login failed.");
    }
  },

  async sendQuestion(question) {
    const text = String(question || "").trim();
    if (!text) return;

    if (!this.isLoggedIn) {
      this.addMessage("ai", "Login first.");
      return;
    }

    const input = this.el("chatInput");
    if (input) input.value = "";

    this.addMessage("user", text);
    this.addMessage("ai", "Thinking...");

    const box = this.el("chatMessages");
    const pending = box ? box.lastElementChild : null;

    try {
      const snapshot = this.buildSnapshot();
      const result = await window.TitanApi.askChat(text, snapshot);
      const reply = result?.reply || "No reply received.";

      if (pending) {
        pending.textContent = reply;
      } else {
        this.addMessage("ai", reply);
      }
    } catch (err) {
      if (pending) {
        pending.textContent = err?.message || "Chat request failed.";
      } else {
        this.addMessage("ai", err?.message || "Chat request failed.");
      }
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
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
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
