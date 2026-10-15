/**
 * Renders a markdown document to an A4 PDF.
 *
 * Exists because the POPIA pack is going to a lawyer, and a .md file is a
 * programmer's format. A PDF can be emailed, printed, annotated and filed.
 *
 * The source is hard-wrapped at about 78 columns for readability in an editor,
 * so the first job is to put it back together: a naive line-per-paragraph
 * renderer produces ragged half-sentences and leaves bold markers that span a
 * line break printing literally as asterisks.
 *
 *   node tools/make-pdf.mjs POPIA-PACK.md "POPIA review pack"
 */
import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

const [src, title = 'Document', footnote = 'not legal advice'] = process.argv.slice(2)
const raw = await readFile(src, 'utf8')

// ── unwrap ─────────────────────────────────────────────────────────────────
// One logical block per line, so every inline marker is closed on the line it
// opened on.

const isHeading = (l) => /^#{1,6}\s/.test(l)
const isRule = (l) => l.trim() === '---'
const isTable = (l) => l.trim().startsWith('|')
const isQuote = (l) => l.trim().startsWith('>')
const isBullet = (l) => /^\s*[-*]\s/.test(l)
const isNumber = (l) => /^\s*\d+\.\s/.test(l)
// A whole line that is nothing but a bold run is a lead-in, not the first
// line of the paragraph under it.
const isLeadIn = (l) => /^\*\*[^*]+\*\*$/.test(l.trim())
const starts = (l) => isHeading(l) || isRule(l) || isTable(l) || isQuote(l) || isBullet(l) || isNumber(l) || isLeadIn(l)

function unwrap(text) {
  const out = []
  let buf = null
  const flush = () => { if (buf !== null) { out.push(buf); buf = null } }

  for (const line of text.split('\n')) {
    if (!line.trim()) { flush(); out.push(''); continue }
    if (starts(line)) {
      flush()
      buf = line.trim()
      continue
    }
    // A continuation of whatever came before.
    if (buf === null) buf = line.trim()
    else buf += ' ' + line.trim()
  }
  flush()
  return out
}

// ── render ─────────────────────────────────────────────────────────────────

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*]+)\*/g, '$1<em>$2</em>')

function blocks(lines) {
  const out = []
  let list = null
  let quote = []
  let i = 0

  const flushList = () => {
    if (!list) return
    out.push(`<${list.tag}>${list.items.join('')}</${list.close ?? list.tag}>`)
    list = null
  }
  const flushQuote = () => {
    if (!quote.length) return
    out.push(`<blockquote>${blocks(unwrap(quote.join('\n')))}</blockquote>`)
    quote = []
  }

  while (i < lines.length) {
    const l = lines[i]

    if (isQuote(l)) { flushList(); quote.push(l.replace(/^>\s?/, '')); i++; continue }
    flushQuote()

    if (isTable(l) && lines[i + 1] && /^\|[-\s|:]+\|?$/.test(lines[i + 1].trim())) {
      flushList()
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cells(l)
      i += 2
      const body = []
      while (i < lines.length && isTable(lines[i])) { body.push(cells(lines[i])); i++ }
      const hasHead = head.some((c) => c !== '')
      out.push(
        `<table>${hasHead ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : ''}` +
          `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      )
      continue
    }

    if (isBullet(l)) {
      const text = l.replace(/^\s*[-*]\s/, '')
      // A run-sheet is printed and ticked with a pen, so "- [ ]" has to come
      // out as something you can put a mark in, not as two literal brackets.
      const task = /^\[([ xX])\]\s*/.exec(text)
      const tag = task ? 'ul class="tasks"' : 'ul'
      if (!list || list.tag !== tag) { flushList(); list = { tag, close: 'ul', items: [] } }
      list.items.push(
        task
          ? `<li><span class="box">${task[1] === ' ' ? '' : '✓'}</span>${inline(text.slice(task[0].length))}</li>`
          : `<li>${inline(text)}</li>`,
      )
      i++
      continue
    }
    if (isNumber(l)) {
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', close: 'ol', items: [] } }
      list.items.push(`<li>${inline(l.replace(/^\s*\d+\.\s/, ''))}</li>`)
      i++
      continue
    }
    flushList()

    if (isRule(l)) out.push('<hr/>')
    else if (/^####\s/.test(l)) out.push(`<h5>${inline(l.slice(5))}</h5>`)
    else if (/^###\s/.test(l)) out.push(`<h3>${inline(l.slice(4))}</h3>`)
    else if (/^##\s/.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`)
    else if (/^#\s/.test(l)) out.push(`<h1>${inline(l.slice(2))}</h1>`)
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`)
    i++
  }
  flushList()
  flushQuote()
  return out.join('\n')
}

const body = blocks(unwrap(raw))

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page { size: A4; margin: 20mm 18mm; }
  body { font: 10.5pt/1.55 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #15191f; }
  h1 { font-size: 23pt; margin: 0 0 6pt; letter-spacing: -0.5pt; line-height: 1.15; }
  h2 { font-size: 14pt; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 1.2pt solid #15191f; page-break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 15pt 0 5pt; page-break-after: avoid; }
  h5 { font-size: 10pt; margin: 9pt 0 3pt; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 9pt; padding-left: 17pt; }
  li { margin-bottom: 4pt; }
  ol > li { padding-left: 2pt; }
  hr { border: 0; border-top: 0.6pt solid #c8ced6; margin: 15pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 2pt 0 11pt; font-size: 9.5pt; page-break-inside: avoid; }
  th { text-align: left; border-bottom: 1pt solid #15191f; padding: 4pt 8pt 4pt 0; vertical-align: top; }
  td { border-bottom: 0.5pt solid #d8dde3; padding: 6pt 8pt 6pt 0; vertical-align: top; }
  td:first-child { font-weight: 650; width: 27%; }
  blockquote { margin: 0 0 11pt; padding: 10pt 14pt 3pt; background: #f4f6f8; border-left: 2.5pt solid #9aa7b8; }
  blockquote p { margin: 0 0 6pt; font-size: 10pt; }
  blockquote h3 { margin: 10pt 0 4pt; font-size: 10pt; }
  blockquote ul { margin-bottom: 6pt; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9pt; background: #eef1f4; padding: 1pt 3pt; border-radius: 2pt; }
  strong { font-weight: 680; }
  ul.tasks { list-style: none; padding-left: 2pt; }
  ul.tasks li { margin-bottom: 7pt; padding-left: 20pt; text-indent: -20pt; }
  .box {
    display: inline-block; width: 10pt; height: 10pt; margin-right: 8pt;
    border: 0.9pt solid #6b7684; border-radius: 1.5pt; vertical-align: -1pt;
    text-indent: 0; text-align: center; line-height: 10pt; font-size: 8pt;
  }
</style></head><body>${body}</body></html>`

await writeFile('/tmp/pack.html', html)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] })
const page = await b.newPage()
await page.goto('file:///tmp/pack.html', { waitUntil: 'load' })
const outFile = src.replace(/\.md$/, '.pdf')
await page.pdf({
  path: outFile,
  format: 'A4',
  printBackground: true,
  margin: { top: '20mm', bottom: '18mm', left: '18mm', right: '18mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font:8pt Helvetica,Arial;color:#8a939f;padding:0 18mm;display:flex;justify-content:space-between"><span>${esc(title)}${footnote ? ' · ' + esc(footnote) : ''}</span><span class="pageNumber"></span></div>`,
})
await b.close()
console.log(outFile)
