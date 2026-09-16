import { useCallback, useEffect, useRef, useState } from "react";

export default function useAdminNavigationMenu(setView) {
  const [openNavGroup, setOpenNavGroup] = useState(null);
  const navigationMenuRef = useRef(null);

  const focusNavItem = useCallback((groupId, direction) => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const items = Array.from(
        navigationMenuRef.current?.querySelectorAll(`[data-nav-group="${groupId}"] [data-nav-item]:not(:disabled)`) || [],
      );
      if (items.length === 0) return;
      const activeIndex = items.findIndex((item) => item === document.activeElement);
      let nextIndex = 0;
      if (direction === "last") {
        nextIndex = items.length - 1;
      } else if (direction === "next") {
        nextIndex = activeIndex >= 0 ? (activeIndex + 1) % items.length : 0;
      } else if (direction === "previous") {
        nextIndex = activeIndex >= 0 ? (activeIndex - 1 + items.length) % items.length : items.length - 1;
      }
      items[nextIndex]?.focus();
    });
  }, []);

  const closeNavGroup = useCallback((groupId = openNavGroup, { restoreFocus = false } = {}) => {
    if (!groupId) {
      setOpenNavGroup(null);
      return;
    }

    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    const groupElement = navigationMenuRef.current?.querySelector(`[data-nav-group="${groupId}"]`);
    const triggerElement = navigationMenuRef.current?.querySelector(`[data-nav-trigger="${groupId}"]`);
    if (restoreFocus || (groupElement && activeElement instanceof HTMLElement && groupElement.contains(activeElement))) {
      triggerElement?.focus();
    }
    setOpenNavGroup(null);
  }, [openNavGroup]);

  const handleNavigate = useCallback((item) => {
    if (!item?.view || item.disabled) return;
    setView(item.view);
    closeNavGroup();
  }, [closeNavGroup, setView]);

  const handleNavTriggerKeyDown = useCallback((event, group) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpenNavGroup(group.id);
      focusNavItem(group.id, "first");
    }
  }, [focusNavItem]);

  const handleNavItemKeyDown = useCallback((event, groupId) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNavGroup(groupId, { restoreFocus: true });
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusNavItem(groupId, "next");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusNavItem(groupId, "previous");
    } else if (event.key === "Home") {
      event.preventDefault();
      focusNavItem(groupId, "first");
    } else if (event.key === "End") {
      event.preventDefault();
      focusNavItem(groupId, "last");
    }
  }, [closeNavGroup, focusNavItem]);

  useEffect(() => {
    if (!openNavGroup || typeof window === "undefined") return undefined;

    function handlePointerDown(event) {
      if (!navigationMenuRef.current?.contains(event.target)) {
        closeNavGroup();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeNavGroup(openNavGroup, { restoreFocus: true });
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeNavGroup, openNavGroup]);

  return {
    openNavGroup,
    setOpenNavGroup,
    navigationMenuRef,
    closeNavGroup,
    handleNavigate,
    handleNavTriggerKeyDown,
    handleNavItemKeyDown,
  };
}
