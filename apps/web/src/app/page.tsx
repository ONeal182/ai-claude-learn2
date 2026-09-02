import type { Metadata } from 'next';
import { Dashboard } from '@/components/dashboard';

export const metadata: Metadata = {
  title: 'Главная',
  description: 'Ваши встречи',
};

export default function Home() {
  return <Dashboard />;
}
