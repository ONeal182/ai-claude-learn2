'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Spinner } from '@heroui/react';
import { ApiError, getMeeting, type Meeting } from '@/lib/api';
import { clearSession, getSession } from '@/lib/session';
import { ArrowLeftIcon, CalendarIcon } from '@/components/icons';

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'long',
  timeStyle: 'short',
});

type Status = 'loading' | 'ready' | 'not-found' | 'error';

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
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    getMeeting(id, session.accessToken)
      .then((data) => {
        if (cancelled) return;
        setMeeting(data);
        setStatus('ready');
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        if (fetchError instanceof ApiError && fetchError.status === 404) {
          setStatus('not-found');
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить встречу');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (status === 'loading') {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner size="lg" aria-label="Загрузка" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 justify-center bg-gradient-to-br from-zinc-50 via-white to-zinc-100 p-6 dark:from-zinc-950 dark:via-black dark:to-zinc-900">
      <div className="flex w-full max-w-2xl flex-col gap-6 py-10">
        <BackLink />

        {status === 'ready' && meeting ? (
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
        ) : null}

        {status === 'not-found' ? (
          <Card className="w-full gap-2 border border-border/60 p-6 text-center shadow-xl backdrop-blur">
            <h1 className="text-lg font-medium text-foreground">Встреча не найдена</h1>
            <p className="text-sm text-muted">
              Возможно, она была удалена или ссылка указана неверно.
            </p>
          </Card>
        ) : null}

        {status === 'error' ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
