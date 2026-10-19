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
      setError(err.message || "That didn't work. Please check your email address and try again.");
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Forgot your password?</h1>
        <p className="mt-1 text-base text-muted">Type your email address. We will make a link so you can choose a new password.</p>
      </div>
      <div><Label htmlFor="email">Your email address</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-base text-bad">{error}</p>}
      {result && (
        <div className="rounded-lg bg-accent/10 px-3 py-2 text-base">
          <p>{result.message}</p>
          {result.dev_reset_token && (
            <p className="mt-2 text-base text-muted">
              Email is not set up yet, so here is your link:{" "}
              <Link className="text-accent underline" href={`/reset?token=${encodeURIComponent(result.dev_reset_token)}`}>Choose a new password</Link>
            </p>
          )}
        </div>
      )}
      <Button className="w-full">Get my link</Button>
      <p className="text-center text-base text-muted"><Link href="/login" className="text-accent underline">Go back to sign in</Link></p>
    </form>
  );
}
