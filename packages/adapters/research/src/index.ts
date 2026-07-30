// Research adapter — the finder port and its two impls.
//
// The fifth adapter, following auth / storage / realtime / llm. It is the only
// one that spends money, which is why `none` is the default and why 3A paid for
// one real run before any of this was written: the parser in `perplexity.ts` is
// written against a captured body, not against documentation.
//
// Shipped impls (selected by `RESEARCH_PROVIDER`):
//   - none        (NoopResearchProvider — the default; refuses, loudly)
//   - perplexity  (async Sonar; `sonar-deep-research` by default)

export * from './port'
export * from './prompt'
export * from './perplexity'
export * from './noop'
export * from './factory'
