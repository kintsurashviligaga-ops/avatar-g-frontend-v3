import { Metadata } from 'next';
import WorkflowPageClient from './WorkflowPageClient';

type WorkflowPageProps = {
  params: Promise<{ locale: string }>;
};

const META: Record<string, { title: string; description: string }> = {
  en: {
    title: 'Pipeline Command Centre | MyAvatar',
    description: 'Build end-to-end automation pipelines — chain AI services, configure each step, and execute with intelligent agents.',
  },
  ka: {
    title: 'Pipeline მმართველი ცენტრი | MyAvatar',
    description: 'ავტომატიზაციის პაიპლაინების აგება — AI სერვისების დაკავშირება, ნაბიჯების კონფიგურაცია და აგენტებით გაშვება.',
  },
  ru: {
    title: 'Командный центр пайплайнов | MyAvatar',
    description: 'Создавайте сквозные пайплайны — соединяйте AI-сервисы, настраивайте шаги и запускайте через интеллектуальных агентов.',
  },
};

export async function generateMetadata({ params }: WorkflowPageProps): Promise<Metadata> {
  const { locale } = await params;
  const m = META[locale] ?? META['en'] ?? { title: 'Pipeline Command Centre | MyAvatar', description: '' };
  return { title: m.title, description: m.description };
}

export default async function WorkflowPage({ params }: WorkflowPageProps) {
  const { locale } = await params;
  return <WorkflowPageClient locale={locale} />;
}
