'use client'

import * as React from 'react'

import { PlusIcon } from '@/components/icons'
import { useBrand } from '@/features/schedule/posts-store'

import { editKit, useBrandKit } from './brand-store'
import { ColourPicker } from './colour-picker'
import { type Colour, SavedWhisper, Section } from './kit-parts'
import { coloursEdited } from './model'
import { type Anchor, Popover, anchorOf } from './popover'

/**
 * The colours, edited where they sit: a tap on a swatch opens the picker by it,
 * the swatch follows each change, and closing the picker saves. Escape drops the change; Remove is at once.
 */
export function ColoursEditable() {
  const { brand } = useBrand()
  const colours = useBrandKit(brand.id).colours
  const [draft, setDraft] = React.useState<Colour[] | null>(null)
  const [open, setOpen] = React.useState<{ i: number; anchor: Anchor } | null>(null)
  const [savedAt, setSavedAt] = React.useState(0)
  const shown = draft ?? colours

  function close(save: boolean) {
    if (save && draft && JSON.stringify(draft) !== JSON.stringify(colours)) {
      editKit(brand.id, (k) => ({ ...k, colours: coloursEdited(draft) }))
      setSavedAt(Date.now())
    }
    setDraft(null)
    setOpen(null)
  }

  const current = open && draft?.[open.i]

  return (
    <Section label="Colours" action={<SavedWhisper at={savedAt} />}>
      <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
        {shown.map((c, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Edit ${c.name}, ${c.hex}`}
            aria-expanded={open?.i === i}
            onClick={(e) => {
              setDraft(shown)
              setOpen({ i, anchor: anchorOf(e.currentTarget) })
            }}
            className="group flex flex-col gap-2.5 rounded-[14px] text-left outline-offset-4"
          >
            <span
              className={`block h-[88px] w-full rounded-[14px] transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 ${open?.i === i ? 'shadow-[inset_0_0_0_1px_var(--line),0_0_0_2px_var(--page),0_0_0_4px_var(--ink)]' : 'shadow-[inset_0_0_0_1px_var(--line)]'}`}
              style={{ background: c.hex }}
            />
            <span className="flex flex-col">
              <span className="text-[13px] font-medium">{c.name}</span>
              <span className="font-mono text-[13px] text-ink-4 lowercase">{c.hex}</span>
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={(e) => {
          const next = [...shown, { name: 'New colour', hex: '#B9B2A8' }]
          setDraft(next)
          setOpen({ i: next.length - 1, anchor: anchorOf(e.currentTarget) })
        }}
        className="-mt-2 -ml-2 flex h-8 items-center gap-1.5 self-start rounded-full px-2 text-[13px] text-ink-4 transition-colors hover:text-ink-2"
      >
        <PlusIcon size={10} />
        Add colour
      </button>
      {open && current && (
        <Popover
          anchor={open.anchor}
          label={current.name || 'Colour'}
          height={440}
          plain
          onClose={() => close(true)}
          onCancel={() => close(false)}
        >
          <ColourPicker
            key={open.i}
            colour={current}
            onDone={() => close(true)}
            onChange={(c) => setDraft(draft.map((d, j) => (j === open.i ? c : d)))}
            onRemove={() => {
              const next = draft.filter((_, j) => j !== open.i)
              editKit(brand.id, (k) => ({ ...k, colours: coloursEdited(next) }))
              setSavedAt(Date.now())
              setDraft(null)
              setOpen(null)
            }}
          />
        </Popover>
      )}
    </Section>
  )
}
