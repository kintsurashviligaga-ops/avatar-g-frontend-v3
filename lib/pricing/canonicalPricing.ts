// Canonical pricing config for Avatar G
// All plans, prices, and features are defined here and imported by all pricing components

export const PRICING_PLANS = [
  {
    name: 'Free',
    price: 0,
    currency: 'USD',
    monthly: true,
    description: 'For exploration and basic testing.',
    features: [
      '100 credits/month',
      '1 avatar',
      '5 videos/month',
      '5 tracks/month',
      'Basic chat agent',
      'Community support'
    ],
    cta: 'Start Free',
    popular: false,
    gradient: 'from-gray-500 to-gray-600',
  },
  {
    name: 'Pro',
    price: 39,
    currency: 'USD',
    monthly: true,
    description: 'For creators and growing teams with regular output.',
    features: [
      '1,000 credits/month',
      'Unlimited avatars',
      'Unlimited videos',
      'Unlimited tracks',
      '3 voice slots',
      'Advanced agents',
      'Priority processing',
      'Email support'
    ],
    cta: 'Upgrade to Pro',
    popular: true,
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    name: 'Business',
    price: 150,
    currency: 'USD',
    monthly: true,
    description: 'For organizations needing policy controls and support SLAs.',
    features: [
      '5,000 credits/month',
      'Unlimited everything',
      'Avatar G Agent (Premium)',
      'Multi-agent orchestration',
      'Custom voice cloning',
      'API access',
      'White-label options',
      'Priority support + Slack'
    ],
    cta: 'Contact Sales',
    popular: false,
    gradient: 'from-purple-500 to-pink-600',
  },
  {
    name: 'Enterprise',
    price: 500,
    currency: 'USD',
    monthly: true,
    description: 'For large enterprises with custom needs and dedicated support.',
    features: [
      'Unlimited credits',
      'Dedicated account manager',
      'Custom integrations',
      'Enterprise SLAs',
      'On-premise options',
      '24/7 support',
      'Custom security & compliance',
      'All Business features'
    ],
    cta: 'Contact Enterprise',
    popular: false,
    gradient: 'from-yellow-500 to-orange-600',
  }
];
