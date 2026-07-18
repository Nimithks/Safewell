"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE as string) || "";

type AuthMode = "login" | "signup";

export default function SafeWellAuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Sign up first, then log in.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const token = window.sessionStorage.getItem("safewell-session-token");
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const endpoint = mode === "signup" ? "signup" : "login";
      const response = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "Request failed");
      }

      if (mode === "signup") {
        setMessage("Signup complete. Please log in with the same name and password.");
        setMode("login");
        setPassword("");
        return;
      }

      window.sessionStorage.setItem("safewell-session-token", payload.token);
      window.sessionStorage.setItem("safewell-active-profile", "");
      router.replace("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.14),_transparent_30%),linear-gradient(180deg,_#04111f_0%,_#08192c_50%,_#0b1320_100%)] text-slate-50">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl place-items-center px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
          <div className="flex flex-col justify-between rounded-[1.6rem] border border-white/8 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.14),transparent_55%),linear-gradient(180deg,_rgba(15,23,42,0.9),_rgba(2,6,23,0.96))] p-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-teal-100">
                SafeWell access
              </div>
              <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Sign in to your private weight-planning dashboard.
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-300 sm:text-lg">
                Create an account, then log in with the same name and password. First-time users are prompted for age, height,
                and current weight after login so the planner can keep the recommendations conservative and personal.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Step 1</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Sign up with a name and password.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Step 2</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Log in and receive a secure session token.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Step 3</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Complete onboarding, then open the dashboard.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-white/6 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Authentication</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {mode === "signup" ? "Create your account" : "Log in"}
                </h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                Protected entry
              </div>
            </div>

            <div className="mt-6 flex rounded-2xl border border-white/10 bg-slate-950/40 p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  mode === "login" ? "bg-teal-300 text-slate-950" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  mode === "signup" ? "bg-teal-300 text-slate-950" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                Sign up
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Name</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Password</span>
                <input
                  type="password"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Choose a password"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-teal-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Working..." : mode === "signup" ? "Create account" : "Log in"}
            </button>

            <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm leading-6 text-slate-300">
              {message}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
