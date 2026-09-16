import { useEffect, useState } from "react";
import {
  adminViewKeys,
  buildAdminViewHash,
  defaultAdminView,
  readAdminViewFromLocation,
} from "./adminNavigation.js";

export const adminViewStorageKey = "sc-stockday-admin-view";

function readInitialAdminView() {
  if (typeof window === "undefined") return defaultAdminView;
  const locationView = readAdminViewFromLocation();
  if (locationView && adminViewKeys.includes(locationView)) {
    return locationView;
  }
  const savedView = window.localStorage.getItem(adminViewStorageKey);
  return adminViewKeys.includes(savedView)
    ? savedView
    : defaultAdminView;
}

export default function useAdminView() {
  const [view, setView] = useState(readInitialAdminView);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(adminViewStorageKey, view);
    const nextHash = buildAdminViewHash(view);
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function syncViewFromLocation() {
      const locationView = readAdminViewFromLocation();
      if (locationView && adminViewKeys.includes(locationView)) {
        setView(locationView);
      } else if (!window.location.hash && window.location.pathname === "/") {
        setView((current) => current);
      }
    }

    window.addEventListener("hashchange", syncViewFromLocation);
    window.addEventListener("popstate", syncViewFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncViewFromLocation);
      window.removeEventListener("popstate", syncViewFromLocation);
    };
  }, []);

  return [view, setView];
}
