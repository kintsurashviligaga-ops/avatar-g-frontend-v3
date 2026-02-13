import AdminPayoutsClient from './AdminPayoutsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin Payouts - Avatar G',
  description: 'Approve or reject payout requests',
};

export default function AdminPayoutsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <AdminPayoutsClient />
      </div>
    </div>
  );
}
