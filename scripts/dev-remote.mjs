/**
 * Run the simulation server and the Vite dev server together in remote mode.
 * One command, so "server mode" needs no orchestration from the reader.
 */
import { spawn } from 'node:child_process'

const procs = []
const run = (name, cmd, args, env) => {
  const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[dev:remote] ${name} exited with ${code}`)
    shutdown()
  })
  procs.push(child)
  return child
}

const shutdown = () => {
  for (const p of procs) { try { p.kill('SIGTERM') } catch { /* already gone */ } }
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

run('server', 'npx', ['tsx', 'server/index.ts'], {})
// Give the engine a moment to warm up before the browser tries to connect.
setTimeout(() => {
  run('vite', 'npx', ['vite'], { VITE_DATA_SOURCE: 'remote', VITE_REMOTE_URL: 'ws://127.0.0.1:8787' })
}, 1200)
