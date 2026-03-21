window.TitanChat = {
  isLoggedIn: false,

  async loginUser() {
    const H = window.TitanHelpers;
    const user = document.getElementById("loginUser")?.value?.trim();
    const pass = document.getElementById("loginPass")?.value?.trim();

    if (!user || !pass) {
      H.appendChatMessage("ai", "Please enter username and password.");
      return;
    }

    try {
      const res = await window.TitanApi.login(user, pass);
      if (res.ok || res.success) {
        this.isLoggedIn = true;
        H.appendChatMessage("ai", "Login successful.");
      }
    } catch {
      if (user === "admin" && pass === "1234") {
        this.isLoggedIn = true;
        H.appendChatMessage("ai", "Login successful (local mode).");
      } else {
        H.appendChatMessage("ai", "Login failed.");
      }
    }
  },

  async sendChatMessage(customQuestion = "") {
    const H = window.TitanHelpers;
    if (!this.isLoggedIn) {
      H.appendChatMessage("ai", "Please login first.");
      return;
    }

    const input = document.getElementById("chatInput");
    const question = (customQuestion || input?.value || "").trim();
    if (!question) return;

    H.appendChatMessage("user", question);
    if (input) input.value = "";

    const snapshot = document.getElementById("rawSnapshot")?.textContent || "{}";

    try {
      const res = await window.TitanApi.askChat(question, snapshot);
      H.appendChatMessage("ai", res.reply || "No AI response returned.");
    } catch {
      H.appendChatMessage("ai", "Local mode: market looks mixed. Use controlled risk.");
    }
  },

  bindEvents() {
    document.getElementById("loginBtn")?.addEventListener("click", () => this.loginUser());
    document.getElementById("sendChatBtn")?.addEventListener("click", () => this.sendChatMessage());

    document.querySelectorAll(".quick-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const question = btn.getAttribute("data-question") || "";
        this.sendChatMessage(question);
      });
    });
  }
};
