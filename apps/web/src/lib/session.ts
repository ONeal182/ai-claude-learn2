const TOKEN_KEY = 'accessToken';
const EMAIL_KEY = 'userEmail';

export interface Session {
  accessToken: string;
  email: string;
}

/** Сохраняет токен и email после успешного логина/регистрации. */
export function saveSession(session: Session): void {
  try {
    localStorage.setItem(TOKEN_KEY, session.accessToken);
    localStorage.setItem(EMAIL_KEY, session.email);
  } catch {
    /* localStorage может быть недоступен — не критично */
  }
}

/** Текущая сессия из localStorage, если пользователь залогинен. */
export function getSession(): Session | null {
  try {
    const accessToken = localStorage.getItem(TOKEN_KEY);
    const email = localStorage.getItem(EMAIL_KEY);
    return accessToken && email ? { accessToken, email } : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* localStorage может быть недоступен — не критично */
  }
}
