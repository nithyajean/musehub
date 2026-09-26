import { randomBytes } from 'node:crypto';
// Configuration for the composition root. Every field has a safe default so
// createServer({}) boots a self-contained in-memory forge, which is what the demo
// and the e2e want. main.ts fills these from the environment.
import { existsSync } from 'node:fs';

export interface ServerConfig {
  /** Database url. A postgres:// url opens Postgres, anything else opens SQLite. Default :memory:. */
  dbUrl?: string;
  /** Root directory for bare git repositories. Default a temp dir under the data dir. */
  gitRoot?: string;
  /** Base directory the SQLite file and git root default under, when not set explicitly. */
  dataDir?: string;
  /** Bind host. Default 127.0.0.1. */
  host?: string;
  /** Bind port. 0 or undefined picks an ephemeral port. */
  port?: number;
  /** HMAC secret for agent tokens. A random one is generated when absent (tokens then die on restart). */
  tokenSecret?: string | Uint8Array;
  /** How long a minted agent token is valid, seconds. */
  tokenTtlSec?: number;
  /** did:key values admitted to the allowlist at boot. More can be admitted at runtime. */
  allowlist?: string[];
  /** Run CI in real Docker containers. Undefined auto-detects a local daemon. */
  ciDocker?: boolean;
  /** Write each run's result.json under this dir as well as the log store. Default off. */
  ciResultsDir?: string | null;
  /** git binary. Default "git". */
  gitBin?: string;
}

/** True when a local Docker daemon looks reachable. */
export function dockerAvailable(): boolean {
  try {
    if (process.env.DOCKER_HOST) {
      return true;
    }
    return existsSync('/var/run/docker.sock');
  } catch {
    return false;
  }
}

/** A resolved token secret: the configured one, or a fresh random 32 bytes. */
export function resolveTokenSecret(secret: string | Uint8Array | undefined): Uint8Array {
  if (typeof secret === 'string') {
    return new TextEncoder().encode(secret);
  }
  if (secret instanceof Uint8Array) {
    return secret;
  }
  return new Uint8Array(randomBytes(32));
}

/** Build a ServerConfig from environment variables for the main entrypoint. */
export function configFromEnv(): ServerConfig {
  const dataDir = process.env.MUSEHUB_DATA_DIR ?? `${process.cwd()}/.musehub-data`;
  return {
    dbUrl: process.env.MUSEHUB_DB_URL ?? process.env.DATABASE_URL ?? `${dataDir}/musehub.db`,
    gitRoot: process.env.MUSEHUB_GIT_ROOT ?? `${dataDir}/git`,
    dataDir,
    host: process.env.MUSEHUB_HOST ?? '127.0.0.1',
    port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 7700,
    tokenSecret: process.env.MUSEHUB_TOKEN_SECRET,
    allowlist: process.env.MUSEHUB_ALLOWLIST
      ? process.env.MUSEHUB_ALLOWLIST.split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : [],
    ciDocker: process.env.MUSEHUB_CI_DOCKER === '1',
  };
}
