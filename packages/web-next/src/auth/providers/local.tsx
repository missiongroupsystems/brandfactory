"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { setAuth } from "@/auth/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BF_API_BASE_URL } from "@/lib/api/bf-client";

/**
 * Sign in with the dev token — `AUTH_PROVIDER=local` on the server, which is the shipped
 * default and what `pnpm -F @brandfactory/db db:seed` prints on boot.
 *
 * This is how the app runs with no Supabase project configured, which is how a contributor
 * runs it. It is not a shortcut around identity: the token *is* a user id, the server resolves
 * it to a real row, and every route below behaves exactly as it does under Supabase.
 *
 * Ported from `packages/web/src/auth/providers/local.tsx`.
 */

interface MeResponse {
  id: string;
}

export function LocalAuthProvider() {
  const [token, setToken] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BF_API_BASE_URL}/me`, {
        headers: { authorization: `Bearer ${token.trim()}` },
      });
      if (!res.ok) {
        setError("Invalid token — check the server logs.");
        return;
      }
      const data = (await res.json()) as MeResponse;
      setAuth(token.trim(), data.id);
      router.replace("/");
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="w-full space-y-4">
      <div className="space-y-2">
        <Label htmlFor="token">Dev token</Label>
        <Input
          id="token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste the token printed by the server on boot"
          required
        />
      </div>
      {error ? (
        <p role="alert" className="text-helper text-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={loading || !token.trim()}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
