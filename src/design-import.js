import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_MAX_BYTES = 256 * 1024;
const ALLOWED_PROTOCOLS = new Set(['https:']);

export class DesignImportError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'DesignImportError';
    if (cause) this.cause = cause;
  }
}

export function validateDesignUrl(rawUrl, { allowedProtocols = ALLOWED_PROTOCOLS } = {}) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new DesignImportError('Design URL is required.');
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch (cause) {
    throw new DesignImportError(`Invalid URL: ${rawUrl}`, { cause });
  }
  if (!allowedProtocols.has(url.protocol)) {
    throw new DesignImportError(
      `URL protocol ${url.protocol} is not allowed. Allowed: ${[...allowedProtocols].join(', ')}`,
    );
  }
  return url;
}

export async function fetchDesignMarkdown(rawUrl, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = 15000,
    allowedProtocols,
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new DesignImportError('No fetch implementation available; Node.js >= 18 required.');
  }
  const url = validateDesignUrl(rawUrl, { allowedProtocols });

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'slides-grab/import-design (+https://github.com/NomaDamas/slides-grab)' },
    });
  } catch (cause) {
    clearTimeout(timeoutHandle);
    throw new DesignImportError(`Fetch failed for ${url}: ${cause.message}`, { cause });
  }
  clearTimeout(timeoutHandle);

  if (!response.ok) {
    throw new DesignImportError(`Fetch returned HTTP ${response.status} for ${url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const looksLikeText = contentType === '' ||
    contentType.includes('text/') ||
    contentType.includes('markdown') ||
    contentType.includes('application/octet-stream');
  if (!looksLikeText) {
    throw new DesignImportError(
      `Refusing to import non-text response (content-type: ${contentType}).`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new DesignImportError(
      `DESIGN.md exceeds max size (${buffer.byteLength} > ${maxBytes} bytes).`,
    );
  }
  const text = buffer.toString('utf8');
  return {
    url: url.toString(),
    contentType,
    bytes: buffer.byteLength,
    fetchedAt: new Date().toISOString(),
    text,
  };
}

export function formatImportedDesignMarkdown({ url, content, fetchedAt }) {
  const banner = [
    '<!--',
    `  Imported by slides-grab import-design`,
    `  source: ${url}`,
    `  fetched-at: ${fetchedAt}`,
    '-->',
    '',
  ].join('\n');
  return `${banner}${content}\n`;
}

export function saveImportedDesign({ outputPath, markdown }) {
  const absolutePath = resolve(outputPath);
  writeFileSync(absolutePath, markdown, 'utf8');
  return absolutePath;
}
