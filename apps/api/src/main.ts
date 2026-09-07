import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

function corsOrigins(config: ConfigService): string[] | boolean {
  const raw = config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : false;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // не раскрываем стек (`X-Powered-By: Express`) и ставим базовые security-заголовки
  app.disable('x-powered-by');
  app.use(
    helmet({
      // API отдаёт JSON и бинарные файлы, не HTML-страницы — дефолтный CSP helmet тут только мешает
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS только для доверенного origin веба (было: все источники)
  app.enableCors({
    origin: corsOrigins(config),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
  });

  await app.listen(config.get<number>('PORT', 3001));
}
await bootstrap();
