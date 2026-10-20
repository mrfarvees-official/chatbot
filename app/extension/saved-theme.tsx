"use client";

import { useEffect } from "react";

export function SavedTheme() {
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("chatbot-theme");
      document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
    } catch { /* Keep the default dark theme when storage is unavailable. */ }
  }, []);
  return null;
}
