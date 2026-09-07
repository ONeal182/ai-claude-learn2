import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // без этого SIGTERM/SIGINT не триггерят OnModuleDestroy — очередь не оборвёт подпроцесс
  // whisper/ffmpeg, а Prisma не закроет пул при рестарте по сигналу
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
