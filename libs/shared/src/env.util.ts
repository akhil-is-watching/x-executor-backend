/** Resolve HTTP listen port from PORT (Railway, Docker, local .env). */
export function resolveListenPort(): number {
  const raw = process.env.PORT ?? process.env.port;
  if (!raw) {
    throw new Error('PORT environment variable is required');
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }

  return port;
}
