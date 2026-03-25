window.TitanApi = (() => {
  // Use same-origin by default (ideal for Render deploy). You can override via `window.TitanConfig.API_BASE`.
  const API_BASE = window.TitanConfig?.API_BASE || "/api";

  function buildUrl(path) {
    if (!path) return API_BASE || "";
    // Most callers pass paths like `/api/...` or `/overview?...` (leading slash).
    if (String(path).startsWith("/")) return `${API_BASE}${path}`;
    return `${API_BASE}/${path}`;
  }

  async function apiGet(path, options = {}) {
    const res = await fetch(buildUrl(path), {
      cache: options.cache || "no-store",
      headers: options.headers || {}
    });

    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status}`);
    }

    return res.json();
  }

  async function apiPost(path, body, headers = {}) {
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body || {})
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || `POST ${path} failed: ${res.status}`);
    }

    return data;
  }

  return {
    API_BASE,
    apiGet,
    apiPost
  };
})();
