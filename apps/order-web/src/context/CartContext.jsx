import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  CART_STORAGE_KEY,
  countCartUnits,
  groupCartLines,
  mergeCartLines,
  sanitizeCartLine,
  updateCartLine,
} from "../lib/requestCart";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

function readStoredLines(storageKey) {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return [];
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];
    return parsedValue.map(sanitizeCartLine);
  } catch (_error) {
    return [];
  }
}

export function CartProvider({ children }) {
  const { session } = useAuth();
  const storageKey = `${CART_STORAGE_KEY}:${session?.branchCode || "anonymous"}`;
  const [lines, setLines] = useState([]);

  useEffect(() => {
    setLines(readStoredLines(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(lines));
  }, [lines, storageKey]);

  function addLines(addedLines) {
    setLines((current) => mergeCartLines(current, addedLines));
  }

  function patchLine(lineKey, patch) {
    setLines((current) => updateCartLine(current, lineKey, patch));
  }

  function removeLine(lineKey) {
    setLines((current) => current.filter((line) => line.lineKey !== lineKey));
  }

  function clearCart() {
    setLines([]);
  }

  const value = useMemo(
    () => ({
      lines,
      addLines,
      patchLine,
      removeLine,
      clearCart,
      lineCount: lines.length,
      totalUnits: countCartUnits(lines),
      groupedLines: groupCartLines(lines),
    }),
    [lines],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }
  return context;
}
