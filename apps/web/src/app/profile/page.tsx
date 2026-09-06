import type { Metadata } from 'next';
import { ProfileView } from '@/components/profile-view';

export const metadata: Metadata = {
  title: 'Профиль',
  description: 'Ваш профиль',
};

export default function ProfilePage() {
  return <ProfileView />;
}
