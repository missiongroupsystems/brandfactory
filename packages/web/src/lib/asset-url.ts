import type { BrandAsset } from '@brandfactory/shared'

/**
 * Every asset resolves to a URL, and no caller branches on `source`.
 *
 * This is the one `BrandAsset` accessor that did **not** move to
 * `@brandfactory/shared` with the rest of them, and the reason is the
 * `resolveBlob` argument: a `blob` asset resolves through a *signed read URL*
 * that expires in five minutes and is refreshed on a 4-minute interval by
 * `api/queries/blobs.ts`. That is a browser-session concern with a lifetime,
 * not a pure function of the row, so a server-side resolver would mint URLs
 * that are stale before the page paints.
 *
 * Returns `null` for a colour, which has no URL and never wanted one — a caller
 * that asks a swatch for a URL has confused two kinds.
 */
export function assetUrl(asset: BrandAsset, resolveBlob: (key: string) => string): string | null {
  switch (asset.source) {
    case 'inline':
      return null
    case 'blob':
      return resolveBlob(asset.blobKey)
    case 'link':
      return asset.url
  }
}
