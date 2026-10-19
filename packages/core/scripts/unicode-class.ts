/** The code point ranges a JavaScript `\p{…}` class matches, as a Postgres bracket expression. */
export function bracket(pattern: RegExp, extra = ''): string {
  const ranges: [number, number][] = []
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue
    if (!pattern.test(String.fromCodePoint(cp))) continue
    const last = ranges[ranges.length - 1]
    if (last && last[1] === cp - 1) last[1] = cp
    else ranges.push([cp, cp])
  }
  const esc = (cp: number) =>
    cp <= 0xffff
      ? `\\u${cp.toString(16).padStart(4, '0')}`
      : `\\U${cp.toString(16).padStart(8, '0')}`
  return `[${extra}${ranges.map(([a, b]) => (a === b ? esc(a) : `${esc(a)}-${esc(b)}`)).join('')}]`
}
