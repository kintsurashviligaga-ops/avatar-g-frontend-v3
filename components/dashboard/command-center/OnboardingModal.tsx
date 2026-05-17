'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Sparkles } from 'lucide-react';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (prefillPrompt?: string) => void;
}

const EXAMPLE_PROMPTS = [
  'ლომის სურათი ღამის ცაზე 🦁',
  'ქართული ხალხური მუსიკა 🎻',
  '5 Instagram post ჩემი ბიზნესისთვის 📱',
  'Avatar რომელიც ჩემს სახელს ამბობს 🎤',
];

const FEATURES = [
  { emoji: '🎨', label: 'სურათი', desc: 'AI-ით შექმენი ნებისმიერი სახის სურათი' },
  { emoji: '🎬', label: 'ვიდეო', desc: 'ტექსტიდან — მოძრავი ვიდეო წამებში' },
  { emoji: '🎵', label: 'მუსიკა', desc: 'ორიგინალური ტრეკი ნებისმიერ ჟანრში' },
  { emoji: '🧑', label: 'ავატარი', desc: 'შენი AI წარმომადგენელი — ხმა + სახე' },
];

const STEP_VARIANTS = {
  enter: (dir: number) => ({
    x: dir > 0 ? 64 : -64,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 340, damping: 30 },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -64 : 64,
    opacity: 0,
    transition: { duration: 0.18 },
  }),
};

export default function OnboardingModal({ open, onClose, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const TOTAL_STEPS = 3;

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep(0);
      setDir(1);
      setSelectedPrompt(null);
    }
  }, [open]);

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setDir(1);
      setStep(s => s + 1);
    } else {
      finish();
    }
  };

  const goPrev = () => {
    if (step > 0) {
      setDir(-1);
      setStep(s => s - 1);
    }
  };

  const finish = () => {
    localStorage.setItem('agentg_onboarded', '1');
    onComplete(selectedPrompt ?? undefined);
  };

  const skip = () => {
    localStorage.setItem('agentg_onboarded', '1');
    onClose();
  };

  const handlePromptClick = (p: string) => {
    setSelectedPrompt(p);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ob-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="ob-modal"
            initial={{ scale: 0.9, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            {/* Skip button */}
            <button className="ob-skip-btn" onClick={skip} aria-label="Skip onboarding">
              <X size={16} />
            </button>

            {/* Steps container */}
            <div className="ob-steps-wrap">
              <AnimatePresence mode="wait" custom={dir}>
                {step === 0 && (
                  <motion.div
                    key="step0"
                    className="ob-step"
                    custom={dir}
                    variants={STEP_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    {/* Orb */}
                    <div className="ob-orb-wrap">
                      <motion.div
                        className="ob-orb"
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                      >
                        <span className="ob-orb-inner">G</span>
                        <div className="ob-orb-ring ob-orb-ring--1" />
                        <div className="ob-orb-ring ob-orb-ring--2" />
                      </motion.div>
                    </div>
                    <h2 className="ob-title">გამარჯობა! 👋 მე ვარ Agent G</h2>
                    <p className="ob-subtitle">შენი AI შემოქმედი</p>
                    <p className="ob-desc">
                      ერთი პლათფორმა — სურათები, ვიდეო, მუსიკა, ავატარი და ბევრი სხვა.
                      მოდი, ვაჩვენო!
                    </p>
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div
                    key="step1"
                    className="ob-step"
                    custom={dir}
                    variants={STEP_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <div className="ob-step-icon-wrap">
                      <Sparkles size={28} className="ob-step-icon" />
                    </div>
                    <h2 className="ob-title">რა შეგიძლია შექმნა?</h2>
                    <p className="ob-subtitle">ყველაფერი ერთ ადგილას</p>
                    <div className="ob-features">
                      {FEATURES.map((f, i) => (
                        <motion.div
                          key={f.label}
                          className="ob-feature-card"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.07 }}
                        >
                          <span className="ob-feature-emoji">{f.emoji}</span>
                          <div className="ob-feature-text">
                            <div className="ob-feature-label">{f.label}</div>
                            <div className="ob-feature-desc">{f.desc}</div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    className="ob-step"
                    custom={dir}
                    variants={STEP_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <div className="ob-step-icon-wrap">
                      <span style={{ fontSize: 28 }}>🚀</span>
                    </div>
                    <h2 className="ob-title">სცადე ახლავე!</h2>
                    <p className="ob-subtitle">აირჩიე მზა prompt ან დაიწყე საკუთარი</p>
                    <div className="ob-prompts">
                      {EXAMPLE_PROMPTS.map((p, i) => (
                        <motion.button
                          key={p}
                          className={`ob-prompt-btn${selectedPrompt === p ? ' ob-prompt-btn--active' : ''}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.07 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handlePromptClick(p)}
                        >
                          {p}
                        </motion.button>
                      ))}
                    </div>
                    {selectedPrompt && (
                      <motion.p
                        className="ob-selected-hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        ✓ &ldquo;{selectedPrompt.slice(0, 30)}...&rdquo; შეირჩა
                      </motion.p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Progress dots */}
            <div className="ob-dots">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <motion.div
                  key={i}
                  className="ob-dot"
                  animate={{
                    width: i === step ? 20 : 8,
                    background: i === step ? '#00d4ff' : 'rgba(255,255,255,0.18)',
                  }}
                  transition={{ duration: 0.25 }}
                />
              ))}
            </div>

            {/* Footer actions */}
            <div className="ob-footer">
              {step > 0 ? (
                <button className="ob-back-btn" onClick={goPrev}>
                  ← უკან
                </button>
              ) : (
                <div />
              )}

              <div className="ob-footer-right">
                <button className="ob-skip-link" onClick={skip}>
                  გამოტოვება
                </button>
                <motion.button
                  className="ob-next-btn"
                  whileTap={{ scale: 0.96 }}
                  onClick={goNext}
                >
                  {step < TOTAL_STEPS - 1 ? (
                    <>შემდეგი <ChevronRight size={16} /></>
                  ) : (
                    'დაწყება 🚀'
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>

          <style jsx>{`
            .ob-overlay {
              position: fixed;
              inset: 0;
              z-index: 3000;
              background: rgba(0, 0, 0, 0.75);
              backdrop-filter: blur(8px);
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 16px;
            }
            .ob-modal {
              position: relative;
              background: rgba(10, 10, 18, 0.97);
              border: 1px solid rgba(0, 212, 255, 0.2);
              border-radius: 24px;
              padding: 36px 32px 28px;
              width: 100%;
              max-width: 480px;
              box-shadow: 0 0 60px rgba(0, 212, 255, 0.08), 0 0 0 1px rgba(0, 212, 255, 0.06), 0 32px 80px rgba(0, 0, 0, 0.7);
              overflow: hidden;
            }
            .ob-skip-btn {
              position: absolute;
              top: 16px;
              right: 16px;
              background: rgba(255, 255, 255, 0.08);
              border: none;
              border-radius: 8px;
              padding: 7px;
              cursor: pointer;
              color: #888;
              display: flex;
              align-items: center;
              transition: background 0.15s, color 0.15s;
              z-index: 2;
            }
            .ob-skip-btn:hover {
              background: rgba(255, 255, 255, 0.15);
              color: #fff;
            }
            .ob-steps-wrap {
              min-height: 320px;
              display: flex;
              align-items: flex-start;
              overflow: hidden;
            }
            .ob-step {
              width: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              gap: 10px;
            }

            /* Orb — Step 1 */
            .ob-orb-wrap {
              position: relative;
              width: 100px;
              height: 100px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 8px;
            }
            .ob-orb {
              position: relative;
              width: 80px;
              height: 80px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .ob-orb-inner {
              position: relative;
              z-index: 2;
              width: 72px;
              height: 72px;
              border-radius: 50%;
              background: linear-gradient(135deg, #00d4ff, #7c3aed, #a855f7);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 30px;
              font-weight: 800;
              color: #fff;
              box-shadow: 0 0 32px rgba(0, 212, 255, 0.45), 0 0 64px rgba(124, 58, 237, 0.2);
            }
            .ob-orb-ring {
              position: absolute;
              border-radius: 50%;
              border: 1px solid rgba(0, 212, 255, 0.25);
              animation: ob-pulse 3s ease-in-out infinite;
            }
            .ob-orb-ring--1 {
              inset: -8px;
              animation-delay: 0s;
            }
            .ob-orb-ring--2 {
              inset: -18px;
              border-color: rgba(0, 212, 255, 0.12);
              animation-delay: 0.6s;
            }
            @keyframes ob-pulse {
              0%, 100% { opacity: 0.4; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.04); }
            }

            /* Step icon — Steps 2 & 3 */
            .ob-step-icon-wrap {
              width: 64px;
              height: 64px;
              border-radius: 18px;
              background: rgba(0, 212, 255, 0.08);
              border: 1px solid rgba(0, 212, 255, 0.2);
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 8px;
            }
            .ob-step-icon {
              color: #00d4ff;
            }

            .ob-title {
              font-size: 22px;
              font-weight: 800;
              color: #e8e8ff;
              margin: 0;
              line-height: 1.25;
            }
            .ob-subtitle {
              font-size: 14px;
              color: #22d3ee;
              margin: 0;
              font-weight: 500;
            }
            .ob-desc {
              font-size: 14px;
              color: #888;
              line-height: 1.6;
              max-width: 340px;
              margin: 4px 0 0;
            }

            /* Features grid */
            .ob-features {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
              width: 100%;
              margin-top: 8px;
              text-align: left;
            }
            .ob-feature-card {
              background: rgba(255, 255, 255, 0.04);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 14px;
              padding: 14px 12px;
              display: flex;
              align-items: flex-start;
              gap: 10px;
              transition: border-color 0.15s, background 0.15s;
            }
            .ob-feature-card:hover {
              border-color: rgba(0, 212, 255, 0.25);
              background: rgba(0, 212, 255, 0.04);
            }
            .ob-feature-emoji {
              font-size: 22px;
              line-height: 1;
              flex-shrink: 0;
            }
            .ob-feature-label {
              font-size: 13px;
              font-weight: 700;
              color: #e0e0ff;
              margin-bottom: 3px;
            }
            .ob-feature-desc {
              font-size: 11px;
              color: #888;
              line-height: 1.4;
            }

            /* Prompt buttons */
            .ob-prompts {
              display: flex;
              flex-direction: column;
              gap: 8px;
              width: 100%;
              margin-top: 8px;
            }
            .ob-prompt-btn {
              width: 100%;
              text-align: left;
              background: rgba(255, 255, 255, 0.04);
              border: 1px solid rgba(255, 255, 255, 0.09);
              border-radius: 12px;
              padding: 11px 14px;
              font-size: 13px;
              color: #c0c0e0;
              cursor: pointer;
              transition: border-color 0.15s, background 0.15s, color 0.15s;
              line-height: 1.4;
            }
            .ob-prompt-btn:hover {
              border-color: rgba(0, 212, 255, 0.35);
              background: rgba(0, 212, 255, 0.06);
              color: #e8fffe;
            }
            .ob-prompt-btn--active {
              border-color: rgba(0, 212, 255, 0.6) !important;
              background: rgba(0, 212, 255, 0.1) !important;
              color: #e8fffe !important;
            }
            .ob-selected-hint {
              font-size: 12px;
              color: #6ee7b7;
              margin: 2px 0 0;
            }

            /* Dots */
            .ob-dots {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              margin: 24px 0 20px;
            }
            .ob-dot {
              height: 8px;
              border-radius: 4px;
              flex-shrink: 0;
            }

            /* Footer */
            .ob-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
            }
            .ob-footer-right {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .ob-back-btn {
              background: none;
              border: none;
              color: #666;
              font-size: 14px;
              cursor: pointer;
              padding: 0;
              transition: color 0.15s;
            }
            .ob-back-btn:hover { color: #aaa; }
            .ob-skip-link {
              background: none;
              border: none;
              color: #666;
              font-size: 13px;
              cursor: pointer;
              padding: 0;
              transition: color 0.15s;
            }
            .ob-skip-link:hover { color: #aaa; }
            .ob-next-btn {
              display: flex;
              align-items: center;
              gap: 6px;
              background: linear-gradient(135deg, #06b6d4, #7c3aed);
              border: none;
              border-radius: 12px;
              padding: 11px 22px;
              font-size: 14px;
              font-weight: 700;
              color: #fff;
              cursor: pointer;
              transition: opacity 0.15s, box-shadow 0.15s, transform 0.1s;
              box-shadow: 0 0 20px rgba(0, 212, 255, 0.25), 0 0 40px rgba(124, 58, 237, 0.15);
            }
            .ob-next-btn:hover {
              opacity: 0.92;
              transform: translateY(-1px);
              box-shadow: 0 0 30px rgba(0, 212, 255, 0.4), 0 0 60px rgba(124, 58, 237, 0.2);
            }

            @media (max-width: 400px) {
              .ob-modal { padding: 28px 20px 22px; }
              .ob-features { grid-template-columns: 1fr; }
              .ob-title { font-size: 18px; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
