import { chromium } from '@playwright/test'

const PAGE = `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="640" height="400"></canvas>
<script>
const c = document.getElementById('c')
const gl = c.getContext('webgl2') || c.getContext('webgl')
window.__gl = { ok: !!gl }
if (gl) {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  window.__gl.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  window.__gl.version  = gl.getParameter(gl.VERSION)
  // draw a gradient-ish pattern so the screenshot is provably non-blank
  gl.clearColor(0.02, 0.07, 0.10, 1); gl.clear(gl.COLOR_BUFFER_BIT)
  gl.enable(gl.SCISSOR_TEST)
  for (let i=0;i<16;i++){
    gl.scissor(i*40, 0, 40, 400)
    gl.clearColor(i/16, 0.9-(i/20), 0.85, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
  gl.disable(gl.SCISSOR_TEST)
  const px = new Uint8Array(4); gl.readPixels(320,200,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px)
  window.__gl.pixel = Array.from(px)
}
</script></body></html>`

const args = ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--disable-gpu-sandbox','--no-sandbox','--disable-dev-shm-usage']

for (const exe of [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
]) {
  try {
    const b = await chromium.launch({ executablePath: exe, args })
    const p = await b.newPage({ viewport: { width: 640, height: 400 } })
    await p.setContent(PAGE)
    await p.waitForTimeout(400)
    const info = await p.evaluate(() => window.__gl)
    const shot = await p.screenshot()
    // crude non-blank check: count distinct bytes
    const uniq = new Set(shot.slice(0, 200000)).size
    console.log(exe.split('/').slice(-2).join('/'), '=>', JSON.stringify(info), 'pngBytes=', shot.length, 'uniqueBytes=', uniq)
    await b.close()
  } catch (e) {
    console.log(exe, 'FAILED:', e.message.split('\n')[0])
  }
}
