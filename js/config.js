window.TitanConfig = {
  // Same-origin for Render apps: endpoints are mounted under `/api`
  // Use relative path to be robust with potential path prefixes.
  API_BASE: "/api",
  // Leave empty for unified deploy (recommended). Only set this if you split
  // frontend/backend into two Render services — wrong fallback breaks login.
  API_BASE_FALLBACK: "",
  REFRESH_MS: 30000
};
