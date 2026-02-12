'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import SpaceBackground from '@/components/SpaceBackground';
import Link from 'next/link';

export default function RefundPolicyPage() {
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
            <h1 className="text-4xl font-bold text-white mb-4">Refund Policy</h1>
            <p className="text-gray-400">Last updated: February 12, 2026</p>
          </motion.div>

          <Card className="p-8 bg-white/5 border-white/10 backdrop-blur-sm">
            <div className="prose prose-invert max-w-none">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">1. General Policy</h2>
                <p className="text-gray-300 mb-4">
                  Avatar G operates on a subscription model with monthly credit allocations. Due to the nature of AI-generated content and computational costs, our refund policy is as follows:
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">2. Subscription Refunds</h2>
                <p className="text-gray-300 mb-4">
                  Monthly subscription charges are generally non-refundable. However, we may provide refunds in the following cases:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li><strong>Service Outage:</strong> Extended service unavailability (&gt;48 hours) not caused by scheduled maintenance</li>
                  <li><strong>Billing Errors:</strong> Duplicate charges or incorrect pricing</li>
                  <li><strong>First-Time Users:</strong> Within 7 days of first subscription if you've used less than 10% of your monthly credits</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">3. Credits Policy</h2>
                <p className="text-gray-300 mb-4">
                  Credits are digital goods with immediate value upon use:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Credits used for generation cannot be refunded</li>
                  <li>Unused credits expire at the end of each billing cycle</li>
                  <li>Credits do not roll over to the next month</li>
                  <li>Failed generations are automatically refunded to your account</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">4. Cancellation Policy</h2>
                <p className="text-gray-300 mb-4">
                  You may cancel your subscription at any time:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Cancel anytime through your account settings or billing portal</li>
                  <li>Access continues until the end of your current billing period</li>
                  <li>No partial refunds for unused time</li>
                  <li>Remaining credits are available until period end</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">5. How to Request a Refund</h2>
                <p className="text-gray-300 mb-4">
                  If you believe you qualify for a refund:
                </p>
                <ol className="list-decimal list-inside text-gray-300 space-y-2">
                  <li>Contact our support team at <Link href="/contact" className="text-cyan-400 hover:text-cyan-300">support@avatar-g.com</Link></li>
                  <li>Provide your account email and reason for refund</li>
                  <li>Include any relevant details (transaction ID, error messages, etc.)</li>
                  <li>We will review and respond within 2-3 business days</li>
                </ol>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">6. Refund Processing Time</h2>
                <p className="text-gray-300 mb-4">
                  Approved refunds are processed as follows:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Credit card refunds: 5-10 business days</li>
                  <li>PayPal refunds: 3-5 business days</li>
                  <li>Bank transfers: 7-14 business days</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">7. Exceptions</h2>
                <p className="text-gray-300 mb-4">
                  Refunds will not be provided for:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Violation of Terms of Service resulting in account termination</li>
                  <li>Change of mind after using credits</li>
                  <li>Dissatisfaction with generated content quality (subjective)</li>
                  <li>Subscription periods beyond the current month</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">8. Free Plan</h2>
                <p className="text-gray-300 mb-4">
                  The free plan is provided at no cost and is not eligible for refunds.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">9. Chargeback Policy</h2>
                <p className="text-gray-300 mb-4">
                  We encourage you to contact us before filing a chargeback. Chargebacks may result in:
                </p>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Immediate suspension of account access</li>
                  <li>Loss of all content and usage history</li>
                  <li>Investigation fees charged to your account</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-white mb-4">10. Contact</h2>
                <p className="text-gray-300">
                  Questions about refunds? Contact us at{' '}
                  <Link href="/contact" className="text-cyan-400 hover:text-cyan-300">
                    billing@avatar-g.com
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
