import { EventBus } from '@nestjs/cqrs';
import { MeetingFileStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MeetingFileProcessingQueue } from './meeting-file-processing.queue.js';
import { type SttInput, type SttService } from './stt.service.js';

/**
 * Интеграционные тесты in-process очереди (Фаза 3): любой сбой движка → `failed` без
 * `transcriptText`; один воркер (`concurrency = 1`); `onModuleDestroy` прерывает текущую
 * задачу через `AbortSignal` и после остановки в БД не пишет. Prisma — лёгкий двойник на
 * `vi.fn()`, `STT_SERVICE` — управляемый двойник.
 */
describe('MeetingFileProcessingQueue', () => {
  interface FakePrisma {
    meetingFile: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  }

  function makePrisma(): FakePrisma {
    return {
      meetingFile: {
        findUnique: vi.fn().mockImplementation(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve({
            id,
            originalName: `${id}.wav`,
            size: 1024,
            storageKey: `key-${id}`,
            mimeType: 'audio/wav',
            status: MeetingFileStatus.pending,
            transcriptText: null,
          }),
        ),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
  }

  function build(prisma: FakePrisma, stt: SttService): MeetingFileProcessingQueue {
    const eventBus = { publish: vi.fn() } as unknown as EventBus;
    return new MeetingFileProcessingQueue(prisma as unknown as PrismaService, stt, eventBus);
  }

  /** Статусы, с которыми звался `meetingFile.update`, по порядку. */
  function statuses(prisma: FakePrisma): string[] {
    return prisma.meetingFile.update.mock.calls.map(
      ([arg]) => (arg as { data: { status: string } }).data.status,
    );
  }

  it('сбой transcribe → файл failed, transcriptText не записан', async () => {
    const prisma = makePrisma();
    const stt: SttService = { transcribe: vi.fn().mockRejectedValue(new Error('движок упал')) };
    const queue = build(prisma, stt);

    queue.enqueue('f1');
    await vi.waitFor(() => expect(statuses(prisma)).toContain(MeetingFileStatus.failed));

    expect(stt.transcribe).toHaveBeenCalledTimes(1);
    expect(statuses(prisma)).toEqual([MeetingFileStatus.processing, MeetingFileStatus.failed]);
    expect(statuses(prisma)).not.toContain(MeetingFileStatus.done);
    const wroteTranscript = prisma.meetingFile.update.mock.calls.some(([arg]) =>
      Object.prototype.hasOwnProperty.call((arg as { data: object }).data, 'transcriptText'),
    );
    expect(wroteTranscript).toBe(false);
  });

  it('успех → processing затем done с transcriptText', async () => {
    const prisma = makePrisma();
    const stt: SttService = { transcribe: vi.fn().mockResolvedValue('готовый текст') };
    const queue = build(prisma, stt);

    queue.enqueue('f1');
    await vi.waitFor(() => expect(statuses(prisma)).toContain(MeetingFileStatus.done));

    expect(statuses(prisma)).toEqual([MeetingFileStatus.processing, MeetingFileStatus.done]);
    const doneCall = prisma.meetingFile.update.mock.calls.at(-1)?.[0] as {
      data: { transcriptText?: string };
    };
    expect(doneCall.data.transcriptText).toBe('готовый текст');
  });

  it('concurrency = 1: пока первая задача не завершилась, вторая не ушла в processing', async () => {
    const prisma = makePrisma();
    let releaseFirst!: () => void;
    const firstGate = new Promise<string>((resolve) => {
      releaseFirst = () => resolve('первый');
    });
    const stt: SttService = {
      transcribe: vi
        .fn()
        .mockImplementationOnce(() => firstGate)
        .mockImplementationOnce(() => Promise.resolve('второй')),
    };
    const queue = build(prisma, stt);

    queue.enqueue('f1');
    queue.enqueue('f2');

    await vi.waitFor(() => expect(stt.transcribe).toHaveBeenCalledTimes(1));
    // вторая ещё не началась: единственный processing — по первому файлу
    expect(
      prisma.meetingFile.update.mock.calls.filter(
        ([a]) => (a as { data: { status: string } }).data.status === MeetingFileStatus.processing,
      ),
    ).toHaveLength(1);

    releaseFirst();
    await vi.waitFor(() => expect(stt.transcribe).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(statuses(prisma).filter((s) => s === MeetingFileStatus.done)).toHaveLength(2),
    );
  });

  it('onModuleDestroy во время активной задачи: подпроцесс получает abort, в БД после остановки не пишем', async () => {
    const prisma = makePrisma();
    let seenInput: SttInput | undefined;
    const stt: SttService = {
      transcribe: vi.fn().mockImplementation(
        (input: SttInput) =>
          new Promise((_resolve, reject) => {
            seenInput = input;
            input.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          }),
      ),
    };
    const queue = build(prisma, stt);

    queue.enqueue('f1');
    await vi.waitFor(() => expect(stt.transcribe).toHaveBeenCalledTimes(1));

    expect(seenInput?.signal).toBeInstanceOf(AbortSignal);
    expect(seenInput?.signal?.aborted).toBe(false);
    const updatesBefore = prisma.meetingFile.update.mock.calls.length;

    await queue.onModuleDestroy();

    expect(seenInput?.signal?.aborted).toBe(true);
    // единственный update был «processing» до старта transcribe; failed/done после stopped не пишутся
    expect(prisma.meetingFile.update.mock.calls.length).toBe(updatesBefore);
    expect(statuses(prisma)).not.toContain(MeetingFileStatus.failed);
    expect(statuses(prisma)).not.toContain(MeetingFileStatus.done);
  });

  it('enqueue после onModuleDestroy игнорируется', async () => {
    const prisma = makePrisma();
    const stt: SttService = { transcribe: vi.fn().mockResolvedValue('x') };
    const queue = build(prisma, stt);

    await queue.onModuleDestroy();
    queue.enqueue('f1');
    await new Promise((r) => setTimeout(r, 20));

    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(prisma.meetingFile.findUnique).not.toHaveBeenCalled();
  });
});
