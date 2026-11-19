import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import { TOOL_CONTRACTS } from '@/lib/editor/toolContracts';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  try {
    res.status(200).json({
      sessionId: uuidv4(),
      toolContracts: TOOL_CONTRACTS,
      createdAt: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ message: 'Could not create an AI session.' });
  }
}
