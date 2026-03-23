window.TitanApi = (() => {
  const API_BASE = "https://titan-ai-api.onrender.com/api";

  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status}`);
    }

    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
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
