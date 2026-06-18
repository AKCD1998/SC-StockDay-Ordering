const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

let currentCsrfToken = "";

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function setCsrfToken(token) {
  currentCsrfToken = token || "";
}

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBaseUrl}${path}`;
}

async function parsePayload(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (currentCsrfToken && !["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", currentCsrfToken);
  }

  return fetch(buildApiUrl(path), {
    credentials: "include",
    ...options,
    headers,
  });
}

async function requestJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new ApiError(payload?.message || payload?.error || `HTTP ${response.status}`, response.status, payload);
  }

  return payload;
}

export const api = {
  me() {
    return requestJson("/admin/me");
  },

  login({ username, password }) {
    return requestJson("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: String(username || "").trim(),
        password: String(password || ""),
      }),
    });
  },

  async logout() {
    const response = await apiFetch("/admin/auth/logout", {
      method: "POST",
    });

    if (!response.ok && response.status !== 401) {
      const payload = await parsePayload(response);
      throw new ApiError(payload?.message || payload?.error || `HTTP ${response.status}`, response.status, payload);
    }
  },

  getBranches() {
    return requestJson("/api/branches");
  },

  getBranchStock({ search = "", limit = 250, offset = 0 } = {}) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    if (search.trim()) {
      params.set("search", search.trim());
    }

    return requestJson(`/api/branch-stock?${params.toString()}`);
  },

  submitStockRequest(body) {
    return requestJson("/api/stock-requests", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getMyStockRequests({ search = "" } = {}) {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("search", search.trim());
    }
    const query = params.toString();
    return requestJson(`/api/stock-requests/mine${query ? `?${query}` : ""}`);
  },

  getStockRequestDetail(publicId) {
    return requestJson(`/api/stock-requests/${encodeURIComponent(publicId)}`);
  },

  getStockRequestEvents(publicId) {
    return requestJson(`/api/stock-requests/${encodeURIComponent(publicId)}/events`);
  },

  getIncomingStockRequests({ search = "" } = {}) {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("search", search.trim());
    }
    const query = params.toString();
    return requestJson(`/api/stock-requests/incoming${query ? `?${query}` : ""}`);
  },

  getIncomingStockRequestDetail(publicId) {
    return requestJson(`/api/stock-requests/incoming/${encodeURIComponent(publicId)}`);
  },

  saveLineResponseDraft(publicId, lineId, body) {
    return requestJson(
      `/api/stock-requests/incoming/${encodeURIComponent(publicId)}/lines/${encodeURIComponent(lineId)}/response`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  },

  submitStockRequestResponse(publicId, body) {
    return requestJson(
      `/api/stock-requests/incoming/${encodeURIComponent(publicId)}/submit-response`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
};
