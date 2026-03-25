window.TitanConfig = {
  // Same-origin for Render apps: endpoints are mounted under `/api`
  // Use relative path to be robust with potential path prefixes.
  API_BASE: "/api",
  // Fallback to the previously-working backend domain (keeps app working
  // even if frontend and backend are deployed as separate Render services).
  API_BASE_FALLBACK: "https://titan-ai-api.onrender.com/api",
  REFRESH_MS: 30000
};
