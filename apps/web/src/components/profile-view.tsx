'use client';

import Link from 'next/link';
import { Card, Spinner } from '@heroui/react';
import { getMe } from '@/lib/api';
import { useAuthedResource } from '@/hooks/use-authed-resource';
import { ArrowLeftIcon, PencilIcon } from '@/components/icons';
import { Avatar } from '@/components/avatar';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' });

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

export function ProfileView() {
  const { status, data: me, error } = useAuthedResource(getMe);

  if (status === 'loading') {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Spinner size="lg" aria-label="Загрузка" />
      </main>
    );
  }

  const trimmedName = me?.name?.trim();
  const displayName = trimmedName || me?.email;

  return (
    <main className="flex flex-1 justify-center bg-gradient-to-br from-zinc-50 via-white to-zinc-100 p-6 dark:from-zinc-950 dark:via-black dark:to-zinc-900">
      <div className="flex w-full max-w-2xl flex-col gap-6 py-10">
        <BackLink />

        {status === 'ready' && me ? (
          <Card className="w-full gap-6 border border-border/60 p-6 shadow-xl backdrop-blur">
            <Card.Header className="gap-4">
              {/* Декоративный — рядом стоит заголовок с именем/почтой (см. AvatarProps.alt). */}
              <Avatar avatarUrl={me.avatarUrl} name={me.name} email={me.email} size={72} />
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                  {displayName}
                </h1>
                {trimmedName ? <p className="truncate text-sm text-muted">{me.email}</p> : null}
              </div>
            </Card.Header>

            <Card.Content>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted">Email</dt>
                  <dd className="text-foreground">{me.email}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted">Дата регистрации</dt>
                  <dd className="text-foreground">
                    <time dateTime={me.createdAt}>
                      {dateFormatter.format(new Date(me.createdAt))}
                    </time>
                  </dd>
                </div>
              </dl>
            </Card.Content>

            <Card.Footer>
              <Link
                href="/profile/edit"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border/60 px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <PencilIcon className="size-4" />
                Редактировать
              </Link>
            </Card.Footer>
          </Card>
        ) : null}

        {status === 'error' ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
