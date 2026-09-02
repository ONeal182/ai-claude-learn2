'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { ApiError, registerUser } from '@/lib/api';
import { saveSession } from '@/lib/session';
import { CheckIcon, EyeIcon, EyeOffIcon } from '@/components/icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/** Мин. высота инпута/кнопки — тач-цель ≥ 44px на всех вьюпортах. */
const CONTROL_HEIGHT = 'min-h-11';

type FieldErrors = Record<'email' | 'password', string | undefined>;

/** Раскидывает сообщения Nest ValidationPipe (400) по полям формы. */
function splitValidationErrors(messages: string[]): FieldErrors {
  const errors: FieldErrors = { email: undefined, password: undefined };

  for (const raw of messages) {
    const message = raw.toLowerCase();
    if (message.includes('email')) errors.email ??= raw;
    else if (message.includes('password') || message.includes('парол')) errors.password ??= raw;
  }

  return errors;
}

/** Пустое поле и синтаксически неверное — разные сообщения. */
function validateEmail(value: string): string | null {
  if (!value.trim()) return 'Введите email';
  return EMAIL_RE.test(value) ? null : 'Введите корректный email';
}

function validatePassword(value: string): string | null {
  if (!value) return 'Введите пароль';
  // В тексте ошибки повторяем требование — подсказка `Description` при ошибке скрывается.
  return value.length >= MIN_PASSWORD
    ? null
    : `Пароль должен быть не короче ${MIN_PASSWORD} символов`;
}

export function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isPending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({
    email: undefined,
    password: undefined,
  });
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const resetErrors = () => {
    setFormError(null);
    setServerErrors({ email: undefined, password: undefined });
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetErrors();
    setPending(true);

    try {
      const { accessToken } = await registerUser({ email, password });
      saveSession({ accessToken, email });
      setRegisteredEmail(email);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerErrors({
          email: 'Пользователь с таким email уже зарегистрирован',
          password: undefined,
        });
      } else if (error instanceof ApiError && error.status === 400) {
        setServerErrors(splitValidationErrors(error.messages));
      } else {
        setFormError(error instanceof Error ? error.message : 'Неизвестная ошибка');
      }
    } finally {
      setPending(false);
    }
  }

  if (registeredEmail) {
    return (
      <Card className="w-full max-w-md gap-5 border border-border/60 p-6 shadow-xl backdrop-blur">
        <Card.Header className="items-center gap-3 text-center">
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success"
          >
            <CheckIcon className="size-6" />
          </span>
          {/* Реальный <h2>: Card.Title рендерит <h3>, а между ним и <h1>
              страницы нет <h2> — пропуск уровня. aria-level на нативном
              заголовке Chromium игнорирует, поэтому свой тег. */}
          <h2 className="text-sm leading-6 font-medium text-foreground">Аккаунт создан</h2>
          <p className="text-sm leading-5 text-muted">
            Пользователь <span className="font-medium text-foreground">{registeredEmail}</span>{' '}
            зарегистрирован, токен доступа получен и сохранён.
          </p>
        </Card.Header>
        <Card.Footer className="flex-col gap-3">
          <Button
            fullWidth
            size="lg"
            className={CONTROL_HEIGHT}
            onPress={() => {
              setRegisteredEmail(null);
              setEmail('');
              setPassword('');
              setShowPassword(false);
            }}
          >
            Зарегистрировать ещё
          </Button>
          <p className="text-center text-sm text-muted">
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Перейти ко входу
            </Link>
          </p>
        </Card.Footer>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md gap-5 border border-border/60 p-6 shadow-xl backdrop-blur">
      <Card.Header className="gap-1.5">
        <h2 className="text-2xl font-medium text-foreground">Создание аккаунта</h2>
        <p className="text-sm leading-5 text-muted">
          Введите email и пароль, чтобы зарегистрироваться
        </p>
      </Card.Header>

      <Form validationBehavior="native" className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Card.Content>
          <div className="flex flex-col gap-4">
            <TextField
              isRequired
              name="email"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                if (serverErrors.email) setServerErrors((prev) => ({ ...prev, email: undefined }));
              }}
              isInvalid={serverErrors.email ? true : undefined}
              validate={validateEmail}
            >
              <Label>Email</Label>
              <Input
                className={CONTROL_HEIGHT}
                placeholder="you@example.com"
                variant="secondary"
                autoComplete="email"
              />
              <FieldError>{serverErrors.email}</FieldError>
            </TextField>

            <TextField
              isRequired
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              minLength={MIN_PASSWORD}
              onChange={(value) => {
                setPassword(value);
                if (serverErrors.password)
                  setServerErrors((prev) => ({ ...prev, password: undefined }));
              }}
              isInvalid={serverErrors.password ? true : undefined}
              validate={validatePassword}
            >
              <Label>Пароль</Label>
              {/* Обёртка нужна, чтобы спозиционировать кнопку-глазик поверх поля.
                  Description при ошибке HeroUI прячет сам (`.textfield[data-invalid]`). */}
              <div className="relative">
                <Input
                  className={`${CONTROL_HEIGHT} w-full pe-11`}
                  variant="secondary"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label="Показать пароль"
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-field text-muted transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  {showPassword ? (
                    <EyeIcon className="size-5" />
                  ) : (
                    <EyeOffIcon className="size-5" />
                  )}
                </button>
              </div>
              <Description>Минимум {MIN_PASSWORD} символов</Description>
              <FieldError>{serverErrors.password}</FieldError>
            </TextField>

            {formError ? (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {formError}
              </p>
            ) : null}
          </div>
        </Card.Content>

        <Card.Footer className="flex-col gap-3">
          <Button
            fullWidth
            type="submit"
            size="lg"
            className={CONTROL_HEIGHT}
            isPending={isPending}
          >
            {isPending ? (
              <>
                <Spinner color="current" size="sm" />
                Регистрация…
              </>
            ) : (
              'Зарегистрироваться'
            )}
          </Button>
          <p className="text-center text-sm text-muted">
            Уже есть аккаунт?{' '}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Войти
            </Link>
          </p>
        </Card.Footer>
      </Form>
    </Card>
  );
}
