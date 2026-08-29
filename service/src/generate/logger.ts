/** Minimal logger interface so generate/* doesn't depend on Fastify's type. */
export interface Logger {
  info(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}
