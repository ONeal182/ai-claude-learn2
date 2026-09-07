import { Logger } from '@nestjs/common';

/** Secrets shipped in templates — must never reach a real deployment. */
const KNOWN_WEAK_SECRETS = new Set(['change-me', 'dev-secret-change-me', 'secret', 'changeme']);
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Validates security-sensitive env on boot. In production a weak/short
 * `JWT_SECRET` is fatal; elsewhere it is a loud warning (keeps dev/CI usable
 * with placeholder values). Wired through `ConfigModule.forRoot({ validate })`.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const logger = new Logger('EnvValidation');
  const isProduction = config.NODE_ENV === 'production';
  const secret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET : '';

  const problems: string[] = [];
  if (!secret) {
    problems.push('JWT_SECRET is not set');
  } else {
    if (KNOWN_WEAK_SECRETS.has(secret)) {
      problems.push('JWT_SECRET is a known placeholder value');
    }
    if (secret.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(`JWT_SECRET is shorter than ${MIN_JWT_SECRET_LENGTH} characters`);
    }
  }

  if (problems.length > 0) {
    const message = `Insecure configuration: ${problems.join('; ')}`;
    if (isProduction) {
      throw new Error(message);
    }
    logger.warn(`${message} — acceptable only outside production`);
  }

  return config;
}
