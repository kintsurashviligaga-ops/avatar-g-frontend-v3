
import LandingPageClient from '@/components/landing/LandingPageClient';

/**
 * PROD MARKER — TEMPORARY
 * If this red banner appears at https://myavatar.ge, the fix deployed.
 * Remove after confirming production render.
 */
function ProdMarker() {
	return (
		<div
			style={{
				position: 'fixed',
				top: '68px',
				left: '50%',
				transform: 'translateX(-50%)',
				zIndex: 9999,
				background: '#ff0033',
				color: '#ffffff',
				padding: '6px 16px',
				borderRadius: '999px',
				fontSize: '11px',
				fontWeight: 'bold',
				pointerEvents: 'none',
				whiteSpace: 'nowrap',
			}}
		>
			PROD FIX DEPLOYED · 2026-02-28
		</div>
	);
}

export default function RootPage() {
	return (
		<>
			<ProdMarker />
			<LandingPageClient />
		</>
	);
}
