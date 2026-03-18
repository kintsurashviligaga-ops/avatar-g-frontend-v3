import { IPhoneMockup } from './IPhoneMockup'

export const metadata = {
  title: 'App Preview — MyAvatar.ge',
  description: 'Agent G iPhone App UI Preview',
}

export default function AppPreviewPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8" style={{ background: '#0a0a0c' }}>
      <IPhoneMockup />
    </div>
  )
}
