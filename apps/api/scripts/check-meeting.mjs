import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const meetingId = process.argv[2] || 'cmtsolonv0003hwe0j71dsdfn';

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      files: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!meeting) {
    console.log('Встреча не найдена');
    return;
  }

  console.log('\n=== Встреча ===');
  console.log(`ID: ${meeting.id}`);
  console.log(`Название: ${meeting.title}`);
  console.log(`Дата: ${meeting.startsAt}`);
  console.log(`Summary Status: ${meeting.summaryStatus || 'null'}`);
  console.log(`Summary: ${meeting.summary ? meeting.summary.substring(0, 100) + '...' : 'null'}`);
  console.log(
    `Decisions: ${meeting.decisions ? JSON.stringify(meeting.decisions).substring(0, 100) + '...' : 'null'}`,
  );

  console.log('\n=== Файлы ===');
  meeting.files.forEach((file, index) => {
    console.log(`\nФайл ${index + 1}:`);
    console.log(`  ID: ${file.id}`);
    console.log(`  Имя: ${file.originalName}`);
    console.log(`  Тип: ${file.type}`);
    console.log(`  Статус: ${file.status}`);
    console.log(
      `  Транскрипт: ${file.transcriptText ? `${file.transcriptText.length} символов` : 'отсутствует'}`,
    );
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
