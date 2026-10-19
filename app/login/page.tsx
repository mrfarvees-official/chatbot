"use client";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setBusy(false);
  }

  return (
    <main className="mx-auto mt-32 max-w-sm space-y-3 p-4">
      <h1 className="text-xl font-semibold">Admin login</h1>
      {sent ? (
        <p>
          If that email is allowed, a sign-in link is on its way. Open it in
          this browser.
        </p>
      ) : (
        <>
          <input
            type="email"
            className="w-full rounded-xl border px-4 py-2"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email && submit()}
          />
          <button
            className="w-full rounded-xl bg-blue-600 py-2 text-white disabled:opacity-40"
            disabled={!email || busy}
            onClick={submit}
          >
            Send magic link
          </button>
        </>
      )}
    </main>
  );
}
