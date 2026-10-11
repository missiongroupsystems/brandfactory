'use client'

import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { CheckIcon, CloseIcon, PlusIcon, SparkIcon } from '@/components/icons'
import type { BrandFile, FileKind } from '@/data/brand-kit'
import { useBrand } from '@/features/schedule/posts-store'

import { BrandLogo } from './brand-logo'
import { editFiles, editKit, newFileId, useBrandFiles, useBrandKit } from './brand-store'
import { ColoursEditable } from './kit-colours'
import { EYEBROW, QUIET, Section, type Voice, VoiceView } from './kit-parts'
import { removed, renamed, replaced, uploaded, voiceEdited } from './model'
import { VoiceCardSection } from './voice/concept-card'
import { VoiceStepsSection } from './voice/concept-steps'
import { VoiceStudioSection } from './voice/concept-studio'

/** Three ways to edit the voice, behind `/brand?voice=1|2|3`, for the team to pick one. */
export type VoiceConcept = 1 | 2 | 3

const VOICE_CONCEPTS = {
  1: VoiceStudioSection,
  2: VoiceCardSection,
  3: VoiceStepsSection,
} satisfies Record<VoiceConcept, React.ComponentType>

const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  deck: 'Deck',
  doc: 'Doc',
  sheet: 'Sheet',
  image: 'Image',
}

const PAGE = 'M7 3.5h6.5L18 8v12.5H7z M13.5 3.5V8H18'

/** One thin glyph per kind, drawn like the rest of the app's icons: no colour, no badge. */
const KIND_PATH: Record<FileKind, string> = {
  pdf: PAGE,
  doc: `${PAGE} M9.5 12h6 M9.5 15h6 M9.5 18h3.5`,
  deck: 'M3.5 5h17v11h-17z M12 16v3.5 M8.5 19.5h7',
  sheet: 'M4.5 5h15v14h-15z M4.5 10h15 M4.5 14.5h15 M10 5v14',
  image: 'M4 5h16v14H4z M4 16l4.5-4.5 4 4 2.5-2.5L20 18 M15.5 9.5h.01',
}

/** The file's kind in a quiet tile, the size of the Connections page's source marks. */
function FileIcon({ file }: { file: BrandFile }) {
  return (
    <span
      role="img"
      aria-label={KIND_LABEL[file.kind]}
      className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-ink-3"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={KIND_PATH[file.kind]}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/**
 * The brand page: the one place for how the current brand looks and sounds. Nobody opens it
 * daily; a new hire reads it once, and AI drafts read it every time. Voice first, since that is
 * what AI uses most, then colours, the logo, and the team's files, each with a plain title.
 *
 * At rest it reads as a page, not a form. Each section has one quiet control at its top right:
 * Edit turns that section into fields and Done saves them, so a tap on a swatch still copies it.
 */
export function BrandPage({ voiceConcept }: { voiceConcept?: VoiceConcept }) {
  const { brand } = useBrand()
  const VoiceArea = voiceConcept ? VOICE_CONCEPTS[voiceConcept] : VoiceSection

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main
        key={brand.id}
        className="bb-swap mx-auto flex w-full max-w-[760px] flex-col px-4 pb-24"
      >
        <div className="flex flex-col gap-4 pt-6 pb-10 max-md:pt-2 max-md:pb-8">
          <span className="flex h-8 items-center justify-between">
            <span className={EYEBROW}>Brand kit</span>
          </span>
          <h1 className="font-display text-[56px] leading-none tracking-[-0.035em] max-md:text-[34px]">
            {brand.name}
          </h1>
          <p className="max-w-[560px] text-[15px] text-ink-3">{brand.line}</p>
          <span className="flex items-center gap-2 text-[12.5px] text-ink-4">
            <SparkIcon size={10} />
            Used when AI drafts captions, hooks and replies.
          </span>
        </div>

        <VoiceArea />
        <ColoursEditable />
        <LogoSection />
        <Files />
      </main>
    </div>
  )
}

function EditToggle({
  label,
  editing,
  onEdit,
  onDone,
}: {
  label: string
  editing: boolean
  onEdit: () => void
  onDone: () => void
}) {
  const [saved, setSaved] = React.useState(false)
  React.useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 1400)
    return () => clearTimeout(t)
  }, [saved])
  if (editing)
    return (
      <button
        type="button"
        onClick={() => {
          onDone()
          setSaved(true)
        }}
        className="bb-press flex h-8 items-center rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-page hover:opacity-85"
      >
        Done
      </button>
    )
  return (
    <button
      type="button"
      aria-label={`Edit ${label}`}
      onClick={onEdit}
      className={`${QUIET} -mr-3`}
    >
      {saved ? (
        <>
          <CheckIcon size={10} />
          Saved
        </>
      ) : (
        'Edit'
      )}
    </button>
  )
}

/** A field in an open section: a soft surface, so it is plain what can change. */
const FIELD =
  'min-w-0 rounded-[10px] bg-surface outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_var(--line-strong)]'

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink max-md:size-7"
    >
      <CloseIcon />
    </button>
  )
}

function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${QUIET} -ml-3 self-start`}>
      <PlusIcon size={11} />
      {children}
    </button>
  )
}

function VoiceSection() {
  const { brand } = useBrand()
  const voice = useBrandKit(brand.id).voice
  // The open section's fields, null at rest: Done saves them, Escape drops them.
  const [draft, setDraft] = React.useState<Voice | null>(null)

  return (
    <Section
      label="Voice"
      onCancel={() => setDraft(null)}
      action={
        <EditToggle
          label="voice"
          editing={draft !== null}
          onEdit={() => setDraft(voice)}
          onDone={() => {
            if (draft) editKit(brand.id, (k) => ({ ...k, voice: voiceEdited(k.voice, draft) }))
            setDraft(null)
          }}
        />
      }
    >
      {draft ? <VoiceFields draft={draft} onChange={setDraft} /> : <VoiceView voice={voice} />}
    </Section>
  )
}

function VoiceFields({ draft, onChange }: { draft: Voice; onChange: (v: Voice) => void }) {
  const summary = React.useRef<HTMLTextAreaElement>(null)
  // Edit was a tap on this section, so the cursor goes to the end of the summary at once.
  React.useEffect(() => {
    const el = summary.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  const word = (i: number, key: 'use' | 'avoid', value: string) =>
    onChange({ ...draft, words: draft.words.map((w, j) => (j === i ? { ...w, [key]: value } : w)) })
  const line = (i: number, value: string) =>
    onChange({ ...draft, examples: draft.examples.map((l, j) => (j === i ? value : l)) })

  return (
    <>
      <textarea
        ref={summary}
        aria-label="How the brand sounds"
        value={draft.summary}
        onChange={(e) => onChange({ ...draft, summary: e.target.value })}
        rows={2}
        className={`${FIELD} w-full field-sizing-content md:-mx-3 md:w-[calc(100%+24px)] resize-none px-3 py-2 font-display text-[24px] leading-[1.3] tracking-[-0.02em] max-md:text-[20px]`}
      />
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[1fr_1fr_32px] gap-x-2 max-md:grid-cols-[1fr_1fr_28px] max-md:gap-x-1.5">
          <span className={EYEBROW}>Say</span>
          <span className={EYEBROW}>Not</span>
        </div>
        {draft.words.map((w, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_32px] items-center gap-x-2 max-md:grid-cols-[1fr_1fr_28px] max-md:gap-x-1.5"
          >
            <input
              aria-label={`Say ${i + 1}`}
              value={w.use}
              spellCheck={false}
              onChange={(e) => word(i, 'use', e.target.value)}
              className={`${FIELD} px-2.5 py-2 text-[14.5px] max-md:px-2`}
            />
            <input
              aria-label={`Not ${i + 1}`}
              value={w.avoid}
              spellCheck={false}
              onChange={(e) => word(i, 'avoid', e.target.value)}
              className={`${FIELD} px-2.5 py-2 text-[14.5px] max-md:px-2 text-ink-3`}
            />
            <RemoveButton
              label={`Remove ${w.use || 'pair'}`}
              onClick={() => onChange({ ...draft, words: draft.words.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <AddButton
          onClick={() => onChange({ ...draft, words: [...draft.words, { use: '', avoid: '' }] })}
        >
          Add a pair
        </AddButton>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={EYEBROW}>Sounds like</span>
        {draft.examples.map((l, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea
              aria-label={`Line ${i + 1}`}
              value={l}
              rows={1}
              onChange={(e) => line(i, e.target.value)}
              className={`${FIELD} flex-1 field-sizing-content resize-none px-2.5 py-2 text-[15px] text-ink-2`}
            />
            <RemoveButton
              label={`Remove line ${i + 1}`}
              onClick={() =>
                onChange({ ...draft, examples: draft.examples.filter((_, j) => j !== i) })
              }
            />
          </div>
        ))}
        <AddButton onClick={() => onChange({ ...draft, examples: [...draft.examples, ''] })}>
          Add a line
        </AddButton>
      </div>
    </>
  )
}

/** The logo: Replace takes a new file at once, since there is nothing to type. */
function LogoSection() {
  const { brand } = useBrand()
  const logo = useBrandKit(brand.id).logo
  const input = React.useRef<HTMLInputElement>(null)

  return (
    <Section
      label="Logo"
      action={
        <>
          <button type="button" onClick={() => input.current?.click()} className={`${QUIET} -mr-3`}>
            Replace
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            aria-label="Upload a new logo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                const src = URL.createObjectURL(file)
                editKit(brand.id, (k) => {
                  // The old upload has no other reader once it is replaced.
                  if (k.logo.src.startsWith('blob:')) URL.revokeObjectURL(k.logo.src)
                  return { ...k, logo: { src, name: file.name } }
                })
              }
              e.target.value = ''
            }}
          />
        </>
      }
    >
      <div className="flex items-center gap-5">
        <span className="flex size-[120px] shrink-0 items-center justify-center rounded-[18px] bg-surface">
          {/* A new logo settles in, so the replace reads as done; the brand's own does not. */}
          <span
            key={logo.src}
            className={`relative size-[88px] overflow-hidden rounded-full ${logo.name ? 'bb-pop' : ''}`}
          >
            <BrandLogo
              brandId={brand.id}
              alt={`${brand.name} logo`}
              sizes="176px"
              className="object-cover"
            />
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[14.5px] font-medium">Mark</span>
          <span className="truncate text-[12.5px] text-ink-4">
            {logo.name ? `Updated today · ${logo.name}` : 'PNG · 192 × 192'}
          </span>
          <a
            href={logo.src}
            download={logo.name ?? `${brand.id}-logo.png`}
            className="mt-1 self-start text-[12.5px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            Download
          </a>
        </span>
      </div>
    </Section>
  )
}

/**
 * The team's documents about the brand, each with a plain title AI reads to know what it is. An
 * upload opens its title for editing at once; a new version keeps the title. Client state only.
 */
function Files() {
  const { brand } = useBrand()
  const files = useBrandFiles(brand.id)
  const [editing, setEditing] = React.useState<string | null>(null)
  const upload = React.useRef<HTMLInputElement>(null)
  const replace = React.useRef<HTMLInputElement>(null)
  const replacing = React.useRef<string | null>(null)

  function onUpload(list: FileList | null) {
    const file = list?.[0]
    if (!file) return
    const id = newFileId(brand.id)
    editFiles(brand.id, (f) => uploaded(f, file.name, id))
    setEditing(id)
  }

  function onReplace(list: FileList | null) {
    const file = list?.[0]
    const id = replacing.current
    if (!file || !id) return
    editFiles(brand.id, (f) => replaced(f, id, file.name))
  }

  return (
    <section aria-label="Files" className="flex flex-col gap-4 border-t border-line py-9">
      <div className="flex items-center justify-between">
        <h2 className={EYEBROW}>Files</h2>
        <button
          type="button"
          onClick={() => upload.current?.click()}
          className="bb-press flex h-8 items-center rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-page hover:opacity-85"
        >
          Upload
        </button>
        <input
          ref={upload}
          type="file"
          hidden
          aria-label="Upload a file"
          onChange={(e) => {
            onUpload(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={replace}
          type="file"
          hidden
          aria-label="Upload a new version"
          onChange={(e) => {
            onReplace(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {files.length === 0 ? (
        <p className="py-6 text-[13.5px] text-ink-4">
          No files yet. Upload the brand book, a deck or the tone of voice.
        </p>
      ) : (
        <ul className="flex flex-col">
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              editing={editing === f.id}
              onEdit={() => setEditing(f.id)}
              onRename={(title) => {
                editFiles(brand.id, (list) => renamed(list, f.id, title))
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
              onReplace={() => {
                replacing.current = f.id
                replace.current?.click()
              }}
              onDelete={() => editFiles(brand.id, (list) => removed(list, f.id))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function FileRow({
  file,
  editing,
  onEdit,
  onRename,
  onCancel,
  onReplace,
  onDelete,
}: {
  file: BrandFile
  editing: boolean
  onEdit: () => void
  onRename: (title: string) => void
  onCancel: () => void
  onReplace: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-center gap-3.5 border-t border-line py-3 first:border-t-0">
      <FileIcon file={file} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <TitleInput title={file.title} onDone={onRename} onCancel={onCancel} />
        ) : (
          <span className="truncate text-[14.5px] font-medium">{file.title}</span>
        )}
        <span className="truncate text-[12px] text-ink-4">
          {editing
            ? 'A plain title tells AI what this file is.'
            : `${file.updated === 'Today' ? 'Updated today' : `Updated ${file.updated}`} · ${file.name}`}
        </span>
      </span>
      {!editing && (
        <RowMenu title={file.title} onRename={onEdit} onReplace={onReplace} onDelete={onDelete} />
      )}
    </li>
  )
}

function TitleInput({
  title,
  onDone,
  onCancel,
}: {
  title: string
  onDone: (title: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = React.useState(title)
  const input = React.useRef<HTMLInputElement>(null)
  // The title opens on a tap (Rename, or an upload), so the cursor goes straight into it.
  React.useEffect(() => input.current?.focus(), [])
  return (
    <input
      ref={input}
      value={value}
      aria-label="File title"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value)
        else if (e.key === 'Escape') onCancel()
      }}
      className="-my-1 -ml-2 rounded-[8px] bg-surface px-2 py-1 text-[14.5px] font-medium outline-none"
    />
  )
}

/** Rename, a new version, or delete: kept behind one button, since nobody does them daily. */
function RowMenu({
  title,
  onRename,
  onReplace,
  onDelete,
}: {
  title: string
  onRename: () => void
  onReplace: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = (label: string, act: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false)
        act()
      }}
      className={`rounded-[8px] px-2.5 py-[7px] text-left text-[13.5px] transition-colors hover:bg-surface-2 ${danger ? 'text-fail-ink' : 'text-ink'}`}
    >
      {label}
    </button>
  )

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${title}`}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor">
          <circle cx="2.5" cy="7" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="11.5" cy="7" r="1.3" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`${title} actions`}
          className="bb-menu absolute top-10 right-0 z-30 flex w-[180px] origin-top-right flex-col rounded-[12px] bg-page p-1.5 shadow-pop"
        >
          {item('Rename', onRename)}
          {item('Upload new version', onReplace)}
          {item('Delete', onDelete, true)}
        </div>
      )}
    </div>
  )
}
