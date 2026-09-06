'use client';

import { useState, type CSSProperties } from 'react';
import { avatarSrc } from '@/lib/api';

export interface AvatarProps {
  /** `Me.avatarUrl` — относительный путь API или абсолютная ссылка; `null`, если аватар не задан. */
  avatarUrl: string | null | undefined;
  /** Имя пользователя — основной источник инициалов, когда картинки нет. */
  name?: string | null;
  /** E-mail — запасной источник инициалов, если имя пустое. */
  email?: string | null;
  /** Диаметр в пикселях (по умолчанию 40). */
  size?: number;
  /**
   * Альт-текст картинки. По умолчанию пустой — компонент декоративный: рядом
   * всегда есть подпись с именем или почтой. Задавайте, если аватар стоит отдельно.
   */
  alt?: string;
  /** Доп. классы контейнера. */
  className?: string;
}

/**
 * Инициалы: первая и последняя буквы имени, иначе первая буква имени, иначе
 * первая буква локальной части e-mail, иначе `?`.
 */
function initialsFrom(name?: string | null, email?: string | null): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/);
    const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0][0];
    return letters.toUpperCase();
  }

  const localPart = email?.trim().split('@')[0];
  return localPart ? localPart[0].toUpperCase() : '?';
}

/**
 * Аватар пользователя: картинка по `avatarSrc(avatarUrl)`, а при её отсутствии
 * или ошибке загрузки — кружок с инициалами из `name` (или `email`). Диаметр
 * задаётся пропом `size` (в пикселях).
 */
export function Avatar({ avatarUrl, name, email, size = 40, alt = '', className }: AvatarProps) {
  const src = avatarSrc(avatarUrl ?? null);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = src !== null && !imageFailed;

  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.4),
  };

  return (
    <span
      style={style}
      role={!showImage && alt ? 'img' : undefined}
      aria-label={!showImage && alt ? alt : undefined}
      className={[
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-foreground/10 font-medium text-foreground',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- аватар раздаёт сторонний API (см. avatarSrc); next/image потребовал бы remotePatterns и не даёт onError-фолбэк на инициалы
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden>{initialsFrom(name, email)}</span>
      )}
    </span>
  );
}
