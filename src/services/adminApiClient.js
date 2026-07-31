const DEFAULT_LOCAL_ADMIN_API = "http://localhost:7001";
const DEFAULT_LOCAL_ADMIN_API_ALT = "http://127.0.0.1:7001";

function normalizeBase(base) {
  return String(base || "").trim().replace(/\/+$/, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getBaseCandidates() {
  const configured = normalizeBase(import.meta.env.VITE_MANUAL_API_URL);
  const origin = typeof window !== "undefined" ? normalizeBase(window.location.origin) : "";
  const isLocalhostOrigin = /^https?:\/\/localhost(?::\d+)?$/i.test(origin);
  const isLoopbackOrigin = /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);
  const localhostMirror = isLoopbackOrigin ? origin.replace("127.0.0.1", "localhost") : "";
  const loopbackMirror = isLocalhostOrigin ? origin.replace("localhost", "127.0.0.1") : "";

  // In local development, always prefer the local backend first.
  if (isLocalhostOrigin || isLoopbackOrigin) {
    return unique([
      DEFAULT_LOCAL_ADMIN_API,
      DEFAULT_LOCAL_ADMIN_API_ALT,
      configured,
    ]);
  }

  return unique([configured, DEFAULT_LOCAL_ADMIN_API, DEFAULT_LOCAL_ADMIN_API_ALT, localhostMirror, loopbackMirror]);
}

function buildAdminApiUrl(base, endpointPath) {
  const normalizedBase = normalizeBase(base);
  const cleanedPath = String(endpointPath || "").replace(/^\/+/, "");

  if (!cleanedPath) {
    throw new Error("Admin API endpoint path is required.");
  }

  if (normalizedBase.endsWith("/api")) {
    return `${normalizedBase}/${cleanedPath}`;
  }

  if (normalizedBase.includes("/api/")) {
    return `${normalizedBase}/${cleanedPath}`;
  }

  return `${normalizedBase}/api/${cleanedPath}`;
}

function buildAdminApiUrls(base, endpointPath) {
  const normalizedBase = normalizeBase(base);
  const cleanedPath = String(endpointPath || "").replace(/^\/+/, "");
  if (!cleanedPath) {
    throw new Error("Admin API endpoint path is required.");
  }

  const rawSegments = cleanedPath.split("/").filter(Boolean);
  const withoutAdminPrefix =
    rawSegments[0] === "admin" ? rawSegments.slice(1).join("/") : cleanedPath;
  const adminPath = `admin/${withoutAdminPrefix}`.replace(/^\/+/, "");

  // Canonical-only resolution to avoid noisy 404 probes in browser console.
  // This backend mounts admin routes at /api/admin.
  if (/\/api$/i.test(normalizedBase) || /\/api\//i.test(normalizedBase)) {
    return unique([`${normalizedBase}/${adminPath}`]);
  }

  return unique([`${normalizedBase}/api/${adminPath}`]);
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort(new Error(`Admin API timeout after ${timeoutMs}ms`));
  }, timeoutMs);
  return { controller, timer };
}

export async function postAdminApi(endpointPath, payload, token, options = {}) {
  const timeoutMs = options.timeoutMs ?? 90000;
  const candidates = getBaseCandidates();
  const attemptedUrls = [];
  let lastError = null;

  for (const base of candidates) {
    const urls = buildAdminApiUrls(base, endpointPath);
    for (const url of urls) {
      attemptedUrls.push(url);
      const { controller, timer } = withTimeout(timeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        window.clearTimeout(timer);

        // If this host/path does not expose admin API, continue fallback search.
        if (response.status === 404 || response.status === 405) {
          continue;
        }

        return { response, url, attemptedUrls };
      } catch (error) {
        window.clearTimeout(timer);
        lastError = error;
      }
    }
  }

  const hint =
    "Unable to reach Admin API. Start backend server on port 7001 or set VITE_MANUAL_API_URL to your API host.";
  const tried = attemptedUrls.length > 0 ? ` Tried: ${attemptedUrls.join(", ")}` : "";
  const reason = lastError instanceof Error ? ` (${lastError.message})` : "";
  throw new Error(`${hint}${tried}${reason}`);
}

export async function requestAdminApi(
  endpointPath,
  { method = "GET", payload, token, timeoutMs = 45000, headers: extraHeaders = {} } = {}
) {
  const candidates = getBaseCandidates();
  const attemptedUrls = [];
  let lastError = null;

  for (const base of candidates) {
    const urls = buildAdminApiUrls(base, endpointPath);
    for (const url of urls) {
      attemptedUrls.push(url);
      const { controller, timer } = withTimeout(timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          cache: "no-store",
          headers: {
            ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...extraHeaders,
          },
          ...(method !== "GET" ? { body: JSON.stringify(payload || {}) } : {}),
          signal: controller.signal,
        });

        window.clearTimeout(timer);
        if (response.status === 404 || response.status === 405) {
          continue;
        }
        return { response, url, attemptedUrls };
      } catch (error) {
        window.clearTimeout(timer);
        lastError = error;
      }
    }
  }

  const hint =
    "Unable to reach Admin API. Start backend server on port 7001 or set VITE_MANUAL_API_URL to your API host.";
  const tried = attemptedUrls.length > 0 ? ` Tried: ${attemptedUrls.join(", ")}` : "";
  const reason = lastError instanceof Error ? ` (${lastError.message})` : "";
  throw new Error(`${hint}${tried}${reason}`);
}

export async function parseAdminApiError(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  return (
    payload?.error ||
    payload?.message ||
    fallbackMessage ||
    "Admin API request failed."
  );
}

export async function checkAdminApiAvailability(options = {}) {
  const timeoutMs = options.timeoutMs ?? 5000;
  const token = String(options.token || "").trim();
  const candidates = getBaseCandidates();

  for (const base of candidates) {
    const normalizedBase = normalizeBase(base);
    if (!normalizedBase) continue;

    const probeUrls = unique([
      `${normalizedBase}/api/admin/students`,
      `${normalizedBase}/api/admin/dashboard-summary`,
    ]);

    for (const probeUrl of probeUrls) {
      const { controller, timer } = withTimeout(timeoutMs);
      try {
        const response = await fetch(probeUrl, {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        window.clearTimeout(timer);
        // 200/401/403 all indicate endpoint is reachable.
        if (response.ok || response.status === 401 || response.status === 403) {
          return { online: true, base: normalizedBase };
        }
      } catch (_error) {
        window.clearTimeout(timer);
      }
    }
  }

  return { online: false, base: null };
}
