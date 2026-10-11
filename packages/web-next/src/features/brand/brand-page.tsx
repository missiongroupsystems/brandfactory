'use client'

import * as React from 'react'

import { AppHeader } from '@/components/app-header'
import { CheckIcon, CloseIcon, PlusIcon, SparkIcon } from '@/components/icons'
import type { BrandFile, BrandKit, FileKind } from '@/data/brand-kit'
import { useBrand } from '@/features/schedule/posts-store'

import { BrandLogo } from './brand-logo'
import { editFiles, editKit, newFileId, useBrandFiles, useBrandKit } from './brand-store'
import { coloursEdited, hexOf, removed, renamed, replaced, uploaded, voiceEdited } from './model'

const EYEBROW = 'font-mono text-[10.5px] tracking-[0.08em] text-ink-4 uppercase'

const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  deck: 'Deck',
  doc: 'Doc',
  sheet: 'Sheet',
  image: 'Image',
}

/** Each kind's colour, as the apps that make them use it: a file is known by its tag at a glance. */
const KIND_HUE: Record<FileKind, string> = {
  pdf: '#E5484D',
  deck: '#F76B15',
  doc: '#3E63DD',
  sheet: '#30A46C',
  image: '#8E4EC6',
}

/** The extension as typed ("PDF", "DOCX"), or the kind when the name has none. */
const extOf = (file: BrandFile) =>
  /\.([a-z0-9]{2,4})$/i.exec(file.name)?.[1]?.toUpperCase() ?? KIND_LABEL[file.kind]

/**
 * A file as a desktop draws one: a sheet of paper with a folded corner and a few faint lines,
 * tagged with its extension in the colour of its kind.
 */
function FileIcon({ file }: { file: BrandFile }) {
  const ext = extOf(file)
  // The tag names the format, so a deck exported to PDF is tagged as a PDF.
  const hue = ext === 'PDF' ? KIND_HUE.pdf : KIND_HUE[file.kind]
  return (
    <span
      role="img"
      aria-label={KIND_LABEL[file.kind]}
      className="relative h-10 w-8 shrink-0 drop-shadow-[0_1px_1.5px_rgba(18,18,18,0.12)]"
    >
      <svg width="32" height="40" viewBox="0 0 32 40" fill="none" aria-hidden="true">
        <path
          d="M6 .75h14.25L29.25 9.75V36A3.25 3.25 0 0 1 26 39.25H6A3.25 3.25 0 0 1 2.75 36V4A3.25 3.25 0 0 1 6 .75Z"
          fill="var(--page)"
          stroke="var(--line-strong)"
          strokeWidth="0.75"
        />
        <path
          d="M20.25.75v6.5a2.5 2.5 0 0 0 2.5 2.5h6.5"
          fill="var(--surface)"
          stroke="var(--line-strong)"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
        <path
          d="M8 15h12M8 18.5h16M8 22h10"
          stroke="var(--line-strong)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute bottom-[5px] left-[2px] rounded-[3px] px-[3px] py-px font-mono text-[7px] leading-none font-semibold tracking-[0.02em] text-white"
        style={{ background: hue }}
      >
        {ext}
      </span>
    </span>
  )
}

type Voice = BrandKit['voice']
type Colour = BrandKit['colours'][number]

/**
 * The brand page: the one place for how the current brand looks and sounds. Nobody opens it
 * daily; a new hire reads it once, and AI drafts read it every time. Voice first, since that is
 * what AI uses most, then colours, the logo, and the team's files, each with a plain title.
 *
 * At rest it reads as a page, not a form. Each section has one quiet control at its top right:
 * Edit turns that section into fields and Done saves them, so a tap on a swatch still copies it.
 */
export function BrandPage() {
  const { brand } = useBrand()

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main
        key={brand.id}
        className="bb-swap mx-auto flex w-full max-w-[760px] flex-col px-4 pb-24"
      >
        <div className="flex flex-col gap-4 pt-6 pb-10 max-md:pt-2 max-md:pb-8">
          <span className={EYEBROW}>Brand kit</span>
          <h1 className="font-display text-[56px] leading-none tracking-[-0.035em] max-md:text-[34px]">
            {brand.name}
          </h1>
          <p className="max-w-[560px] text-[15px] text-ink-3">{brand.line}</p>
          <span className="flex items-center gap-2 text-[12.5px] text-ink-4">
            <SparkIcon size={10} />
            Used when AI drafts captions, hooks and replies.
          </span>
        </div>

        <VoiceSection />
        <ColoursSection />
        <LogoSection />
        <Files />
      </main>
    </div>
  )
}

function Section({
  label,
  action,
  onCancel,
  children,
}: {
  label: string
  action?: React.ReactNode
  /** Escape leaves the section's fields without saving them. */
  onCancel?: () => void
  children: React.ReactNode
}) {
  const root = React.useRef<HTMLElement>(null)
  // On the section, not the window, so Escape in one open section leaves the others open.
  React.useEffect(() => {
    const el = root.current
    if (!el || !onCancel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <section
      ref={root}
      aria-label={label}
      className="flex flex-col gap-6 border-t border-line py-9"
    >
      <div className="-my-1.5 flex items-center justify-between">
        <h2 className={EYEBROW}>{label}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const QUIET =
  'flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-ink-3 transition-colors hover:bg-surface hover:text-ink'

/** Edit at rest, Done while editing, and a short "Saved" after, in place of a toast. */
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
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
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

function VoiceView({ voice }: { voice: Voice }) {
  return (
    <>
      <p className="font-display text-[24px] leading-[1.3] tracking-[-0.02em] max-md:text-[20px]">
        {voice.summary}
      </p>
      {voice.words.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6">
          <span className={`${EYEBROW} pb-2`}>Say</span>
          <span className={`${EYEBROW} pb-2`}>Not</span>
          {voice.words.map((w, i) => (
            // Edits may repeat a word, so the place is the key.
            <React.Fragment key={i}>
              <span className="border-t border-line py-2.5 text-[14.5px]">{w.use}</span>
              <span className="border-t border-line py-2.5 text-[14.5px] text-ink-4 line-through decoration-ink-5">
                {w.avoid}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
      {voice.examples.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className={EYEBROW}>Sounds like</span>
          {voice.examples.map((line, i) => (
            <p key={i} className="border-l-2 border-line-strong pl-4 text-[15px] text-ink-2">
              {line}
            </p>
          ))}
        </div>
      )}
    </>
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
        className={`${FIELD} -mx-3 w-[calc(100%+24px)] field-sizing-content resize-none px-3 py-2 font-display text-[24px] leading-[1.3] tracking-[-0.02em] max-md:text-[20px]`}
      />
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[1fr_1fr_32px] gap-x-2">
          <span className={EYEBROW}>Say</span>
          <span className={EYEBROW}>Not</span>
        </div>
        {draft.words.map((w, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_32px] items-center gap-x-2">
            <input
              aria-label={`Say ${i + 1}`}
              value={w.use}
              onChange={(e) => word(i, 'use', e.target.value)}
              className={`${FIELD} px-2.5 py-2 text-[14.5px]`}
            />
            <input
              aria-label={`Not ${i + 1}`}
              value={w.avoid}
              onChange={(e) => word(i, 'avoid', e.target.value)}
              className={`${FIELD} px-2.5 py-2 text-[14.5px] text-ink-3`}
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

function ColoursSection() {
  const { brand } = useBrand()
  const colours = useBrandKit(brand.id).colours
  const [draft, setDraft] = React.useState<Colour[] | null>(null)

  return (
    <Section
      label="Colours"
      onCancel={() => setDraft(null)}
      action={
        <EditToggle
          label="colours"
          editing={draft !== null}
          onEdit={() => setDraft(colours)}
          onDone={() => {
            if (draft) editKit(brand.id, (k) => ({ ...k, colours: coloursEdited(draft) }))
            setDraft(null)
          }}
        />
      }
    >
      <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
        {draft ? (
          <>
            {draft.map((c, i) => (
              <SwatchFields
                key={i}
                colour={c}
                onChange={(next) =>
                  setDraft(draft.map((d, j) => (j === i ? { ...d, ...next } : d)))
                }
                onRemove={() => setDraft(draft.filter((_, j) => j !== i))}
              />
            ))}
            <button
              type="button"
              onClick={() => setDraft([...draft, { name: 'New colour', hex: '#B9B2A8' }])}
              className="flex h-[88px] items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-line-strong text-[12.5px] text-ink-3 transition-colors hover:bg-surface hover:text-ink"
            >
              <PlusIcon size={11} />
              Add colour
            </button>
          </>
        ) : (
          colours.map((c, i) => <Swatch key={i} name={c.name} hex={c.hex} />)
        )}
      </div>
    </Section>
  )
}

/**
 * One colour while the section is open. A tap on the swatch opens the system picker; the hex
 * field takes a pasted code, and only a valid one changes the colour.
 */
function SwatchFields({
  colour,
  onChange,
  onRemove,
}: {
  colour: Colour
  onChange: (c: Partial<Colour>) => void
  onRemove: () => void
}) {
  return (
    <div className="group flex min-w-0 flex-col gap-1.5">
      <span
        className="relative mb-1 block h-[88px] rounded-[14px] shadow-[inset_0_0_0_1px_var(--line)]"
        style={{ background: colour.hex }}
      >
        <input
          type="color"
          aria-label={`Pick ${colour.name}`}
          value={colour.hex.toLowerCase()}
          onChange={(e) => onChange({ hex: e.target.value.toUpperCase() })}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <span className="absolute top-1.5 right-1.5 rounded-full bg-page shadow-soft transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
          <RemoveButton label={`Remove ${colour.name}`} onClick={onRemove} />
        </span>
      </span>
      <input
        aria-label="Colour name"
        value={colour.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className={`${FIELD} px-2 py-1 text-[13.5px] font-medium`}
      />
      <HexInput hex={colour.hex} name={colour.name} onHex={(hex) => onChange({ hex })} />
    </div>
  )
}

function HexInput({ hex, name, onHex }: { hex: string; name: string; onHex: (h: string) => void }) {
  const [text, setText] = React.useState(hex)
  // The picker changes the hex from outside: follow it, unless the change came from this field.
  const [seen, setSeen] = React.useState(hex)
  if (hex !== seen) {
    setSeen(hex)
    if (hexOf(text) !== hex) setText(hex)
  }
  const valid = hexOf(text) !== null
  return (
    <input
      aria-label={`${name} hex`}
      aria-invalid={!valid}
      value={text}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => {
        setText(e.target.value)
        const h = hexOf(e.target.value)
        if (h) onHex(h)
      }}
      onBlur={() => setText(hex)}
      className={`${FIELD} px-2 py-1 font-mono text-[11.5px] uppercase ${valid ? 'text-ink-4' : 'text-fail-ink'}`}
    />
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

/** A colour to copy: a tap puts its hex on the clipboard, for Canva or a supplier. */
function Swatch({ name, hex }: { name: string; hex: string }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <button
      type="button"
      aria-label={`Copy ${name}, ${hex}`}
      onClick={() => {
        void navigator.clipboard?.writeText(hex)
        setCopied(true)
      }}
      className="group flex flex-col gap-2.5 text-left"
    >
      <span
        className="block h-[88px] w-full rounded-[14px] shadow-[inset_0_0_0_1px_var(--line)] transition-transform duration-200 group-hover:-translate-y-0.5"
        style={{ background: hex }}
      />
      <span className="flex flex-col">
        <span className="text-[13.5px] font-medium">{name}</span>
        <span className="font-mono text-[11.5px] text-ink-4">{copied ? 'Copied' : hex}</span>
      </span>
    </button>
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
