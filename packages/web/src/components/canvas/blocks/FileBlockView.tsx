import { FileText } from 'lucide-react'
import type { FileCanvasBlock } from '@brandfactory/shared'
import { useSignedReadUrl } from '@/api/queries/blobs'

interface FileBlockViewProps {
  block: FileCanvasBlock
}

export function FileBlockView({ block }: FileBlockViewProps) {
  const { data: url } = useSignedReadUrl(block.blobKey)

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-surface-base p-3">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{block.filename}</p>
        <p className="text-xs text-muted-foreground">{block.mime}</p>
      </div>
      {url && (
        <a
          href={url}
          download={block.filename}
          // §3.1: a standalone link reads `--color-text-link`, not `--primary`
          // (the button *fill*). Same value in light, and they are meant to be
          // re-pointed independently.
          className="text-xs text-[var(--color-text-link)] hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Download
        </a>
      )}
    </div>
  )
}
