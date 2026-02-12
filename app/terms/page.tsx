'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import SpaceBackground from '@/components/SpaceBackground';
import Link from 'next/link';

export default function TermsPage() {
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
            <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
            <p className="text-gray-400">Last updated: February 12, 2026</p>
          </motion.div>

          <Card className="p-8 bg-white/5 border-white/10 backdrop-blur-sm">
            <div className="prose prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
                <p className="text-gray-300 mb-4">
                  By accessing and using Avatar G ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Use License</h2>
                <p className="text-gray-300 mb-4">
                  Permission is granted to temporarily access and use the Service for personal, non-commercial purposes. This license shall automatically terminate if you violate any of these restrictions.
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>You must be at least 13 years old to use this service</li>
                  <li>You agree not to misuse the service or help anyone else do so</li>
                  <li>Content generated is subject to our acceptable use policy</li>
                  <li>Credits are non-refundable except as required by law</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Subscription & Billing</h2>
                <p className="text-gray-300 mb-4">
                  Subscriptions are billed monthly or annually. You may cancel at any time, but refunds are not provided for partial months.
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Plans: Free ($0), Basic ($30/mo), Premium ($150/mo)</li>
                  <li>Credits reset monthly and do not roll over</li>
                  <li>Overages may incur additional charges</li>
                  <li>Payment processing via Stripe</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Intellectual Property</h2>
                <p className="text-gray-300 mb-4">
                  Content you create using Avatar G is yours. However, by using the service, you grant us a license to use, store, and display that content as necessary to provide the service.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">5. Prohibited Uses</h2>
                <p className="text-gray-300 mb-4">
                  You may not use Avatar G to create:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Illegal, harmful, or abusive content</li>
                  <li>Content that violates intellectual property rights</li>
                  <li>Misleading deepfakes or impersonations</li>
                  <li>Spam or unsolicited commercial content</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">6. Termination</h2>
                <p className="text-gray-300 mb-4">
                  We reserve the right to terminate or suspend access to our Service immediately, without prior notice, for conduct that we believe violates these Terms.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">7. Limitation of Liability</h2>
                <p className="text-gray-300 mb-4">
                  Avatar G shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">8. Changes to Terms</h2>
                <p className="text-gray-300 mb-4">
                  We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">9. Contact</h2>
                <p className="text-gray-300">
                  Questions about the Terms of Service? Contact us at{' '}
                  <Link href="/contact" className="text-cyan-400 hover:text-cyan-300">
                    support@avatar-g.com
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
