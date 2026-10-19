"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";

export default function SignupPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Please make your password at least 8 letters or numbers long.");
    setBusy(true);
    setError("");
    try {
      await signUp(email, password, name);
      router.push("/agents/new?welcome=1");
    } catch (err: any) {
      setError(err.message || "We couldn't make your account. Please check what you typed and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sign up</h1>
        <p className="mt-1 text-base text-muted">It's free. You don't need a credit card.</p>
      </div>
      <div><Label htmlFor="name">Your name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sam" /></div>
      <div><Label htmlFor="email">Your email address</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><Label htmlFor="password">Choose a password</Label><Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-base text-bad">{error}</p>}
      <Button className="w-full" disabled={busy}>{busy && <Spinner />} Sign up</Button>
      <p className="text-center text-base text-muted">Already signed up? <Link href="/login" className="text-accent underline">Sign in</Link></p>
    </form>
  );
}
