window.TitanApi = (() => {
  // Use same-origin by default (ideal for Render deploy). You can override via `window.TitanConfig.API_BASE`.
  function normalizeApiBase(raw) {
    const v = String(raw || "").trim();
    if (!v) return "";
    // Absolute base (http/https) - keep as is.
    if (v.startsWith("http://") || v.startsWith("https://")) {
      return v.endsWith("/") ? v.slice(0, -1) : v;
    }
    // Relative base.
    const withSlash = v.startsWith("/") ? v : `/${v}`;
    return withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
  }

  const PRIMARY_BASE = normalizeApiBase(window.TitanConfig?.API_BASE || "/api");
  const FALLBACK_BASE = normalizeApiBase(window.TitanConfig?.API_BASE_FALLBACK || "");
  const API_BASES = [PRIMARY_BASE, FALLBACK_BASE].filter(Boolean);

  function buildUrl(base, path) {
    if (!path) return base || "";
    if (String(path).startsWith("/")) return `${base}${path}`;
    return `${base}/${path}`;
  }

  async function parseJsonSafe(res) {
    const txt = await res.text();
    // Attempt parse; if it fails, we surface first part of body for debugging.
    try {
      return { ok: true, data: JSON.parse(txt || "{}") };
    } catch (e) {
      return { ok: false, raw: txt.slice(0, 200) };
    }
  }

  async function apiGet(path, options = {}) {
    let lastErr = null;
    for (const base of API_BASES) {
      try {
        const res = await fetch(buildUrl(base, path), {
          cache: options.cache || "no-store",
          headers: options.headers || {}
        });

        const parsed = await parseJsonSafe(res);
        if (!res.ok) {
          throw new Error(`GET ${path} failed @${base}: ${res.status} (${parsed.raw || "bad json"})`);
        }
        if (!parsed.ok) {
          throw new Error(`GET ${path} invalid JSON @${base}: ${parsed.raw}`);
        }

        return parsed.data;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error(`GET ${path} failed`);
  }

  async function apiPost(path, body, headers = {}) {
    let lastErr = null;
    for (const base of API_BASES) {
      try {
        const res = await fetch(buildUrl(base, path), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify(body || {})
        });

        const parsed = await parseJsonSafe(res);
        if (!res.ok) {
          throw new Error(
            `POST ${path} failed @${base}: ${res.status} (${parsed.raw || "bad json"})`
          );
        }
        if (!parsed.ok) {
          throw new Error(`POST ${path} invalid JSON @${base}: ${parsed.raw}`);
        }

        return parsed.data;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error(`POST ${path} failed`);
  }

  return {
    API_BASES,
    apiGet,
    apiPost
  };
})();
