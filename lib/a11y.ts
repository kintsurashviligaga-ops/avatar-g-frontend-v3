// Focus trap for modals
export function trapFocus(element: HTMLElement) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstFocusable = focusableElements[0] as HTMLElement;
  const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

  element.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  });

  firstFocusable?.focus();
}

// Announce to screen readers
export function announce(message: string, priority: "polite" | "assertive" = "polite") {
  const announcement = document.createElement("div");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", priority);
  announcement.setAttribute("aria-atomic", "true");
  announcement.className = "sr-only";
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

// Skip to content link component (for React)
export const skipToContentStyles = {
  position: "absolute" as const,
  top: "4px",
  left: "4px",
  zIndex: 50,
  padding: "8px 16px",
  backgroundColor: "#D4AF37",
  color: "#000",
  borderRadius: "8px",
  textDecoration: "none",
  clipPath: "inset(50%)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  width: "1px",
  height: "1px",
};

export const skipToContentFocusStyles = {
  clipPath: "none",
  width: "auto",
  height: "auto",
};
