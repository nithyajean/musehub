import { runGitBuffer } from './git-cli.js';

/**
 * Smart-HTTP transport. This shells out to `git http-backend`, git's own CGI, so
 * clone, fetch and push behave exactly like any other git remote (protocol v2,
 * side-band, report-status, everything the installed binary supports). We do not
 * hand-roll pkt-line framing (R4).
 *
 * AUTH IS NOT DONE HERE. The api package authenticates and authorizes the caller
 * BEFORE calling this handler (HTTP Basic or the MuseHub token, then the
 * agent-only gate and per-repo visibility). Reaching this function means the
 * request is already allowed to touch the repo. The pre-receive hook is the
 * second, git-side gate on the push path.
 */
export interface SmartHttpRequest {
  /** REQUEST_METHOD, e.g. GET or POST. */
  method: string;
  /** Path plus optional query, e.g. /owner/name.git/info/refs?service=git-upload-pack */
  url: string;
  /** Incoming request headers (case-insensitive lookup). */
  headers: Record<string, string | string[] | undefined>;
  /** Request body (upload-pack/receive-pack payload). Buffered in this build. */
  body?: Buffer | Uint8Array;
  /** Authenticated agent handle, forwarded to the hooks as REMOTE_USER. */
  remoteUser?: string;
  /** Client address, forwarded as REMOTE_ADDR. */
  remoteAddr?: string;
}

export interface SmartHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export type SmartHttpHandler = (req: SmartHttpRequest) => Promise<SmartHttpResponse>;

export interface GitHttpBackendOptions {
  /** Repo store root; repos live at <root>/<owner>/<name>.git */
  root: string;
  gitBin?: string;
  /** Serve every repo without a per-repo export marker. Default true. */
  exportAll?: boolean;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const v = headers[key];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function bodyBuffer(body: Buffer | Uint8Array | undefined): Buffer {
  if (body === undefined) return Buffer.alloc(0);
  return body instanceof Buffer ? body : Buffer.from(body);
}

/** Split a CGI response (headers, blank line, body) into a real HTTP response. */
function parseCgi(out: Buffer): SmartHttpResponse {
  let sep = out.indexOf('\r\n\r\n');
  let sepLen = 4;
  const lf = out.indexOf('\n\n');
  if (sep === -1 || (lf !== -1 && lf < sep)) {
    sep = lf;
    sepLen = 2;
  }
  if (sep === -1) {
    // No header block; treat the whole thing as the body.
    return { status: 200, headers: {}, body: out };
  }
  const headerText = out.subarray(0, sep).toString('utf8');
  const body = out.subarray(sep + sepLen);
  const headers: Record<string, string> = {};
  let status = 200;
  for (const line of headerText.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key.toLowerCase() === 'status') {
      const code = Number.parseInt(value, 10);
      if (Number.isFinite(code)) status = code;
    } else {
      headers[key] = value;
    }
  }
  return { status, headers, body };
}

/**
 * Build a smart-HTTP handler over the repo store. Returns a function the api
 * layer calls once auth has passed.
 */
export function gitHttpBackend(opts: GitHttpBackendOptions): SmartHttpHandler {
  const gitBin = opts.gitBin ?? 'git';
  const exportAll = opts.exportAll ?? true;

  return async (req: SmartHttpRequest): Promise<SmartHttpResponse> => {
    const qIndex = req.url.indexOf('?');
    const rawPath = qIndex === -1 ? req.url : req.url.slice(0, qIndex);
    const query = qIndex === -1 ? '' : req.url.slice(qIndex + 1);
    let pathInfo: string;
    try {
      pathInfo = decodeURIComponent(rawPath);
    } catch {
      pathInfo = rawPath;
    }
    const body = bodyBuffer(req.body);

    const env: Record<string, string> = {
      GIT_PROJECT_ROOT: opts.root,
      PATH_INFO: pathInfo,
      REQUEST_METHOD: req.method,
      QUERY_STRING: query,
      CONTENT_LENGTH: String(body.length),
    };
    if (exportAll) env.GIT_HTTP_EXPORT_ALL = '1';
    const contentType = headerValue(req.headers, 'content-type');
    if (contentType !== undefined) env.CONTENT_TYPE = contentType;
    const gitProtocol = headerValue(req.headers, 'git-protocol');
    if (gitProtocol !== undefined) env.GIT_PROTOCOL = gitProtocol;
    if (req.remoteUser !== undefined) env.REMOTE_USER = req.remoteUser;
    if (req.remoteAddr !== undefined) env.REMOTE_ADDR = req.remoteAddr;

    const res = await runGitBuffer(gitBin, ['http-backend'], { env, input: body });
    if (res.exitCode !== 0 && res.stdout.length === 0) {
      return {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: Buffer.from(`git http-backend failed: ${res.stderr}`, 'utf8'),
      };
    }
    return parseCgi(res.stdout);
  };
}
