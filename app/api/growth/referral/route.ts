import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { userId, referralCode } = req.body;

    if (!userId || !referralCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Placeholder logic for handling referral
    console.log(`User ${userId} used referral code ${referralCode}`);

    return res.status(200).json({ message: 'Referral recorded successfully' });
  }

  res.setHeader('Allow', ['POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}