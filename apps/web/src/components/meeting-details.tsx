'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Spinner } from '@heroui/react';
import { ApiError, getMeeting, regenerateMeetingSummary } from '@/lib/api';
import { useAuthedResource } from '@/hooks/use-authed-resource';
import { useMeetingUpdates } from '@/hooks/use-meeting-updates';
import { MeetingFiles } from '@/components/meeting-files';
import { ArrowLeftIcon, CalendarIcon } from '@/components/icons';

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'long',
  timeStyle: 'short',
});

function BackLink() {
  return (
    <Link
      href="/"
      className="-ml-1 inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-1 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ArrowLeftIcon className="size-4" />К встречам
    </Link>
  );
}

export function MeetingDetails({ id }: { id: string }) {
  const load = useCallback((accessToken: string) => getMeeting(id, accessToken), [id]);
  const { status, data: meeting, error, session, reload } = useAuthedResource(load);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  // WebSocket real-time updates
  useMeetingUpdates({
    meetingId: id,
    accessToken: session?.accessToken ?? '',
    enabled: !!session && status === 'ready',
    onUpdate: (update) => {
      console.log('[MeetingDetails] Received update:', update);
      // Reload meeting data when status changes
      if (update.type === 'summary_status_changed') {
        void reload();

        // Stop regenerating spinner when done or failed
        if (update.summaryStatus === 'done' || update.summaryStatus === 'failed') {
          setIsRegenerating(false);
        }
      }
    },
  });

  const handleRegenerateSummary = useCallback(async () => {
    if (!session) return;

    setIsRegenerating(true);
    setRegenerateError(null);

    try {
      await regenerateMeetingSummary(id, session.accessToken);
      // WebSocket will handle the status updates, no polling needed
    } catch (err) {
      setRegenerateError(
        err instanceof ApiError ? err.message : 'Не удалось запустить перегенерацию резюме',
      );
    } finally {
      setIsRegenerating(false);
    }
  }, [id, session]);

  if (status === 'loading') {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner size="lg" aria-label="Загрузка" />
      </main>
    );
  }

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <main className="flex flex-1 justify-center bg-gradient-to-br from-zinc-50 via-white to-zinc-100 p-6 dark:from-zinc-950 dark:via-black dark:to-zinc-900">
      <div className="flex w-full max-w-2xl flex-col gap-6 py-10">
        <BackLink />

        {status === 'ready' && meeting && session ? (
          <>
            <Card className="w-full gap-4 border border-border/60 p-6 shadow-xl backdrop-blur">
              <Card.Header className="gap-3">
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground"
                >
                  <CalendarIcon className="size-5.5" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    {meeting.title}
                  </h1>
                  <p className="text-sm text-muted">
                    <time dateTime={meeting.startsAt}>
                      {dateTimeFormatter.format(new Date(meeting.startsAt))}
                    </time>
                  </p>
                </div>
              </Card.Header>
            </Card>

            <Card className="w-full gap-4 border border-border/60 p-6 shadow-xl backdrop-blur">
              <Card.Header className="flex-row items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Резюме встречи
                </h2>
                {meeting.summaryStatus === 'done' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={handleRegenerateSummary}
                    isDisabled={isRegenerating}
                  >
                    {isRegenerating ? 'Генерация...' : 'Перегенерировать'}
                  </Button>
                )}
                {meeting.summaryStatus === 'failed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={handleRegenerateSummary}
                    isDisabled={isRegenerating}
                  >
                    {isRegenerating ? 'Генерация...' : 'Повторить'}
                  </Button>
                )}
              </Card.Header>
              <Card.Content className="gap-4 pt-0">
                {meeting.summaryStatus === 'processing' && (
                  <div className="flex items-center gap-3 py-4">
                    <Spinner size="sm" />
                    <p className="text-sm text-muted">Генерация резюме встречи...</p>
                  </div>
                )}

                {meeting.summaryStatus === 'failed' && (
                  <div className="rounded-lg bg-danger/10 px-4 py-3">
                    <p className="text-sm text-danger">Не удалось сгенерировать резюме встречи</p>
                  </div>
                )}

                {meeting.summaryStatus === 'done' && meeting.summary && (
                  <div className="flex flex-col gap-6">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {meeting.summary}
                    </p>

                    {meeting.decisions && meeting.decisions.length > 0 && (
                      <div className="flex flex-col gap-3">
                        <h3 className="text-base font-semibold text-foreground">
                          Принятые решения ({meeting.decisions.length})
                        </h3>
                        <ul className="space-y-3">
                          {meeting.decisions.map((decision, index) => (
                            <li key={index} className="border-l-2 border-primary/30 pl-4">
                              <p className="text-sm font-medium text-foreground">
                                {decision.decision}
                              </p>
                              {decision.rationale && (
                                <p className="mt-1 text-sm text-muted">{decision.rationale}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {regenerateError && (
                  <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                    {regenerateError}
                  </p>
                )}
              </Card.Content>
            </Card>

            <MeetingFiles meetingId={meeting.id} accessToken={session.accessToken} />
          </>
        ) : null}

        {status === 'error' && notFound ? (
          <Card className="w-full gap-2 border border-border/60 p-6 text-center shadow-xl backdrop-blur">
            <h1 className="text-lg font-medium text-foreground">Встреча не найдена</h1>
            <p className="text-sm text-muted">
              Возможно, она была удалена или ссылка указана неверно.
            </p>
          </Card>
        ) : null}

        {status === 'error' && !notFound ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
