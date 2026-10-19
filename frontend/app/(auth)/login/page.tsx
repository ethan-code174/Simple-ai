"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("expired") ? "You were signed out to keep your account safe. Please sign in again." : "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "We couldn't sign you in. Please check your email and password and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-base text-muted">Type your email and password.</p>
      </div>
      <div><Label htmlFor="email">Your email address</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div>
        <div className="flex items-center justify-between"><Label htmlFor="password">Your password</Label><Link href="/forgot" className="mb-1.5 text-base text-accent underline">Forgot it?</Link></div>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-base text-bad">{error}</p>}
      <Button className="w-full" disabled={busy}>{busy && <Spinner />} Sign in</Button>
      <p className="text-center text-base text-muted">New here? <Link href="/signup" className="text-accent underline">Sign up free</Link></p>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
