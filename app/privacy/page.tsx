'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import SpaceBackground from '@/components/SpaceBackground';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen bg-[#05070A]">
      <SpaceBackground />
      
      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
            <p className="text-gray-400">Last updated: February 12, 2026</p>
          </motion.div>

          <Card className="p-8 bg-white/5 border-white/10 backdrop-blur-sm">
            <div className="prose prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">1. Information We Collect</h2>
                <p className="text-gray-300 mb-4">
                  We collect information you provide directly to us:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Account information (email, name, password)</li>
                  <li>Payment information (processed securely via Stripe)</li>
                  <li>Content you create (avatars, videos, music, etc.)</li>
                  <li>Usage data and analytics</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
                <p className="text-gray-300 mb-4">
                  We use the information we collect to:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Provide, maintain, and improve our services</li>
                  <li>Process transactions and send related information</li>
                  <li>Send technical notices and support messages</li>
                  <li>Respond to your comments and questions</li>
                  <li>Detect and prevent fraud or abuse</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Data Storage & Security</h2>
                <p className="text-gray-300 mb-4">
                  Your data is stored securely using industry-standard encryption:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Database: Supabase (PostgreSQL with encryption at rest)</li>
                  <li>File storage: Secure cloud storage with access controls</li>
                  <li>Authentication: Encrypted session tokens</li>
                  <li>Payment data: PCI-compliant Stripe processing (we never store card details)</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Data Sharing</h2>
                <p className="text-gray-300 mb-4">
                  We do not sell your personal information. We may share your information with:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Service providers (hosting, analytics, payment processing)</li>
                  <li>Law enforcement when required by law</li>
                  <li>With your consent for specific purposes</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">5. Your Rights</h2>
                <p className="text-gray-300 mb-4">
                  You have the right to:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Access your personal data</li>
                  <li>Correct inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Export your data</li>
                  <li>Opt out of marketing communications</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">6. Cookies & Tracking</h2>
                <p className="text-gray-300 mb-4">
                  We use cookies and similar tracking technologies to:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Maintain your session and preferences</li>
                  <li>Understand how you use our service</li>
                  <li>Improve user experience</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">7. Children's Privacy</h2>
                <p className="text-gray-300 mb-4">
                  Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13. If we learn we have collected such information, we will delete it.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">8. International Data Transfers</h2>
                <p className="text-gray-300 mb-4">
                  Your data may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">9. Changes to Privacy Policy</h2>
                <p className="text-gray-300 mb-4">
                  We may update this policy from time to time. We will notify you of significant changes via email or service notification.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">10. Contact Us</h2>
                <p className="text-gray-300">
                  Questions about privacy? Contact us at{' '}
                  <Link href="/contact" className="text-cyan-400 hover:text-cyan-300">
                    privacy@avatar-g.com
                  </Link>
                </p>
              </section>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
