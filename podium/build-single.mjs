/**
 * Package PODIUM as one self-contained HTML file.
 *
 * The published version is five files — the page, the app, two Three.js
 * modules and the generated room environment. That is the right shape to
 * serve, and the wrong shape to hand to someone: download only the page and it
 * opens blank, because it imports the other four.
 *
 * So this bundles the module graph into a single classic script and inlines it
 * along with the stylesheet. The result has no imports, no fetches and no
 * network: it runs from a double-click over `file://`, which an ES module build
 * cannot do at all (module scripts are blocked by CORS on that protocol).
 *
 *   node build-single.mjs        # → podium-standalone.html
 */

import { build } from 'esbuild'
import { readFile, writeFile, stat } from 'node:fs/promises'

const result = await build({
  entryPoints: ['app.js'],
  bundle: true,
  // Classic script, not a module: that is what makes file:// work.
  format: 'iife',
  target: 'es2022',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
})

const code = result.outputFiles[0].text
let html = await readFile('index.html', 'utf8')

// Swap the module tag for the bundle itself.
const tag = '<script type="module" src="./app.js"></script>'
if (!html.includes(tag)) throw new Error('module script tag not found in index.html')
html = html.replace(tag, `<script>\n${code}\n</script>`)

// A marker so it is obvious which build someone is looking at.
html = html.replace(
  '<title>Podium Control</title>',
  `<title>Podium Control</title>\n<!-- Single-file build, ${new Date().toISOString().slice(0, 10)}. No external files, no network. -->`,
)

await writeFile('podium-standalone.html', html)
const { size } = await stat('podium-standalone.html')
console.log(`podium-standalone.html  ${Math.round(size / 1024)} KB  (one file, runs from file://)`)
