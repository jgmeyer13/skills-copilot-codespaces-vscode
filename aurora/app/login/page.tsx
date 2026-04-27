"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { NeonButton } from "@/components/ui/neon-button";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid email or password.");
      setSubmitting(false);
      return;
    }

    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Step back into your dream galaxy."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="text-nebula-violet-soft hover:text-white"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-[0.2em] text-white/55">
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            autoFocus
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus-aurora"
            placeholder="••••••••"
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
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight size={14} />
            </>
          )}
        </NeonButton>
      </form>
    </AuthShell>
  );
}
