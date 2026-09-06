import type { Metadata } from 'next';
import { ProfileEdit } from '@/components/profile-edit';

export const metadata: Metadata = {
  title: 'Редактирование профиля',
  description: 'Смена имени, аватара и пароля',
};

export default function ProfileEditPage() {
  return <ProfileEdit />;
}
