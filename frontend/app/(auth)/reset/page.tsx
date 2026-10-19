"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/api/auth/reset", { method: "POST", json: { token, password } });
      setDone(true);
    } catch (err: any) {
      setError(err.message || "That didn't work. Please ask for a new link and try again.");
    }
  };
  if (done) return <p className="text-base">Your new password is saved. <Link href="/login" className="text-accent underline">Sign in now</Link></p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {!token && <p className="text-base text-muted">This link is not complete. Please <Link href="/forgot" className="text-accent underline">ask for a new link</Link>.</p>}
      <div><Label htmlFor="pw">New password (at least 8 letters or numbers)</Label><Input id="pw" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-base text-bad">{error}</p>}
      <Button className="w-full" disabled={!token}>Save my new password</Button>
    </form>
  );
}

export default function ResetPage() {
  return <Suspense><ResetForm /></Suspense>;
}
