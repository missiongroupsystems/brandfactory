import { z } from 'zod'

// Content types the server accepts for user uploads. Validated server-side;
// the client sends the declared contentType and the server rejects anything
// not on this list before minting a signed write URL.
export const ALLOWED_UPLOAD_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  // The brand's typefaces. Refused until the identity shelf had a section for
  // them, which meant a `.woff2` could not be uploaded at all — the signed write
  // URL was denied before any of the library was reached.
  //
  // **`CONTENT_TYPE_BY_EXTENSION` is deliberately left alone.** That map names
  // the types a browser may render *inline* from user bytes, and a font is not
  // one of those — it is a download, exactly as `text/plain` and the two Word
  // types already are. `application/octet-stream` is the correct answer for
  // serving these back.
  'font/woff2',
  'font/woff',
  'font/otf',
  'font/ttf',
] as const

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIMES)[number]

export const BlobUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().int().min(1),
})

export type BlobUploadRequest = z.infer<typeof BlobUploadRequestSchema>

export const BlobUploadResponseSchema = z.object({
  key: z.string().min(1),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
})

export type BlobUploadResponse = z.infer<typeof BlobUploadResponseSchema>

export const BlobReadUrlResponseSchema = z.object({
  url: z.string().min(1),
})

export type BlobReadUrlResponse = z.infer<typeof BlobReadUrlResponseSchema>
