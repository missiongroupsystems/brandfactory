/**
 * Upload constraints, defined once so the documents card and the create-sheet uploaders can
 * agree on what they accept. Historically each uploader hand-wrote its own `accept` string,
 * which is exactly how the sets drift; new callers should import from here.
 */

/**
 * Matches `core/storage.MAX_OBJECT_BYTES`, the server-side read cap: a document larger than
 * this uploads fine but can never be extracted, so refusing it in the client keeps the two
 * halves honest.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * The document types the app expects: a PDF, a Word document, or an image (a photo of a paper
 * certificate is common). Given to a file input's `accept` and enforced by `fileMatchesAccept`,
 * because `accept` is only a picker hint — drag-and-drop and "All files" both bypass it, and the
 * backend does not restrict MIME, so the client is the only gate.
 */
export const DOCUMENT_ACCEPT = "application/pdf,image/*,.doc,.docx";

/**
 * Does `file` satisfy an `accept` string (a comma list of MIME types, `type/*` wildcards, and
 * `.ext` suffixes)? An empty/absent `accept` accepts everything, matching the input's own default.
 */
export function fileMatchesAccept(file: File, accept?: string): boolean {
  const tokens = (accept ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}
