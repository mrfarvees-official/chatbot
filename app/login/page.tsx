"use client";
import { useEffect, useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) window.location.replace(data.isAdmin ? "/admin" : "/account");
      })
      .catch(() => {});
  }, []);

  async function submitEmail() {
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/auth/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, mode }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Could not sign in");
    window.location.replace("/");
  }

  return (
    <main className="mx-auto mt-32 max-w-sm space-y-3 p-4">
      <h1 className="text-xl font-semibold">{mode === "signup" ? "Create owner account" : "Sign in"}</h1>
      {error && <p className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p>}
      <p className="text-sm text-neutral-500">
        Local SQLite email accounts are used for the chatbot and admin portal. Admin access still requires the email to be listed in ADMIN_EMAILS.
      </p>
      <div className="space-y-2 border-t pt-3">
        <input className="w-full rounded-xl border px-4 py-2" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input className="w-full rounded-xl border px-4 py-2" type="password" placeholder="Password (8+ characters)" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submitEmail()} />
        {mode === "signup" && <input className="w-full rounded-xl border px-4 py-2" type="password" placeholder="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submitEmail()} />}
        <button className="w-full rounded-xl bg-blue-600 py-2 text-white disabled:opacity-40" disabled={busy || !email || password.length < 8 || (mode === "signup" && !confirmPassword)} onClick={submitEmail}>{mode === "signin" ? "Sign in with email" : "Create local account"}</button>
        <button className="w-full text-sm underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "Create a local account" : "I already have an account"}</button>
      </div>
    </main>
  );
}
