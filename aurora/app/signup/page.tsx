"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { NeonButton } from "@/components/ui/neon-button";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || undefined,
        email: email.trim(),
        password,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create your account.");
      setSubmitting(false);
      return;
    }

    // Auto sign-in after signup so the user lands directly in their galaxy.
    const signin = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });

    if (signin?.error) {
      // Fallback — bounce to login.
      router.replace("/login");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <AuthShell
      title="Begin your galaxy"
      subtitle="A universe of dreams, waiting to be lit."
      footer={
        <>
          Already have one?{" "}
          <Link
            href="/login"
            className="text-nebula-violet-soft hover:text-white"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-[0.2em] text-white/55">
            Name <span className="text-white/30">(optional)</span>
          </label>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus-aurora"
            placeholder="Aurora"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.2em] text-white/55">
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus-aurora"
            placeholder="you@dreamspace.io"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.2em] text-white/55">
            Password
          </label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus-aurora"
            placeholder="At least 8 characters"
          />
        </div>

        {error && (
          <p className="text-[12px] text-rose-300/85" role="alert">
            {error}
          </p>
        )}

        <NeonButton
          type="submit"
          glow="violet"
          className="!w-full mt-2"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Lighting your stars…
            </>
          ) : (
            <>
              Create account
              <ArrowRight size={14} />
            </>
          )}
        </NeonButton>
      </form>
    </AuthShell>
  );
}
