import { serveCore } from './server'

// The core on its own, with no host routes (a host such as packages/connect adds its own).
await serveCore()
