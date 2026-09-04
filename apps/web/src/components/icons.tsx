import type { SVGProps } from 'react';

/**
 * Мелкие декоративные иконки формы — инлайновый SVG вместо юникод-глифов
 * (чётче на любом DPI, цвет наследуется от `currentColor`, управляется темой).
 * Всегда `aria-hidden`: рядом есть текстовая подпись.
 */

export function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d="M12 2.5l2.4 6.6a3 3 0 0 0 1.8 1.8l6.6 2.4-6.6 2.4a3 3 0 0 0-1.8 1.8L12 24.1l-2.4-6.6a3 3 0 0 0-1.8-1.8L1.2 13.3l6.6-2.4a3 3 0 0 0 1.8-1.8z" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      <path d="M4 12.5l5 5 11-11" />
    </svg>
  );
}

const eyeStroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
} as const satisfies SVGProps<SVGSVGElement>;

/** Открытый глаз — пароль сейчас виден. */
export function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...eyeStroke} {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Перечёркнутый глаз — пароль сейчас скрыт. */
export function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...eyeStroke} {...props}>
      <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a15.9 15.9 0 0 1-3.3 4.2M6.6 6.6A15.9 15.9 0 0 0 2 12s3.5 7 10 7a10.3 10.3 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

export function LogOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 2.5v4" />
      <path d="M16 2.5v4" />
    </svg>
  );
}

const strokeIcon = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
} as const satisfies SVGProps<SVGSVGElement>;

/** Облако со стрелкой вверх — зона загрузки файла. */
export function UploadCloudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...strokeIcon} {...props}>
      <path d="M12 13v8" />
      <path d="m8 17 4-4 4 4" />
      <path d="M20.4 14.5A5 5 0 0 0 18 5.5a7 7 0 0 0-13.3 2A4.5 4.5 0 0 0 5 16.4" />
    </svg>
  );
}

/** Стрелка вниз в лоток — скачать файл. */
export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...strokeIcon} {...props}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

/** Корзина — удалить файл. */
export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...strokeIcon} {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

/** Круговая стрелка — «Повторить» обработку и «Обновить» список. */
export function RotateCcwIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...strokeIcon} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

/** Шеврон вниз — разворачивание транскрипта (поворачивается через CSS). */
export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...strokeIcon} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Микрофон — файл-запись (`recording`). */
export function MicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...strokeIcon} {...props}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
    </svg>
  );
}

/** Скрепка — файл-вложение (`attachment`). */
export function PaperclipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...strokeIcon} {...props}>
      <path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
    </svg>
  );
}
