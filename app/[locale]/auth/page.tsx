import LocaleLoginPage from '../login/page';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string }>;
};

// /auth is an alias of /login — forward params + searchParams so the login page's
// session short-circuit + redirect defaulting work identically on both routes.
export default function LocalizedAuthPage({ params, searchParams }: Props) {
  return <LocaleLoginPage params={params} searchParams={searchParams} />;
}
