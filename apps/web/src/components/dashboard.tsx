'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Spinner } from '@heroui/react';
import { getMe, getMeetings, type Meeting } from '@/lib/api';
import { clearSession } from '@/lib/session';
import { useAuthedResource } from '@/hooks/use-authed-resource';
import { Avatar } from '@/components/avatar';
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

export function Dashboard() {
  const router = useRouter();
  const { status, data, error, session } = useAuthedResource(getMeetings);
  // Профиль для шапки — необязателен: пока грузится или упал, показываем email из сессии.
  const { data: profile } = useAuthedResource(getMe);
  const accountEmail = profile?.email ?? session?.email ?? null;
  const accountName = profile?.name?.trim() || accountEmail;
  // «сейчас» фиксируем один раз при монтировании — граница «предстоящие/прошедшие»
  // не должна плыть при перерисовках (и useMemo не имеет права звать Date.now()).
  const [now] = useState(() => Date.now());

  const upcomingMeetings = useMemo(() => {
    if (!data) return [];
    return data
      .filter((meeting) => new Date(meeting.startsAt).getTime() >= now)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [data, now]);

  const recentMeetings = useMemo(() => data?.slice(0, 3) ?? [], [data]);

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
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Ваши встречи</h1>
            <Link
              href="/profile"
              className="-ml-1 inline-flex min-h-9 min-w-0 items-center gap-2 self-start rounded-md px-1 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {/* Декоративный — рядом стоит подпись с именем/почтой (см. AvatarProps.alt). */}
              <Avatar
                avatarUrl={profile?.avatarUrl}
                name={profile?.name}
                email={accountEmail}
                size={28}
              />
              <span className="truncate text-sm font-medium text-foreground">{accountName}</span>
            </Link>
          </div>
          <Button variant="secondary" onPress={handleLogout} className="min-h-11 gap-2 shrink-0">
            <LogOutIcon className="size-4.5" />
            Выйти
          </Button>
        </header>

        {status === 'error' ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error.message}
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
