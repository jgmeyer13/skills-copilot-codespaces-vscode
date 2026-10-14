/**
 * Source selection.
 *
 * One environment variable decides where the app's data comes from. Nothing else
 * in the codebase branches on it — that is the whole point of the `DataSource`
 * interface, and it is what makes "swap in a real backend later" a configuration
 * change rather than a rewrite.
 *
 *   VITE_DATA_SOURCE=simulated   run the engine in this tab (default)
 *   VITE_DATA_SOURCE=remote      connect to VITE_REMOTE_URL over a WebSocket
 */

import { SimulatedSource } from './SimulatedSource.ts'
import { RemoteSource } from './RemoteSource.ts'
import { parseSeed } from '../sim/rng.ts'
import type { DataSource } from './DataSource.ts'

export const DEFAULT_SEED = 20_261_014

export interface SourceConfig {
  mode: 'simulated' | 'remote'
  seed: number
  remoteUrl: string
}

/**
 * Resolve configuration from the environment, with URL query overrides so a
 * screenshot or a bug report can pin an exact world: `?seed=4242&source=remote`.
 */
export function resolveConfig(search = typeof location !== 'undefined' ? location.search : ''): SourceConfig {
  const params = new URLSearchParams(search)

  const envMode = (import.meta.env?.VITE_DATA_SOURCE ?? 'simulated').toString().trim().toLowerCase()
  const queryMode = params.get('source')?.trim().toLowerCase()
  const mode = (queryMode ?? envMode) === 'remote' ? 'remote' : 'simulated'

  const querySeed = params.get('seed')
  const envSeed = import.meta.env?.VITE_SEED
  const seed = querySeed ? parseSeed(querySeed) : envSeed ? parseSeed(String(envSeed)) : DEFAULT_SEED

  const remoteUrl =
    params.get('remote') ??
    (import.meta.env?.VITE_REMOTE_URL as string | undefined) ??
    defaultRemoteUrl()

  return { mode, seed, remoteUrl }
}

function defaultRemoteUrl(): string {
  if (typeof location === 'undefined') return 'ws://127.0.0.1:8787'
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.hostname}:8787`
}

export function createDataSource(config: SourceConfig): DataSource {
  if (config.mode === 'remote') {
    return new RemoteSource({ url: config.remoteUrl })
  }
  return new SimulatedSource({ seed: config.seed })
}

export { SimulatedSource, RemoteSource }
export type { DataSource, SourceEvent, ConnectionStatus } from './DataSource.ts'
