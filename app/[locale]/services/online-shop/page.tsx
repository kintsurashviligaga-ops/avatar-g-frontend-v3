import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOrCreateDevShop, listOrders, listProducts, listSuppliers } from '@/lib/onlineShop/repo';
import { OnlineShopHeader } from './_components/OnlineShopHeader';

type OnlineShopDashboardProps = {
	params: Promise<{ locale: string }>;
};

export default async function OnlineShopDashboardPage({ params }: OnlineShopDashboardProps) {
	const { locale } = await params;
	const shop = getOrCreateDevShop('dev-user-1');
	const suppliers = listSuppliers();
	const products = listProducts(shop.id);
	const orders = listOrders(shop.id);

	return (
		<section className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
			<OnlineShopHeader
				locale={locale}
				title="Online Shop — C: AI Auto-Dropshipping"
				subtitle="Manage suppliers, import products, optimize pricing, and automate fulfillment."
			/>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<Card className="border-white/10 bg-white/5">
					<CardHeader>
						<CardTitle className="text-white">Suppliers</CardTitle>
					</CardHeader>
					<CardContent className="text-2xl font-semibold text-emerald-300">{suppliers.length}</CardContent>
				</Card>
				<Card className="border-white/10 bg-white/5">
					<CardHeader>
						<CardTitle className="text-white">Products</CardTitle>
					</CardHeader>
					<CardContent className="text-2xl font-semibold text-cyan-300">{products.length}</CardContent>
				</Card>
				<Card className="border-white/10 bg-white/5">
					<CardHeader>
						<CardTitle className="text-white">Orders</CardTitle>
					</CardHeader>
					<CardContent className="text-2xl font-semibold text-violet-300">{orders.length}</CardContent>
				</Card>
			</div>

			<Card className="border-white/10 bg-white/5">
				<CardHeader>
					<CardTitle className="text-white">Quick Actions</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-3">
					<Link href={`/${locale}/services/online-shop/import`} className="rounded-lg border border-emerald-500/30 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10">
						Import products
					</Link>
					<Link href={`/${locale}/services/online-shop/products`} className="rounded-lg border border-cyan-500/30 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/10">
						Manage products
					</Link>
					<Link href={`/${locale}/services/online-shop/orders`} className="rounded-lg border border-violet-500/30 px-4 py-2 text-sm text-violet-300 hover:bg-violet-500/10">
						Process orders
					</Link>
				</CardContent>
			</Card>
		</section>
	);
}

