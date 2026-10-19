"use client";

import { useEffect, useState } from "react";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  mobile_number: string | null;
};

const empty: Profile = {
  first_name: "",
  last_name: "",
  mobile_number: "",
};

export default function Account() {
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile>(empty);
  const [status, setStatus] = useState("Loading…");

  useEffect(() => {
    fetch("/api/profile")
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 401) {
          window.location.replace("/login");
          return null;
        }
        if (!res.ok) throw new Error(data.error ?? "Could not load profile");
        return data;
      })
      .then((data) => {
        if (!data) return;
        setEmail(data.email ?? "");
        setProfile({ ...empty, ...data.profile });
        setStatus("");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Could not load profile"));
  }, []);

  async function save() {
    setStatus("Saving…");
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? "Saved" : data.error ?? "Could not save");
  }

  return (
    <main className="mx-auto mt-20 max-w-lg space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="text-sm text-neutral-600">{email}</p>
      </div>
      <p className="text-sm text-neutral-600">
        These values can fill authenticated browser-tool drafts. They are not visible to other users.
      </p>
      {(["first_name", "last_name", "mobile_number"] as const).map((field) => (
        <label key={field} className="block space-y-1">
          <span className="text-sm capitalize">{field.replaceAll("_", " ")}</span>
          <input
            className="w-full rounded-xl border px-4 py-2"
            value={profile[field] ?? ""}
            onChange={(event) => setProfile({ ...profile, [field]: event.target.value })}
          />
        </label>
      ))}
      <p className="text-sm text-neutral-600">
        Full name: {[profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Not set"}
      </p>
      <button className="rounded-xl bg-blue-600 px-4 py-2 text-white" onClick={save}>
        Save profile
      </button>
      {status && <p className="text-sm text-neutral-600">{status}</p>}
    </main>
  );
}
