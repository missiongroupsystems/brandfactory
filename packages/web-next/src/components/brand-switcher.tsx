'use client'

import Link from 'next/link'
import * as React from 'react'

import type { Brand } from '@/data/brands'
import { BrandLogo } from '@/features/brand/brand-logo'
import { NewBrandForm } from '@/features/brand/new-brand-form'
import { useConnections } from '@/features/connections/connections-store'
import { useBrand } from '@/features/schedule/posts-store'

import { CheckIcon, ChevronIcon, PlusIcon } from './icons'

function BrandMark({ brand, size }: { brand: Brand; size: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={`relative shrink-0 overflow-hidden rounded-full ${size === 'md' ? 'size-7' : 'size-6'}`}
      style={{ background: `var(${brand.colour})` }}
    >
      <BrandLogo brandId={brand.id} sizes="56px" className="object-cover" />
    </span>
  )
}

/** The header pill: shows the current brand and opens a menu to switch to another. */
export function BrandSwitcher() {
  const { brand, brands, setBrandId, companies, addBrand } = useBrand()
  const attention = Object.values(useConnections(brand.id)).includes('attention')
  const [open, setOpen] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  // Only an owner or an admin of a company adds a brand; the item takes one place in the menu.
  const canAdd = companies.length > 0
  const links = brands.length + (canAdd ? 1 : 0)
  const root = React.useRef<HTMLDivElement>(null)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const items = React.useRef<Array<HTMLElement | null>>([])

  const close = React.useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }, [])

  React.useEffect(() => {
    if (!open) return
    // Focus the current brand, so arrows move from where the user is.
    items.current[brands.findIndex((b) => b.id === brand.id)]?.focus()
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) close(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
    // A brand change always closes the menu first, so it never re-runs this while open.
  }, [open, close, brands, brand.id])

  function onMenuKey(e: React.KeyboardEvent) {
    const list = items.current.filter((el): el is HTMLElement => el !== null)
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => list[(i + list.length) % list.length]?.focus()
    if (e.key === 'Escape') close(true)
    else if (e.key === 'Tab') close(false)
    else if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(list.length - 1)
    else return
    if (e.key !== 'Tab') e.preventDefault()
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Brand: ${brand.name}. Switch brand`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={`flex h-9 items-center gap-2.5 rounded-[10px] whitespace-nowrap pr-3 pl-1 text-sm font-medium transition-colors hover:bg-paper ${open ? 'bg-paper' : 'bg-surface'}`}
      >
        <BrandMark brand={brand} size="md" />
        <span>{brand.name}</span>
        <span className="-ml-0.5 text-ink-4">
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Switch brand"
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="bb-menu absolute top-11 right-0 z-30 flex w-[232px] origin-top-right flex-col rounded-[12px] bg-page p-1.5 shadow-pop"
        >
          {brands.map((b, i) => {
            const current = b.id === brand.id
            return (
              <button
                key={b.id}
                ref={(el) => {
                  items.current[i] = el
                }}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                tabIndex={-1}
                onClick={() => {
                  close(true)
                  if (!current) setBrandId(b.id)
                }}
                className="flex items-center gap-2.5 rounded-[8px] px-2 py-[7px] text-left text-[13.5px] text-ink transition-colors outline-none hover:bg-surface-2 focus-visible:bg-surface"
              >
                <BrandMark brand={b} size="sm" />
                <span className="flex-1 truncate">{b.name}</span>
                <span
                  className={`text-ink transition-opacity ${current ? 'opacity-100' : 'opacity-0'}`}
                >
                  <CheckIcon size={13} />
                </span>
              </button>
            )
          })}
          {canAdd && (
            <button
              ref={(el) => {
                items.current[brands.length] = el
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false)
                setAdding(true)
              }}
              className="flex items-center gap-2.5 rounded-[8px] px-2 py-[7px] text-left text-[13.5px] text-ink-3 transition-colors outline-none hover:bg-surface-2 hover:text-ink focus-visible:bg-surface"
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                <PlusIcon size={13} />
              </span>
              Add brand
            </button>
          )}
          <span aria-hidden="true" className="mx-2 my-1.5 h-px bg-line" />
          {/* The current brand's voice, colours and files: not a daily page, so it lives here. */}
          <Link
            ref={(el) => {
              items.current[links] = el
            }}
            href="/brand"
            role="menuitem"
            tabIndex={-1}
            onClick={() => close(false)}
            className="flex items-center justify-between rounded-[8px] px-2.5 py-[7px] text-[13.5px] text-ink transition-colors outline-none hover:bg-surface-2 focus-visible:bg-surface"
          >
            Brand kit
          </Link>
          {/* What the brand has linked; a dot when something needs signing in again. */}
          <Link
            ref={(el) => {
              items.current[links + 1] = el
            }}
            href="/brand/connections"
            role="menuitem"
            tabIndex={-1}
            onClick={() => close(false)}
            className="flex items-center justify-between rounded-[8px] px-2.5 py-[7px] text-[13.5px] text-ink transition-colors outline-none hover:bg-surface-2 focus-visible:bg-surface"
          >
            Connections
            {attention && (
              <span aria-label="Needs attention" className="size-1.5 rounded-full bg-fail" />
            )}
          </Link>
        </div>
      )}
      {adding && (
        <NewBrandForm companies={companies} onAdd={addBrand} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}
