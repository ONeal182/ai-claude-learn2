'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { clearSession, getSession, type Session } from '@/lib/session';

/** Состояние загрузки ресурса защищённой страницы. */
export type AuthedResourceState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: Error };

/**
 * Общий сценарий защищённой клиентской страницы (как в `Dashboard`):
 * читает сессию (нет → `router.replace('/login')`), зовёт `load(accessToken)`,
 * ответ `401` чистит сессию и уводит на `/login`. Прочие ошибки кладёт в
 * `error` — вызывающий сам решает, как их показать (например, `ApiError`
 * со `status === 404` как отдельное состояние).
 *
 * `load` должен быть стабильным между рендерами (импортированная функция или
 * `useCallback`), иначе эффект перезапустит запрос на каждый рендер.
 * `session` возвращается сразу — для показа email и прочего, пока она есть.
 */
export function useAuthedResource<T>(
  load: (accessToken: string) => Promise<T>,
): AuthedResourceState<T> & { session: Session | null } {
  const router = useRouter();
  const [session] = useState(getSession);
  const [state, setState] = useState<AuthedResourceState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!session) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    load(session.accessToken)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null });
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        if (fetchError instanceof ApiError && fetchError.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        setState({
          status: 'error',
          data: null,
          error:
            fetchError instanceof Error ? fetchError : new Error('Не удалось загрузить данные'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [load, session, router]);

  return { ...state, session };
}
