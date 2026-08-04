"use client";

import { type FormEvent, useState } from "react";
import { supabase } from "../../lib/clients";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
      // Full navigation (not router.push) — a real page load after submit is
      // what makes password managers reliably offer to save the credentials.
      window.location.assign("../");
      return;
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // With email confirmation on, there is no session yet — tell them to check mail.
    if (data.session === null) {
      setNotice("A raven is on its way — confirm your email, then enter the keep.");
      setMode("signin");
      return;
    }
    window.location.assign("../");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-serif text-3xl font-bold tracking-tight">🏰 Financial Kingdom</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-amber-200/60">
        Rule your realm's treasury.
      </p>

      {/* id/name/autocomplete are what password managers key off — keep them. */}
      <form onSubmit={onSubmit} method="post" className="mt-8 flex flex-col gap-3">
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="Sovereign's email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-amber-800/30 bg-white px-3 py-2 dark:border-amber-200/20 dark:bg-stone-900"
        />
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Royal seal (password)"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-amber-800/30 bg-white px-3 py-2 dark:border-amber-200/20 dark:bg-stone-900"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-lg bg-amber-700 px-3 py-2 font-medium text-amber-50 hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? "Unbarring the gates…" : mode === "signin" ? "Enter the keep" : "Found a kingdom"}
        </button>
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setNotice(null);
        }}
        className="mt-4 text-left text-sm text-stone-500 underline hover:text-amber-800 dark:text-amber-200/60"
      >
        {mode === "signin" ? "New sovereign? Found a kingdom" : "Already crowned? Enter the keep"}
      </button>
    </main>
  );
}
