"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ message: string; dev_reset_token?: string } | null>(null);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      setResult(await api("/api/auth/forgot", { method: "POST", json: { email } }));
    } catch (err: any) {
      setError(err.message);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">Enter your email and we'll create a reset link.</p>
      </div>
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {result && (
        <div className="rounded-lg bg-accent/10 px-3 py-2 text-sm">
          <p>{result.message}</p>
          {result.dev_reset_token && (
            <p className="mt-2 text-xs text-muted">
              Development mode: email sending isn't configured, so here is your link:{" "}
              <Link className="text-accent underline" href={`/reset?token=${encodeURIComponent(result.dev_reset_token)}`}>Reset password</Link>
            </p>
          )}
        </div>
      )}
      <Button className="w-full">Create reset link</Button>
      <p className="text-center text-sm text-muted"><Link href="/login" className="text-accent hover:underline">Back to sign in</Link></p>
    </form>
  );
}
