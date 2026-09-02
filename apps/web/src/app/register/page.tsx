import type { Metadata } from 'next';
import { RegisterForm } from '@/components/register-form';
import { SparkleIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Регистрация',
  description: 'Создание нового аккаунта',
};

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-zinc-50 via-white to-zinc-100 p-6 dark:from-zinc-950 dark:via-black dark:to-zinc-900">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-2xl bg-foreground text-background"
          >
            <SparkleIcon className="size-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Добро пожаловать</h1>
          <p className="text-sm text-muted">Заведите аккаунт за пару секунд</p>
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}
