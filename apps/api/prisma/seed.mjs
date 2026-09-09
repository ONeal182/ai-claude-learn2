import { PrismaClient, MeetingFileType, MeetingFileStatus, TaskStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';

// Загрузить переменные окружения
config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL не задан в переменных окружения');
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Начинаем заполнение базы данных тестовыми данными...');

  // Удалить существующие данные (в обратном порядке зависимостей)
  await prisma.task.deleteMany();
  await prisma.meetingFile.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.user.deleteMany();

  // 1. Создать тестового пользователя
  const hashedPassword = await bcrypt.hash('test123456', 10);
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      password: hashedPassword,
      name: 'Тестовый Пользователь',
    },
  });
  console.log('✅ Создан пользователь:', user.email);

  // 2. Создать встречи
  const meeting1 = await prisma.meeting.create({
    data: {
      title: 'Планирование Q4 2026',
      startsAt: new Date('2026-09-01T10:00:00Z'),
      summary: 'Обсуждали планы на четвёртый квартал, приоритеты и ресурсы команды.',
      decisions: [
        'Решили сфокусироваться на новом функционале аутентификации',
        'Отложили рефакторинг до следующего квартала',
      ],
    },
  });
  console.log('✅ Создана встреча:', meeting1.title);

  const meeting2 = await prisma.meeting.create({
    data: {
      title: 'Ретроспектива спринта #12',
      startsAt: new Date('2026-09-05T14:00:00Z'),
      summary: 'Ретроспектива прошедшего спринта. Обсудили что прошло хорошо и что можно улучшить.',
      decisions: ['Внедрить ежедневные стендапы в 10:00', 'Увеличить покрытие тестами до 80%'],
    },
  });
  console.log('✅ Создана встреча:', meeting2.title);

  const meeting3 = await prisma.meeting.create({
    data: {
      title: 'Технический дизайн: API для задач',
      startsAt: new Date('2026-09-08T11:00:00Z'),
    },
  });
  console.log('✅ Создана встреча:', meeting3.title);

  // 3. Создать файлы встреч
  const file1 = await prisma.meetingFile.create({
    data: {
      meetingId: meeting1.id,
      type: MeetingFileType.recording,
      status: MeetingFileStatus.done,
      summaryStatus: MeetingFileStatus.done,
      originalName: 'planning-q4-2026.wav',
      mimeType: 'audio/wav',
      size: 5242880, // 5 MB
      storageKey: 'meetings/planning-q4-2026.wav',
      transcriptText: `[00:00] Алексей: Добрый день всем! Начинаем планирование Q4.
[00:15] Мария: Привет! Я подготовила список приоритетных задач.
[00:30] Алексей: Отлично. Давайте начнём с аутентификации.
[01:00] Иван: Я могу взять на себя OAuth интеграцию.
[01:15] Мария: А я займусь JWT токенами.
[01:30] Алексей: Решено. Рефакторинг отложим до следующего квартала.
[02:00] Иван: Согласен, сейчас не время для больших изменений.`,
      summary: {
        summary: 'Обсуждали планы на четвёртый квартал, приоритеты и ресурсы команды.',
        decisions: [
          'Решили сфокусироваться на новом функционале аутентификации',
          'Отложили рефакторинг до следующего квартала',
        ],
        actionItems: ['Иван: реализовать OAuth интеграцию', 'Мария: внедрить JWT токены'],
      },
    },
  });
  console.log('✅ Создан файл:', file1.originalName);

  const file2 = await prisma.meetingFile.create({
    data: {
      meetingId: meeting2.id,
      type: MeetingFileType.recording,
      status: MeetingFileStatus.done,
      summaryStatus: MeetingFileStatus.done,
      originalName: 'retro-sprint-12.wav',
      mimeType: 'audio/wav',
      size: 3145728, // 3 MB
      storageKey: 'meetings/retro-sprint-12.wav',
      transcriptText: `[00:00] Мария: Начинаем ретроспективу спринта 12.
[00:20] Иван: Что прошло хорошо - мы закрыли все запланированные задачи.
[00:40] Алексей: Что можно улучшить - покрытие тестами ещё низкое.
[01:00] Мария: Предлагаю ввести ежедневные стендапы.
[01:20] Иван: Согласен, это поможет синхронизации.
[01:40] Алексей: Решено. И давайте установим цель 80% покрытия.`,
      summary: {
        summary:
          'Ретроспектива прошедшего спринта. Обсудили что прошло хорошо и что можно улучшить.',
        decisions: ['Внедрить ежедневные стендапы в 10:00', 'Увеличить покрытие тестами до 80%'],
        actionItems: [
          'Алексей: настроить напоминания для стендапов',
          'Мария: добавить тесты для критических путей',
        ],
      },
    },
  });
  console.log('✅ Создан файл:', file2.originalName);

  const file3 = await prisma.meetingFile.create({
    data: {
      meetingId: meeting3.id,
      type: MeetingFileType.recording,
      status: MeetingFileStatus.processing,
      originalName: 'tech-design-tasks-api.wav',
      mimeType: 'audio/wav',
      size: 4194304, // 4 MB
      storageKey: 'meetings/tech-design-tasks-api.wav',
      transcriptText: `[00:00] Алексей: Сегодня обсудим дизайн API для задач.
[00:20] Мария: Нужны эндпоинты для CRUD операций.
[00:40] Иван: И поиск по задачам обязателен.`,
    },
  });
  console.log('✅ Создан файл:', file3.originalName);

  const attachment1 = await prisma.meetingFile.create({
    data: {
      meetingId: meeting1.id,
      type: MeetingFileType.attachment,
      status: MeetingFileStatus.done,
      originalName: 'q4-roadmap.pdf',
      mimeType: 'application/pdf',
      size: 1048576, // 1 MB
      storageKey: 'meetings/q4-roadmap.pdf',
    },
  });
  console.log('✅ Создан аттачмент:', attachment1.originalName);

  // 4. Создать задачи
  const task1 = await prisma.task.create({
    data: {
      title: 'Реализовать OAuth интеграцию',
      sourceMeetingId: meeting1.id,
      status: TaskStatus.in_progress,
    },
  });
  console.log('✅ Создана задача:', task1.title);

  const task2 = await prisma.task.create({
    data: {
      title: 'Внедрить JWT токены',
      sourceMeetingId: meeting1.id,
      status: TaskStatus.pending,
    },
  });
  console.log('✅ Создана задача:', task2.title);

  const task3 = await prisma.task.create({
    data: {
      title: 'Настроить напоминания для стендапов',
      sourceMeetingId: meeting2.id,
      status: TaskStatus.completed,
    },
  });
  console.log('✅ Создана задача:', task3.title);

  const task4 = await prisma.task.create({
    data: {
      title: 'Добавить тесты для критических путей',
      sourceMeetingId: meeting2.id,
      status: TaskStatus.in_progress,
    },
  });
  console.log('✅ Создана задача:', task4.title);

  const task5 = await prisma.task.create({
    data: {
      title: 'Спроектировать CRUD эндпоинты для задач',
      sourceMeetingId: meeting3.id,
      status: TaskStatus.pending,
    },
  });
  console.log('✅ Создана задача:', task5.title);

  console.log('\n🎉 База данных успешно заполнена тестовыми данными!');
  console.log('\n📋 Данные для входа:');
  console.log('   Email: test@example.com');
  console.log('   Пароль: test123456');
  console.log('\n📊 Создано:');
  console.log(`   - 1 пользователь`);
  console.log(`   - 3 встречи`);
  console.log(`   - 4 файла (3 записи + 1 аттачмент)`);
  console.log(`   - 5 задач`);
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при заполнении базы данных:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
