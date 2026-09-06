'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
} from '@heroui/react';
import { changePassword, getMe, updateProfileName, uploadAvatar, type Me } from '@/lib/api';
import { useAuthedResource } from '@/hooks/use-authed-resource';
import { ArrowLeftIcon, CheckIcon } from '@/components/icons';
import { Avatar } from '@/components/avatar';

/** Мин. высота инпута/кнопки — тач-цель ≥ 44px на всех вьюпортах. */
const CONTROL_HEIGHT = 'min-h-11';
const AVATAR_SIZE = 72;

const MAX_NAME_LENGTH = 50;
const MIN_PASSWORD_LENGTH = 8;
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Имя после trim: 1..50 символов. `null` — валидно. */
function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Введите имя';
  if (trimmed.length > MAX_NAME_LENGTH) return `Имя не длиннее ${MAX_NAME_LENGTH} символов`;
  return null;
}

/** Новый пароль: не короче 8 символов. `null` — валидно. */
function validateNewPassword(value: string): string | null {
  if (!value) return 'Введите новый пароль';
  return value.length >= MIN_PASSWORD_LENGTH
    ? null
    : `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`;
}

/** Файл аватара: тип JPEG/PNG/WebP и размер ≤ 5 МБ. `null` — валидно. */
function validateAvatarFile(file: File): string | null {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
    return 'Выберите изображение в формате JPEG, PNG или WebP.';
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return 'Файл больше 5 МБ — выберите поменьше.';
  }
  return null;
}

/** Общее состояние «Сохранить» для блока формы: ожидание + свои сообщения успеха/ошибки. */
function useSaveState() {
  const [isPending, setPending] = useState(false);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function reset() {
    setOkMessage(null);
    setErrorMessage(null);
  }

  /** Показать ошибку блока без запроса (клиентская валидация). */
  function fail(message: string) {
    setOkMessage(null);
    setErrorMessage(message);
  }

  /** Выполняет запрос блока; возвращает `true` при успехе (для последующего редиректа). */
  async function run(action: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    reset();
    setPending(true);
    try {
      await action();
      setOkMessage(successMessage);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сохранить изменения.');
      return false;
    } finally {
      setPending(false);
    }
  }

  return { isPending, okMessage, errorMessage, run, reset, fail };
}

/** Строка успеха/ошибки под конкретным блоком. Текст всегда `text-foreground` — контраст ≥ 4.5:1. */
function BlockStatus({ ok, error }: { ok: string | null; error: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-foreground"
      >
        <CheckIcon aria-hidden className="size-4 shrink-0 text-success" />
        {ok}
      </p>
    );
  }
  return null;
}

function SaveButton({ isPending, label = 'Сохранить' }: { isPending: boolean; label?: string }) {
  return (
    <Button type="submit" size="lg" className={`${CONTROL_HEIGHT} px-6`} isPending={isPending}>
      {isPending ? (
        <>
          <Spinner color="current" size="sm" />
          Сохранение…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

/** Блок смены отображаемого имени. */
function NameBlock({ accessToken, initialName }: { accessToken: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const { isPending, okMessage, errorMessage, run, reset } = useSaveState();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Успех → уходим на /profile: страница перечитывает getMe, новое имя видно там и в шапке дашборда.
    if (await run(() => updateProfileName(accessToken, name.trim()), 'Имя обновлено.')) {
      router.push('/profile');
    }
  }

  return (
    <Card className="w-full gap-5 border border-border/60 p-6 shadow-xl backdrop-blur">
      <Card.Header className="gap-1">
        <h2 className="text-lg font-medium text-foreground">Имя</h2>
        <p className="text-sm leading-5 text-muted">
          Отображается на странице профиля и в шапке дашборда.
        </p>
      </Card.Header>

      <Form validationBehavior="native" className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Card.Content>
          <div className="flex flex-col gap-4">
            <TextField
              isRequired
              name="name"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              validate={validateName}
              onChange={(value) => {
                setName(value);
                reset();
              }}
            >
              <Label>Отображаемое имя</Label>
              <Input
                className={CONTROL_HEIGHT}
                variant="secondary"
                placeholder="Например, Иван Петров"
                autoComplete="name"
              />
              <Description>От 1 до 50 символов</Description>
              <FieldError />
            </TextField>

            <BlockStatus ok={okMessage} error={errorMessage} />
          </div>
        </Card.Content>

        <Card.Footer className="justify-end">
          <SaveButton isPending={isPending} />
        </Card.Footer>
      </Form>
    </Card>
  );
}

/** Блок загрузки аватара: выбор файла, превью выбранного изображения, «Сохранить». */
function AvatarBlock({ accessToken, me }: { accessToken: string; me: Me }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const { isPending, okMessage, errorMessage, run, reset, fail } = useSaveState();

  // Превью выбранного файла — object URL считаем при рендере (без setState в эффекте),
  // а эффект лишь освобождает его при смене файла/размонтировании.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    reset();
    const selected = event.target.files?.[0] ?? null;
    const validationError = selected ? validateAvatarFile(selected) : null;
    if (validationError) {
      event.target.value = '';
      setFile(null);
      fail(validationError);
      return;
    }
    setFile(selected);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const validationError = validateAvatarFile(file);
    if (validationError) {
      fail(validationError);
      return;
    }
    // Успех → на /profile: страница перечитывает getMe, новый аватар виден там и в шапке дашборда.
    const saved = await run(async () => {
      await uploadAvatar(accessToken, file);
      setFile(null);
    }, 'Аватар обновлён.');
    if (saved) router.push('/profile');
  }

  return (
    <Card className="w-full gap-5 border border-border/60 p-6 shadow-xl backdrop-blur">
      <Card.Header className="gap-1">
        <h2 className="text-lg font-medium text-foreground">Аватар</h2>
        <p className="text-sm leading-5 text-muted">
          Квадратное изображение смотрится лучше всего.
        </p>
      </Card.Header>

      <Form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Card.Content>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- превью локального файла по blob-URL из URL.createObjectURL; next/image здесь неприменим
                <img
                  src={previewUrl}
                  alt="Предпросмотр нового аватара"
                  style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                  className="shrink-0 rounded-full object-cover"
                />
              ) : (
                <Avatar
                  avatarUrl={me.avatarUrl}
                  name={me.name}
                  email={me.email}
                  size={AVATAR_SIZE}
                  alt="Текущий аватар"
                />
              )}
              <p className="min-w-0 text-sm text-muted">
                {file ? (
                  <span className="truncate text-foreground">{file.name}</span>
                ) : (
                  'Файл ещё не выбран'
                )}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="avatar-file" className="text-sm font-medium text-foreground">
                Файл изображения
              </label>
              <input
                id="avatar-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                aria-describedby="avatar-file-hint"
                className="block w-full text-sm text-muted file:me-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-foreground file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-background hover:file:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              />
              <p id="avatar-file-hint" className="text-xs text-muted">
                JPEG, PNG или WebP, до 5 МБ
              </p>
            </div>

            <BlockStatus ok={okMessage} error={errorMessage} />
          </div>
        </Card.Content>

        <Card.Footer className="justify-end">
          <Button
            type="submit"
            size="lg"
            className={`${CONTROL_HEIGHT} px-6`}
            isPending={isPending}
            isDisabled={!file}
          >
            {isPending ? (
              <>
                <Spinner color="current" size="sm" />
                Сохранение…
              </>
            ) : (
              'Сохранить'
            )}
          </Button>
        </Card.Footer>
      </Form>
    </Card>
  );
}

/** Блок смены пароля: текущий / новый / подтверждение. */
function PasswordBlock({ accessToken, email }: { accessToken: string; email: string }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { isPending, okMessage, errorMessage, run, reset } = useSaveState();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Неверный текущий пароль → `changePassword` бросает ApiError(401) → ошибка блока
    // (сессия не чистится — это не 401 загрузки страницы), поля остаются заполненными,
    // повторной отправки нет. Успех → сообщение, пользователь остаётся на странице.
    void run(async () => {
      await changePassword(accessToken, { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }, 'Пароль изменён.');
  }

  return (
    <Card className="w-full gap-5 border border-border/60 p-6 shadow-xl backdrop-blur">
      <Card.Header className="gap-1">
        <h2 className="text-lg font-medium text-foreground">Пароль</h2>
        <p className="text-sm leading-5 text-muted">
          После смены пароля вы останетесь в системе — повторный вход не потребуется.
        </p>
      </Card.Header>

      <Form validationBehavior="native" className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Card.Content>
          <div className="flex flex-col gap-4">
            {/* Скрытое поле username — чтобы менеджеры паролей связали смену с записью (реком. Chrome). */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              hidden
            />

            <TextField
              isRequired
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(value) => {
                setCurrentPassword(value);
                reset();
              }}
            >
              <Label>Текущий пароль</Label>
              <Input
                className={CONTROL_HEIGHT}
                variant="secondary"
                autoComplete="current-password"
              />
              <FieldError />
            </TextField>

            <TextField
              isRequired
              name="newPassword"
              type="password"
              value={newPassword}
              minLength={MIN_PASSWORD_LENGTH}
              validate={validateNewPassword}
              onChange={(value) => {
                setNewPassword(value);
                reset();
              }}
            >
              <Label>Новый пароль</Label>
              <Input className={CONTROL_HEIGHT} variant="secondary" autoComplete="new-password" />
              <Description>Минимум {MIN_PASSWORD_LENGTH} символов</Description>
              <FieldError />
            </TextField>

            <TextField
              isRequired
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              validate={(value) => (value === newPassword ? null : 'Пароли не совпадают')}
              onChange={(value) => {
                setConfirmPassword(value);
                reset();
              }}
            >
              <Label>Повторите новый пароль</Label>
              <Input className={CONTROL_HEIGHT} variant="secondary" autoComplete="new-password" />
              <FieldError />
            </TextField>

            <BlockStatus ok={okMessage} error={errorMessage} />
          </div>
        </Card.Content>

        <Card.Footer className="justify-end">
          <SaveButton isPending={isPending} />
        </Card.Footer>
      </Form>
    </Card>
  );
}

export function ProfileEdit() {
  const { status, data: me, error, session } = useAuthedResource(getMe);

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
        <Link
          href="/profile"
          className="-ml-1 inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-1 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ArrowLeftIcon className="size-4" />К профилю
        </Link>

        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Редактирование профиля
          </h1>
          <p className="text-sm text-muted">Имя, аватар и пароль меняются по отдельности.</p>
        </header>

        {status === 'error' ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error.message}
          </p>
        ) : null}

        {status === 'ready' && me && session ? (
          <>
            <NameBlock accessToken={session.accessToken} initialName={me.name ?? ''} />
            <AvatarBlock accessToken={session.accessToken} me={me} />
            <PasswordBlock accessToken={session.accessToken} email={me.email} />
          </>
        ) : null}
      </div>
    </main>
  );
}
