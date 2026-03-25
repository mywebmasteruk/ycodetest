/**
 * Local Netlify CI diagnostics (session 87ea68).
 * Run from repo root: npm run debug:netlify-ci
 * Loads env from process only — never prints tokens or full URLs.
 */
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FALLBACK = join(__dirname, '../../.cursor/debug-87ea68.log');
const INGEST =
  'http://127.0.0.1:7316/ingest/18b4f045-0464-47b6-9592-b5de081cf694';
const SESSION = '87ea68';

function ndjsonLine(obj) {
  return JSON.stringify({
    sessionId: SESSION,
    timestamp: Date.now(),
    ...obj,
  });
}

async function send(obj) {
  const line = ndjsonLine(obj);
  try {
    const r = await fetch(INGEST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': SESSION,
      },
      body: line,
    });
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    try {
      mkdirSync(dirname(LOG_FALLBACK), { recursive: true });
      appendFileSync(LOG_FALLBACK, line + '\n', 'utf8');
    } catch {
      /* ignore */
    }
  }
}

const hook = process.env.NETLIFY_BUILD_HOOK_URL;
const token = process.env.NETLIFY_AUTH_TOKEN;
const siteA = process.env.NETLIFY_YCODE_SITE_ID;
const siteB = process.env.NETLIFY_SITE_ID;
const siteResolved = siteA || siteB || '';

// #region agent log
await send({
  location: 'debug-netlify-ci.mjs:env',
  message: 'env presence (booleans only)',
  hypothesisId: 'H1',
  data: {
    hookPresent: Boolean(hook),
    tokenPresent: Boolean(token),
    ycodeSiteIdPresent: Boolean(siteA),
    genericSiteIdPresent: Boolean(siteB),
    path: hook ? 'build_hook' : 'cli_trigger',
  },
});
// #endregion

if (hook) {
  // #region agent log
  let httpCode = 0;
  let err = '';
  try {
    const r = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    httpCode = r.status;
  } catch (e) {
    err = e instanceof Error ? e.name : 'fetch_error';
  }
  await send({
    location: 'debug-netlify-ci.mjs:hook_probe',
    message: 'build hook POST result',
    hypothesisId: 'H3',
    data: { httpCode, err: err || undefined },
  });
  // #endregion
  console.log(
    'Build hook probe: HTTP',
    httpCode || err || 'unknown',
    '(check debug log / ingest)',
  );
} else if (token && siteResolved) {
  // #region agent log
  await send({
    location: 'debug-netlify-ci.mjs:cli_path',
    message: 'would use netlify deploy --prod --trigger (not executed here)',
    hypothesisId: 'H4',
    data: {
      siteIdLength: siteResolved.length,
    },
  });
  // #endregion
  console.log(
    'CLI path: token + site id present; run deploy on CI or: npx netlify-cli deploy --prod --trigger',
  );
} else {
  // #region agent log
  await send({
    location: 'debug-netlify-ci.mjs:missing',
    message: 'missing secrets for both paths',
    hypothesisId: 'H2',
    data: {
      needHookOrTokenAndSite: true,
    },
  });
  // #endregion
  console.log(
    'Set NETLIFY_BUILD_HOOK_URL, or NETLIFY_AUTH_TOKEN + site id. On GitHub you can use repository Variables: NETLIFY_SITE_ID (or secrets).',
  );
  process.exitCode = 1;
}
