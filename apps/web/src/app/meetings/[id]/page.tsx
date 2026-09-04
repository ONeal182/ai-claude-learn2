import type { Metadata } from 'next';
import { MeetingDetails } from '@/components/meeting-details';

export const metadata: Metadata = {
  title: 'Встреча',
  description: 'Детали встречи',
};

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeetingDetails id={id} />;
}
