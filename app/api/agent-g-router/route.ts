import { NextApiRequest, NextApiResponse } from 'next';

interface AgentGResponse {
  intent: string;
  selected_service: string;
  confidence: number;
  suggested_next_actions: string[];
  ui_hints: AgentGuiHints;
}

interface AgentGuiHints {
  highlight?: string;
}

const classifyIntent = (input: string): AgentGResponse => {
  // Placeholder logic for intent classification
  if (input.includes('pricing')) {
    return {
      intent: 'pricing_inquiry',
      selected_service: 'pricing',
      confidence: 0.95,
      suggested_next_actions: ['view_pricing', 'contact_support'],
      ui_hints: { highlight: 'pricing' },
    };
  }

  return {
    intent: 'unknown',
    selected_service: '',
    confidence: 0.5,
    suggested_next_actions: ['help_center', 'contact_support'],
    ui_hints: {},
  };
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { input } = req.body;

    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const response = classifyIntent(input);
    return res.status(200).json(response);
  }

  res.setHeader('Allow', ['POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}