"use client";
import { useEffect, useState } from "react";

export default function Login() {
  const [error] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error") === "google"
      ? "Google sign-in could not be started. Check that Google is enabled in Supabase."
      : "",
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) window.location.replace(data.isAdmin ? "/admin" : "/account");
      })
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto mt-32 max-w-sm space-y-3 p-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {error && <p className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p>}
      <a
        className="block w-full rounded-xl border px-4 py-2 text-center"
        href="/api/auth/google"
      >
        Continue with Google
      </a>
      <p className="text-sm text-neutral-500">
        Google sign-in is required for the public chatbot, browser tools, and admin portal.
      </p>
    </main>
  );
}
