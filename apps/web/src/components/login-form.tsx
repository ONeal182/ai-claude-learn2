'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, FieldError, Form, Input, Label, Spinner, TextField } from '@heroui/react';
import { ApiError, loginUser } from '@/lib/api';
import { saveSession } from '@/lib/session';
import { EyeIcon, EyeOffIcon } from '@/components/icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Мин. высота инпута/кнопки — тач-цель ≥ 44px на всех вьюпортах. */
const CONTROL_HEIGHT = 'min-h-11';

/** Пустое поле и синтаксически неверное — разные сообщения. */
function validateEmail(value: string): string | null {
  if (!value.trim()) return 'Введите email';
  return EMAIL_RE.test(value) ? null : 'Введите корректный email';
}

function validatePassword(value: string): string | null {
  return value ? null : 'Введите пароль';
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isPending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setPending(true);

    try {
      const { accessToken } = await loginUser({ email, password });
      saveSession({ accessToken, email });
      router.push('/');
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
        setFormError('Неверный email или пароль');
      } else {
        setFormError(error instanceof Error ? error.message : 'Неизвестная ошибка');
      }
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md gap-5 border border-border/60 p-6 shadow-xl backdrop-blur">
      <Card.Header className="gap-1.5">
        <h2 className="text-2xl font-medium text-foreground">Вход в аккаунт</h2>
        <p className="text-sm leading-5 text-muted">Введите email и пароль, чтобы войти</p>
      </Card.Header>

      <Form validationBehavior="native" className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Card.Content>
          <div className="flex flex-col gap-4">
            <TextField
              isRequired
              name="email"
              type="email"
              value={email}
              onChange={setEmail}
              validate={validateEmail}
            >
              <Label>Email</Label>
              <Input
                className={CONTROL_HEIGHT}
                placeholder="you@example.com"
                variant="secondary"
                autoComplete="email"
              />
              <FieldError />
            </TextField>

            <TextField
              isRequired
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              validate={validatePassword}
            >
              <Label>Пароль</Label>
              {/* Обёртка нужна, чтобы спозиционировать кнопку-глазик поверх поля. */}
              <div className="relative">
                <Input
                  className={`${CONTROL_HEIGHT} w-full pe-11`}
                  variant="secondary"
                  autoComplete="current-password"
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
              <FieldError />
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
                Вход…
              </>
            ) : (
              'Войти'
            )}
          </Button>
          <p className="text-center text-sm text-muted">
            Нет аккаунта?{' '}
            <Link
              href="/register"
              className="font-medium text-foreground underline underline-offset-2"
            >
              Зарегистрироваться
            </Link>
          </p>
        </Card.Footer>
      </Form>
    </Card>
  );
}
