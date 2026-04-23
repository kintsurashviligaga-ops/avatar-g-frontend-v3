import { redirect } from 'next/navigation';

type LocaleRootPageProps = {
  params: {
    locale: string;
  };
};

export default function LocaleRootPage({ params }: LocaleRootPageProps) {
  redirect(`/${params.locale}/dashboard`);
}
