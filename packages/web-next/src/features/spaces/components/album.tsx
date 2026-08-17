"use client";

import { useState } from "react";
import { ExternalLink, Pin, Trash2 } from "lucide-react";
import { Button, Card, Field, Pill, inputClass } from "@/features/spaces/components/ui";
import { useSchemeStore } from "@/features/spaces/store";
import { fmtDims, fmtMoney } from "@/features/spaces/format";

/**
 * The album: inspiration with intent. A pin can carry a shop link, a price
 * and real dimensions — attach it to a box on the plan and the box inherits
 * all three. A mood collage that behaves like a wish list.
 */
export function AlbumView() {
  const scheme = useSchemeStore((s) => s.scheme);
  const addReference = useSchemeStore((s) => s.addReference);
  const removeReference = useSchemeStore((s) => s.removeReference);
  const attachReference = useSchemeStore((s) => s.attachReference);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");

  const swatches = ["#8a5a1f", "#5a7d5f", "#335a7a", "#7a5c8a", "#b0843f", "#9a3b2e"];

  const pin = () => {
    if (!title.trim()) return;
    addReference({
      title: title.trim(),
      url: url.trim() || undefined,
      price: price ? Number(price) : undefined,
      swatch: swatches[title.length % swatches.length],
    });
    setTitle("");
    setUrl("");
    setPrice("");
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium tracking-[-0.01em] text-ink">Album</h2>
          <p className="mt-0.5 text-[13px] text-ink-tertiary">
            Paste a product page or a reference. Attach it to an item and the plan,
            the album and the cost agree.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Field label="Reference">
            <input
              className={`${inputClass} w-44`}
              placeholder="Rattan lounge chair"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Shop link">
            <input
              className={`${inputClass} w-48`}
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field label={`Price (${scheme.currency})`}>
            <input
              className={`${inputClass} w-24`}
              type="number"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Button variant="primary" size="sm" className="h-8" onClick={pin}>
            <Pin className="size-3.5" strokeWidth={1.75} />
            Pin it
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {scheme.references.map((ref) => {
          const placedOn = scheme.items.filter((i) => i.refId === ref.id);
          return (
            <Card key={ref.id} className="flex flex-col overflow-hidden">
              <div
                className="h-28 w-full"
                style={{
                  background: `linear-gradient(135deg, ${ref.swatch}, ${ref.swatch}cc)`,
                }}
                aria-hidden
              />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">
                      {ref.title}
                    </div>
                    <div className="text-[13px] text-ink-tertiary">
                      {ref.vendor ?? "No vendor"}
                      {ref.dims ? ` · ${fmtDims(ref.dims.w, ref.dims.d)}` : ""}
                    </div>
                  </div>
                  <div data-numeric className="shrink-0 text-sm font-medium text-ink">
                    {ref.price != null ? fmtMoney(ref.price, scheme.currency) : "—"}
                  </div>
                </div>

                {ref.note && (
                  <p className="text-[13px] text-ink-secondary">{ref.note}</p>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  {placedOn.length > 0 ? (
                    <Pill tone="success">On plan × {placedOn.length}</Pill>
                  ) : (
                    <select
                      className="h-7 max-w-[150px] rounded-lg border border-input bg-surface px-2 text-xs text-ink-secondary"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) attachReference(e.target.value, ref.id);
                      }}
                    >
                      <option value="">Attach to item…</option>
                      {scheme.items
                        .filter((i) => !i.refId)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                    </select>
                  )}
                  <div className="flex items-center gap-2">
                    {ref.url && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-tertiary hover:text-link"
                        aria-label={`Open shop link for ${ref.title}`}
                      >
                        <ExternalLink className="size-4" strokeWidth={1.75} />
                      </a>
                    )}
                    <button
                      onClick={() => removeReference(ref.id)}
                      className="text-ink-tertiary hover:text-error"
                      aria-label={`Remove ${ref.title}`}
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
