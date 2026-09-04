'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Spinner } from '@heroui/react';
import { ApiError, getMeetings, type Meeting } from '@/lib/api';
import { clearSession, getSession } from '@/lib/session';
import { CalendarIcon, ChevronRightIcon, LogOutIcon } from '@/components/icons';

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function MeetingRow({ meeting }: { meeting: Meeting }) {
  return (
    <li>
      <Link
        href={`/meetings/${meeting.id}`}
        className="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground"
        >
          <CalendarIcon className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{meeting.title}</span>
          <span className="text-xs text-muted">
            {dateTimeFormatter.format(new Date(meeting.startsAt))}
          </span>
        </div>
        <ChevronRightIcon aria-hidden className="ml-auto size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

function MeetingSection({
  title,
  meetings,
  emptyText,
}: {
  title: string;
  meetings: Meeting[];
  emptyText: string;
}) {
  return (
    <Card className="w-full gap-4 border border-border/60 p-6 shadow-xl backdrop-blur">
      <Card.Header className="gap-1">
        <h2 className="text-lg font-medium text-foreground">{title}</h2>
      </Card.Header>
      <Card.Content>
        {meetings.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {meetings.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{emptyText}</p>
        )}
      </Card.Content>
    </Card>
  );
}

type Status = 'loading' | 'ready' | 'error';

export function Dashboard() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    getMeetings(session.accessToken)
      .then((data) => {
        if (cancelled) return;
        const now = Date.now();
        const upcoming = data
          .filter((meeting) => new Date(meeting.startsAt).getTime() >= now)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

        setEmail(session.email);
        setUpcomingMeetings(upcoming);
        setRecentMeetings(data.slice(0, 3));
        setStatus('ready');
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        setEmail(session.email);
        setError(fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить встречи');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

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
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Ваши встречи</h1>
            <p className="text-sm text-muted">
              Вы вошли как <span className="truncate font-medium text-foreground">{email}</span>
            </p>
          </div>
          <Button variant="secondary" onPress={handleLogout} className="min-h-11 gap-2 shrink-0">
            <LogOutIcon className="size-4.5" />
            Выйти
          </Button>
        </header>

        {error ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {status === 'ready' ? (
          <>
            <MeetingSection
              title="Текущие встречи"
              meetings={upcomingMeetings}
              emptyText="Предстоящих встреч пока нет."
            />
            <MeetingSection
              title="Последние встречи"
              meetings={recentMeetings}
              emptyText="Встреч пока нет."
            />
          </>
        ) : null}
      </div>
    </main>
  );
}
