/**
 * Package the Vite build as a single self-contained HTML file.
 *
 * Claude Artifacts serve a page under a strict CSP: external scripts are limited
 * to a short CDN allowlist and all other fetches — including a sibling .js file
 * — are blocked. The page is also wrapped in its own document skeleton at
 * publish time, so the file must not carry <!doctype>, <html>, <head> or <body>.
 *
 * So: inline everything, strip the document wrapper, and emit just the title,
 * the viewport promise, the styles and the script.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DIST = join(here, '..', 'dist')
const OUT_DIR = join(here, '..', 'dist-artifact')
const OUT = join(OUT_DIR, 'index.html')

const TITLE = 'Kelvin Cold Chain'

function escapeForScript(code) {
  // A literal </script> inside the bundle would close the tag early.
  return code.replace(/<\/script>/gi, '<\\/script>')
}

const assets = await readdir(join(DIST, 'assets'))
const jsName = assets.find((f) => f.endsWith('.js'))
const cssName = assets.find((f) => f.endsWith('.css'))
if (!jsName) throw new Error('No JS bundle found in dist/assets')

const js = await readFile(join(DIST, 'assets', jsName), 'utf8')
const css = cssName ? await readFile(join(DIST, 'assets', cssName), 'utf8') : ''

const page = `<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* The publish skeleton pins color-scheme: light on :root and pads it by the
   phone's safe-area insets. This is a full-bleed instrument panel, so it takes
   the whole viewport and each fixed edge handles its own inset instead. */
:root { color-scheme: dark; padding: 0 !important; }
html, body { height: 100%; margin: 0; background: #06090d; overflow: hidden; }
#root { height: 100%; }
${css}
</style>
<div id="root"></div>
<script type="module">
${escapeForScript(js)}
</script>
`

await mkdir(OUT_DIR, { recursive: true })
await writeFile(OUT, page, 'utf8')

const kb = (Buffer.byteLength(page, 'utf8') / 1024).toFixed(0)
console.log(`dist-artifact/index.html  ${kb} KB  (limit 16384 KB)`)
if (Buffer.byteLength(page, 'utf8') > 16 * 1024 * 1024) {
  throw new Error('Artifact page exceeds the 16MB limit')
}
