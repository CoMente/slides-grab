import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_MAX_BYTES = 256 * 1024;
const ALLOWED_PROTOCOLS = new Set(['https:']);

function getHeader(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) ?? '';
  return headers[name] ?? headers[name.toLowerCase()] ?? '';
}

function validateFinalDesignUrl(rawUrl, { allowedProtocols = ALLOWED_PROTOCOLS } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (cause) {
    throw new DesignImportError(`Invalid final URL after redirects: ${rawUrl}`, { cause });
  }
  if (!allowedProtocols.has(url.protocol)) {
    throw new DesignImportError(
      `Redirect final URL protocol ${url.protocol} is not allowed. Allowed: ${[...allowedProtocols].join(', ')}`,
    );
  }
  return url;
}

async function readResponseBody(response, { maxBytes }) {
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          if (typeof reader.cancel === 'function') {
            await reader.cancel().catch(() => {});
          }
          throw new DesignImportError(
            `DESIGN.md exceeds max size (${total} > ${maxBytes} bytes).`,
          );
        }
        chunks.push(chunk);
      }
    } finally {
      if (typeof reader.releaseLock === 'function') reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new DesignImportError(
      `DESIGN.md exceeds max size (${buffer.byteLength} > ${maxBytes} bytes).`,
    );
  }
  return buffer;
}

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

    const finalUrl = validateFinalDesignUrl(response.url ?? url.toString(), { allowedProtocols });

    if (!response.ok) {
      throw new DesignImportError(`Fetch returned HTTP ${response.status} for ${url}`);
    }

    const contentType = getHeader(response.headers, 'content-type');
    const looksLikeText = contentType === '' ||
      contentType.includes('text/') ||
      contentType.includes('markdown') ||
      contentType.includes('application/octet-stream');
    if (!looksLikeText) {
      throw new DesignImportError(
        `Refusing to import non-text response (content-type: ${contentType}).`,
      );
    }

    const buffer = await readResponseBody(response, { maxBytes });
    const text = buffer.toString('utf8');
    return {
      url: finalUrl.toString(),
      contentType,
      bytes: buffer.byteLength,
      fetchedAt: new Date().toISOString(),
      text,
    };
  } catch (cause) {
    if (cause instanceof DesignImportError) throw cause;
    throw new DesignImportError(`Fetch failed for ${url}: ${cause.message}`, { cause });
  } finally {
    clearTimeout(timeoutHandle);
  }
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
