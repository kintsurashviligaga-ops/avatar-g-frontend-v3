'use client';

import React from 'react';
import { X, Zap, Star, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UpgradeModalProps {
  open: boolean;
  creditsNeeded?: number;
  currentCredits?: number;
  onClose: () => void;
}

const PLANS = [
  {
    id: 'starter',
    name: 'სტარტერი',
    nameEn: 'Starter',
    credits: 500,
    price: '₾9',
    period: '/თვე',
    icon: <Zap size={20} />,
    color: '#6366f1',
    features: ['500 კრედიტი/თვე', 'სურათი + ხმა + ტექსტი', 'სტანდარტული სიჩქარე'],
    popular: false,
  },
  {
    id: 'pro',
    name: 'პრო',
    nameEn: 'Pro',
    credits: 2000,
    price: '₾29',
    period: '/თვე',
    icon: <Star size={20} />,
    color: '#f59e0b',
    features: ['2,000 კრედიტი/თვე', 'ყველა სერვისი', 'ვიდეო + მუსიკა + ავატარი', 'პრიორიტეტული სიჩქარე', 'პერსონაჟის შენახვა'],
    popular: true,
  },
  {
    id: 'ultimate',
    name: 'ულტიმატური',
    nameEn: 'Ultimate',
    credits: 10000,
    price: '₾89',
    period: '/თვე',
    icon: <Crown size={20} />,
    color: '#ec4899',
    features: ['10,000 კრედიტი/თვე', 'ყველაფერი Pro-ში', 'API წვდომა', '24/7 მხარდაჭერა'],
    popular: false,
  },
];

export default function UpgradeModal({ open, creditsNeeded, currentCredits, onClose }: UpgradeModalProps) {
  const handlePlanClick = (planId: string) => {
    // Open Stripe checkout or pricing page
    window.open(`/pricing?plan=${planId}`, '_blank');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="um-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="um-modal"
            initial={{ scale: 0.88, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="um-header">
              <div className="um-header-inner">
                <div className="um-zap-badge">
                  <Zap size={18} fill="currentColor" />
                </div>
                <div>
                  <h2 className="um-title">კრედიტები ამოიწურა</h2>
                  {creditsNeeded !== undefined && currentCredits !== undefined && (
                    <p className="um-sub">
                      გჭირდებათ {creditsNeeded} კრედიტი · გაქვთ {currentCredits}
                    </p>
                  )}
                </div>
              </div>
              <button className="um-close" onClick={onClose}><X size={18} /></button>
            </div>

            {/* Plans */}
            <div className="um-plans">
              {PLANS.map((plan, i) => (
                <motion.div
                  key={plan.id}
                  className={`um-plan ${plan.popular ? 'um-plan--popular' : ''}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.06 }}
                  style={{ '--plan-color': plan.color } as React.CSSProperties}
                >
                  {plan.popular && (
                    <div className="um-popular-badge">პოპულარული</div>
                  )}
                  <div className="um-plan-top">
                    <div className="um-plan-icon" style={{ color: plan.color, background: `${plan.color}22` }}>
                      {plan.icon}
                    </div>
                    <div>
                      <div className="um-plan-name">{plan.name}</div>
                      <div className="um-plan-credits">{plan.credits.toLocaleString()} კრედიტი</div>
                    </div>
                    <div className="um-plan-price">
                      {plan.price}<span className="um-plan-period">{plan.period}</span>
                    </div>
                  </div>
                  <ul className="um-features">
                    {plan.features.map(f => (
                      <li key={f} className="um-feature">
                        <span className="um-check">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <motion.button
                    className="um-plan-btn"
                    style={{ background: plan.popular ? plan.color : 'rgba(255,255,255,0.08)' }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handlePlanClick(plan.id)}
                  >
                    {plan.popular ? 'Pro-ს გააქტიურება' : `${plan.name} Plan`}
                  </motion.button>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <p className="um-footer">
              გამოწერა შეიძლება გაუქმდეს ნებისმიერ დროს · უსაფრთხო გადახდა Stripe-ით
            </p>
          </motion.div>

          <style jsx>{`
            .um-overlay {
              position: fixed; inset: 0; z-index: 2000;
              background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
              display: flex; align-items: center; justify-content: center;
              padding: 16px; overflow-y: auto;
            }
            .um-modal {
              background: linear-gradient(145deg, #12122a, #1a1a3e);
              border: 1px solid rgba(99,102,241,0.25);
              border-radius: 20px; padding: 28px;
              width: 100%; max-width: 680px;
              box-shadow: 0 24px 80px rgba(0,0,0,0.5);
            }
            .um-header {
              display: flex; align-items: flex-start; justify-content: space-between;
              margin-bottom: 24px; gap: 12px;
            }
            .um-header-inner { display: flex; align-items: center; gap: 14px; }
            .um-zap-badge {
              width: 44px; height: 44px; border-radius: 12px;
              background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.3);
              display: flex; align-items: center; justify-content: center;
              color: #818cf8; flex-shrink: 0;
            }
            .um-title { font-size: 18px; font-weight: 700; color: #e0e0ff; margin: 0 0 4px; }
            .um-sub { font-size: 13px; color: #888; margin: 0; }
            .um-close {
              background: rgba(255,255,255,0.08); border: none; border-radius: 10px;
              padding: 8px; cursor: pointer; color: #aaa; display: flex;
              flex-shrink: 0; transition: background 0.15s, color 0.15s;
            }
            .um-close:hover { background: rgba(255,255,255,0.15); color: #fff; }
            .um-plans {
              display: grid; grid-template-columns: repeat(3, 1fr);
              gap: 12px; margin-bottom: 20px;
            }
            @media (max-width: 580px) {
              .um-plans { grid-template-columns: 1fr; }
            }
            .um-plan {
              border: 1px solid rgba(255,255,255,0.08);
              border-radius: 14px; padding: 16px;
              position: relative; overflow: hidden;
              transition: border-color 0.2s;
            }
            .um-plan--popular {
              border-color: rgba(245,158,11,0.4);
              background: rgba(245,158,11,0.04);
            }
            .um-popular-badge {
              position: absolute; top: 10px; right: -18px;
              background: #f59e0b; color: #000;
              font-size: 10px; font-weight: 700;
              padding: 3px 24px; transform: rotate(15deg);
              letter-spacing: 0.06em; text-transform: uppercase;
            }
            .um-plan-top {
              display: flex; align-items: center; gap: 10px;
              margin-bottom: 12px;
            }
            .um-plan-icon {
              width: 36px; height: 36px; border-radius: 10px;
              display: flex; align-items: center; justify-content: center;
              flex-shrink: 0;
            }
            .um-plan-name { font-weight: 600; color: #e0e0ff; font-size: 14px; }
            .um-plan-credits { font-size: 11px; color: #666; margin-top: 2px; }
            .um-plan-price {
              margin-left: auto; font-size: 18px; font-weight: 700;
              color: #e0e0ff; white-space: nowrap; flex-shrink: 0;
            }
            .um-plan-period { font-size: 11px; color: #666; font-weight: 400; }
            .um-features { list-style: none; padding: 0; margin: 0 0 14px; }
            .um-feature {
              font-size: 12px; color: #aaa; padding: 3px 0;
              display: flex; align-items: center; gap: 6px;
            }
            .um-check { color: #4ade80; font-size: 11px; flex-shrink: 0; }
            .um-plan-btn {
              width: 100%; padding: 9px; border: none;
              border-radius: 9px; font-size: 13px; font-weight: 600;
              cursor: pointer; color: #fff; transition: opacity 0.15s;
            }
            .um-plan-btn:hover { opacity: 0.85; }
            .um-footer {
              font-size: 11px; color: #555; text-align: center; margin: 0;
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
