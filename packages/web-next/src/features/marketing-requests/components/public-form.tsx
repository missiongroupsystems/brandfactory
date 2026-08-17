"use client";

import { CheckCircle2Icon } from "lucide-react";
import * as React from "react";

import { AppLogoIcon } from "@/components/brand/app-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { MARKETING_REQUEST_FORM } from "../fixture";
import { publicSubmit } from "../api";
import { FormFiller } from "./form-fields";

/**
 * The public face of the Marketing Request, served at `/f/request` outside the app shell — no
 * sidebar, no login. It submits through {@link publicSubmit}, the unauthenticated endpoint, so
 * this page never carries the app's API token. On success it shows only a confirmation reference.
 *
 * **The slug is still matched rather than assumed**, even though exactly one form can answer it.
 * `/f/<slug>` is a shape people paste, and a mistyped or retired slug has to say so — rendering
 * the one form there is for any address at all would make every wrong link look right.
 */
export function PublicForm({ slug }: { slug: string }) {
  const form = slug === MARKETING_REQUEST_FORM.slug ? MARKETING_REQUEST_FORM : undefined;
  const [reference, setReference] = React.useState<string | null>(null);

  if (!form) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-10 text-center text-ink-secondary">
            This form link isn&apos;t valid. Check the address, or ask whoever shared it for a new
            link.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (reference) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2Icon aria-hidden className="size-8 text-success" />
            <p className="text-lg font-medium text-ink">Thank you — that&apos;s been submitted.</p>
            <p className="text-ink-secondary">
              Your reference is{" "}
              <span className="font-mono font-medium text-ink">{reference}</span>. The marketing
              team will pick it up from here.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <form.icon aria-hidden className="size-5 text-ink-tertiary" />
            {form.name}
          </CardTitle>
          <p className="text-ink-secondary">{form.description}</p>
        </CardHeader>
        <CardContent>
          <FormFiller
            form={form}
            submitLabel="Submit"
            onSubmit={async (payload) => {
              const receipt = await publicSubmit(form.slug, payload);
              setReference(receipt.reference);
            }}
          />
        </CardContent>
      </Card>
    </Shell>
  );
}

/**
 * A centered, chromeless page — the public form stands alone, with just the product lockup.
 *
 * The lockup is the sidebar's, rebuilt rather than imported: the app shell's version lives
 * inside `AppSidebar`, and this page is deliberately outside that tree. Keep the two in step by
 * hand, or promote the block the day a third surface needs it.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface-sunken px-4 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-accent text-ink-inverse">
            <AppLogoIcon decorative className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-ink">Marketing Hub</span>
            <span className="text-xs text-ink-tertiary">Mission Systems</span>
          </div>
        </div>
        {children}
        <p className="text-center text-helper text-ink-tertiary">
          Submitted securely to the Mission Systems marketing team. No account needed.
        </p>
      </div>
    </div>
  );
}
