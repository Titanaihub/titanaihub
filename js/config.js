(function () {
  const override =
    typeof window !== "undefined" && window.TITAN_API_BASE
      ? String(window.TITAN_API_BASE)
          .trim()
          .replace(/\/$/, "")
      : "";

  if (override) {
    window.TitanConfig = {
      API_BASE: override,
      API_BASE_FALLBACK: "",
      REFRESH_MS: 30000
    };
    return;
  }

  window.TitanConfig = {
    // Same-origin when the site is served by Express (Render Web Service + npm start).
    API_BASE: "/api",
    // If the page is static-only (no /api on this host), api-client will retry here after 404.
    API_BASE_FALLBACK: "https://titan-ai-api.onrender.com/api",
    REFRESH_MS: 30000
  };
})();
