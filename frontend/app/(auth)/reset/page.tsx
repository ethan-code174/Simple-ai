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
      setError(err.message);
    }
  };
  if (done) return <p className="text-sm">Your password was changed. <Link href="/login" className="text-accent underline">Sign in</Link></p>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <div><Label htmlFor="pw">New password</Label><Input id="pw" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <Button className="w-full" disabled={!token}>Save password</Button>
    </form>
  );
}

export default function ResetPage() {
  return <Suspense><ResetForm /></Suspense>;
}
