'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Spinner, cn } from '@heroui/react';
import {
  ApiError,
  deleteMeetingFile,
  downloadMeetingFile,
  getMeetingFiles,
  reprocessMeetingFile,
  uploadMeetingFile,
  type MeetingFile,
  type MeetingFileStatus,
  type MeetingFileType,
} from '@/lib/api';
import { clearSession } from '@/lib/session';
import {
  ChevronDownIcon,
  DownloadIcon,
  MicIcon,
  PaperclipIcon,
  RotateCcwIcon,
  TrashIcon,
  UploadCloudIcon,
} from '@/components/icons';

/** Пока активная обработка есть — опрашиваем список с этим интервалом. */
const POLL_INTERVAL_MS = 3000;

/**
 * Статус обработки (показываем только для `recording`). Подпись несёт смысл сама по себе;
 * цвет — только у декоративной точки, а текст всегда `text-foreground` ради контраста ≥ 4.5:1
 * (вивидные `--success` / `--warning` как мелкий текст на светлом фоне порог не проходят).
 */
const STATUS_META: Record<MeetingFileStatus, { label: string; dot: string }> = {
  pending: { label: 'В очереди', dot: 'bg-muted' },
  processing: { label: 'Обрабатывается', dot: 'bg-warning' },
  done: { label: 'Готово', dot: 'bg-success' },
  failed: { label: 'Ошибка обработки', dot: 'bg-danger' },
};

const sizeFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${sizeFormatter.format(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${sizeFormatter.format(mb)} МБ`;
  return `${sizeFormatter.format(mb / 1024)} ГБ`;
}

/** Расширения, по которым файл считаем записью, когда браузер не прислал mime. */
const RECORDING_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'm4a',
  'aac',
  'flac',
  'ogg',
  'oga',
  'opus',
  'weba',
  'mp4',
  'm4v',
  'mov',
  'webm',
  'mkv',
  'avi',
]);

/**
 * Предполагаемый вид файла: `audio/*` / `video/*` → `recording`, при пустом mime — по
 * расширению, иначе `attachment`. Догадку можно переопределить вручную (`typeChoice`):
 * при drag-n-drop браузер часто отдаёт пустой `file.type`, а запись, залитую как
 * `attachment`, уже не отправить в обработку.
 */
function detectFileType(file: File): MeetingFileType {
  if (file.type.startsWith('audio/') || file.type.startsWith('video/')) return 'recording';
  if (!file.type && RECORDING_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() ?? '')) {
    return 'recording';
  }
  return 'attachment';
}

/** Выбор в сегментном переключателе над зоной загрузки. */
type TypeChoice = 'auto' | MeetingFileType;

const TYPE_CHOICES: ReadonlyArray<{ value: TypeChoice; label: string }> = [
  { value: 'auto', label: 'Определить' },
  { value: 'recording', label: 'Запись' },
  { value: 'attachment', label: 'Вложение' },
];

const DROPZONE_HINT: Record<TypeChoice, string> = {
  auto: 'Аудио и видео обрабатываются автоматически, остальные файлы — как вложения',
  recording: 'Файл будет загружен как запись и отправлен в обработку',
  attachment: 'Файл будет загружен как вложение, без обработки',
};

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'Файл больше допустимого размера.';
    if (error.status === 400) return 'Такой тип файла загрузить нельзя.';
    if (error.status === 404) return 'Встреча не найдена — обновите страницу.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Не удалось загрузить файл.';
}

/** Прогресс текущей выгрузки; `fraction === undefined` — длина неизвестна (индикатор без процента). */
interface UploadState {
  name: string;
  fraction: number | undefined;
}

function ProgressRow({ upload }: { upload: UploadState }) {
  const percent = upload.fraction == null ? null : Math.round(upload.fraction * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-foreground">{upload.name}</span>
        <span className="shrink-0 text-muted">{percent == null ? 'Загрузка…' : `${percent}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Загрузка «${upload.name}»`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
      >
        <div
          className={cn(
            'h-full rounded-full bg-foreground transition-[width] duration-200',
            percent == null && 'w-1/3 animate-pulse',
          )}
          style={percent == null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function FileRow({
  file,
  meetingId,
  accessToken,
  onChanged,
  onAuthError,
}: {
  file: MeetingFile;
  meetingId: string;
  accessToken: string;
  onChanged: () => void;
  onAuthError: () => void;
}) {
  const [busy, setBusy] = useState<'download' | 'delete' | 'reprocess' | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const Icon = file.type === 'recording' ? MicIcon : PaperclipIcon;
  const statusMeta = file.type === 'recording' ? STATUS_META[file.status] : null;
  const hasTranscript =
    file.type === 'recording' && file.status === 'done' && Boolean(file.transcriptText);

  async function runRowAction(
    key: 'download' | 'delete' | 'reprocess',
    fn: () => Promise<unknown>,
    opts: { refreshAfter?: boolean; ignoreMissing?: boolean } = {},
  ): Promise<void> {
    setBusy(key);
    setRowError(null);
    try {
      await fn();
      if (opts.refreshAfter) onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onAuthError();
        return;
      }
      // файл уже удалён на сервере — просто синхронизируемся со списком
      if (error instanceof ApiError && error.status === 404 && opts.ignoreMissing) {
        onChanged();
        return;
      }
      setRowError(error instanceof Error ? error.message : 'Действие не выполнено.');
    } finally {
      setBusy(null);
    }
  }

  function handleDownload() {
    void runRowAction('download', async () => {
      const { blob, filename } = await downloadMeetingFile(meetingId, file.id, accessToken);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename || file.originalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground"
        >
          <Icon className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium text-foreground" title={file.originalName}>
            {file.originalName}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{file.type === 'recording' ? 'Запись' : 'Вложение'}</span>
            <span aria-hidden>·</span>
            <span>{formatSize(file.size)}</span>
            {statusMeta ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-0.5 font-medium text-foreground">
                {file.status === 'processing' ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <span aria-hidden className={cn('size-1.5 rounded-full', statusMeta.dot)} />
                )}
                {statusMeta.label}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onPress={handleDownload}
          isPending={busy === 'download'}
        >
          <DownloadIcon className="size-4" />
          Скачать
        </Button>

        {file.status === 'failed' ? (
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onPress={() =>
              void runRowAction(
                'reprocess',
                () => reprocessMeetingFile(meetingId, file.id, accessToken),
                { refreshAfter: true },
              )
            }
            isPending={busy === 'reprocess'}
          >
            <RotateCcwIcon className="size-4" />
            Повторить
          </Button>
        ) : null}

        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5 text-danger"
          onPress={() =>
            void runRowAction('delete', () => deleteMeetingFile(meetingId, file.id, accessToken), {
              refreshAfter: true,
              ignoreMissing: true,
            })
          }
          isPending={busy === 'delete'}
        >
          <TrashIcon className="size-4" />
          Удалить
        </Button>
      </div>

      {hasTranscript ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowTranscript((visible) => !visible)}
            aria-expanded={showTranscript}
            className="inline-flex items-center gap-1.5 self-start rounded-md text-sm font-medium text-foreground transition-colors hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ChevronDownIcon
              className={cn('size-4 transition-transform', showTranscript && 'rotate-180')}
            />
            {showTranscript ? 'Скрыть транскрипт' : 'Показать транскрипт'}
          </button>
          {showTranscript ? (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-foreground/[0.03] p-3 text-sm leading-relaxed text-foreground">
              {file.transcriptText}
            </p>
          ) : null}
        </div>
      ) : null}

      {file.status === 'failed' && !rowError ? (
        <p className="text-xs text-danger">
          Запись не удалось обработать. Нажмите «Повторить», чтобы запустить обработку заново.
        </p>
      ) : null}
      {rowError ? (
        <p role="alert" className="text-xs text-danger">
          {rowError}
        </p>
      ) : null}
    </li>
  );
}

export function MeetingFiles({
  meetingId,
  accessToken,
}: {
  meetingId: string;
  accessToken: string;
}) {
  const router = useRouter();

  // Один раз словили 401 — уходим на /login; поллинг и запросы дальше не дёргаем.
  const deadRef = useRef(false);
  const handleAuthError = useCallback(() => {
    deadRef.current = true;
    clearSession();
    router.replace('/login');
  }, [router]);

  const [files, setFiles] = useState<MeetingFile[] | null>(null);
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Первичная загрузка: setState только в .then/.catch (не синхронно в теле эффекта).
  useEffect(() => {
    let cancelled = false;
    getMeetingFiles(meetingId, accessToken)
      .then((list) => {
        if (cancelled || deadRef.current) return;
        setFiles(list);
        setListStatus('ready');
        setListError(null);
      })
      .catch((error: unknown) => {
        if (cancelled || deadRef.current) return;
        if (error instanceof ApiError && error.status === 401) {
          handleAuthError();
          return;
        }
        setListStatus('error');
        setListError(error instanceof Error ? error.message : 'Не удалось загрузить файлы.');
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId, accessToken, handleAuthError]);

  // Обновление вручную / поллингом: не трогает listStatus как «loading», при ошибке
  // оставляет уже показанный список (фон не должен мигать сообщением об ошибке).
  const refreshFiles = useCallback(async (): Promise<void> => {
    if (deadRef.current) return;
    setIsRefreshing(true);
    try {
      const list = await getMeetingFiles(meetingId, accessToken);
      setFiles(list);
      setListStatus('ready');
      setListError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) handleAuthError();
    } finally {
      setIsRefreshing(false);
    }
  }, [meetingId, accessToken, handleAuthError]);

  const hasActive =
    files?.some((file) => file.status === 'pending' || file.status === 'processing') ?? false;

  useEffect(() => {
    if (!hasActive || deadRef.current) return;
    const timer = window.setInterval(() => void refreshFiles(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasActive, refreshFiles]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [typeChoice, setTypeChoice] = useState<TypeChoice>('auto');
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  // За раз грузим один файл (PRD: «файл перетаскивается или выбирается»); при нескольких
  // перетащенных берём первый и сообщаем об этом. `skipped` — сколько файлов проигнорировали.
  const uploadFile = useCallback(
    async (file: File, skipped = 0): Promise<void> => {
      setUploadError(null);
      setUploadNote(skipped > 0 ? 'Загружается только первый файл — добавляйте по одному.' : null);
      setUpload({ name: file.name, fraction: 0 });
      try {
        await uploadMeetingFile({
          meetingId,
          file,
          type: typeChoice === 'auto' ? detectFileType(file) : typeChoice,
          accessToken,
          onProgress: ({ fraction }) => setUpload((prev) => (prev ? { ...prev, fraction } : prev)),
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleAuthError();
          return;
        }
        setUploadError(`«${file.name}»: ${uploadErrorMessage(error)}`);
        return;
      } finally {
        setUpload(null);
      }
      void refreshFiles();
    },
    [meetingId, accessToken, typeChoice, handleAuthError, refreshFiles],
  );

  const locked = upload != null;

  function openPicker() {
    if (!locked) inputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (locked) return;
    const dropped = event.dataTransfer.files;
    if (dropped.length > 0) void uploadFile(dropped[0], dropped.length - 1);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (file) void uploadFile(file);
  }

  return (
    <Card className="w-full gap-4 border border-border/60 p-6 shadow-xl backdrop-blur">
      <Card.Header className="flex-row items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-foreground">Файлы</h2>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onPress={() => void refreshFiles()}
          isPending={isRefreshing}
          isDisabled={listStatus === 'loading'}
        >
          <RotateCcwIcon className="size-4" />
          Обновить
        </Button>
      </Card.Header>

      <Card.Content className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Загрузить как:</span>
          <div
            role="group"
            aria-label="Вид загружаемого файла"
            className="inline-flex overflow-hidden rounded-lg border border-border/60"
          >
            {TYPE_CHOICES.map(({ value, label }, index) => (
              <button
                key={value}
                type="button"
                aria-pressed={typeChoice === value}
                onClick={() => setTypeChoice(value)}
                className={cn(
                  'min-h-9 px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                  index > 0 && 'border-s border-border/60',
                  typeChoice === value
                    ? 'bg-foreground text-background'
                    : 'text-muted hover:bg-foreground/[0.04] hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={locked}
          aria-label="Загрузить файл: перетащите сюда или нажмите, чтобы выбрать"
          onClick={openPicker}
          onDragOver={(event) => {
            event.preventDefault();
            if (!locked) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-foreground/40',
            isDragging ? 'border-foreground bg-foreground/[0.04]' : 'border-border/70',
          )}
        >
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full bg-foreground/5 text-foreground"
          >
            <UploadCloudIcon className="size-5" />
          </span>
          <span className="text-sm font-medium text-foreground">
            Перетащите файл сюда или нажмите, чтобы выбрать
          </span>
          <span className="text-xs text-muted">{DROPZONE_HINT[typeChoice]}</span>
        </button>

        <input ref={inputRef} type="file" hidden onChange={handleInputChange} />

        {upload ? <ProgressRow upload={upload} /> : null}

        {uploadNote ? <p className="text-xs text-muted">{uploadNote}</p> : null}

        {uploadError ? (
          <div
            role="alert"
            className="flex items-start justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              aria-label="Скрыть сообщение об ошибке"
              className="-my-0.5 -me-1 shrink-0 rounded p-0.5 font-medium transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              ✕
            </button>
          </div>
        ) : null}

        {listStatus === 'loading' ? (
          <div className="flex justify-center py-6">
            <Spinner aria-label="Загрузка файлов" />
          </div>
        ) : null}

        {listStatus === 'error' ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {listError}
          </p>
        ) : null}

        {listStatus === 'ready' && files ? (
          files.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-busy={isRefreshing}>
              {files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  meetingId={meetingId}
                  accessToken={accessToken}
                  onChanged={() => void refreshFiles()}
                  onAuthError={handleAuthError}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Файлов пока нет. Загрузите запись встречи или вложение.
            </p>
          )
        ) : null}
      </Card.Content>
    </Card>
  );
}
