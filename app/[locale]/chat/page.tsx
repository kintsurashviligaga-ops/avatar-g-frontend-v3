import ChatInterface from '@/components/chat/ChatInterface';

interface ChatPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { locale } = await params;
  return <ChatInterface locale={locale} />;
}
