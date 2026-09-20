const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const unauthorizedListeners = new Set();

export function subscribeToUnauthorizedResponse(listener) {
  if (typeof listener !== "function") {
    throw new TypeError("An unauthorized-response listener must be a function");
  }

  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(response) {
  for (const listener of [...unauthorizedListeners]) {
    listener(response);
  }
}

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    notifyUnauthorized(response);
  }

  return response;
}

