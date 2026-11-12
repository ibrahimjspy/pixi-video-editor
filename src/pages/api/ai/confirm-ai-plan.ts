import type { NextApiRequest, NextApiResponse } from 'next';
import { reviewAiPlan } from '@/lib/ai/planner';
import { AiPlan } from '@/types/editor';

type UnknownRecord = Record<string, unknown>;

/** Checks the fields reviewAiPlan reads; each action is re-validated there. */
const isPlanLike = (value: unknown): value is AiPlan => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const plan = value as UnknownRecord;

  return (
    typeof plan.summary === 'string' &&
    Array.isArray(plan.actions) &&
    plan.actions.length <= 200 &&
    Array.isArray(plan.warnings) &&
    plan.warnings.every((warning) => typeof warning === 'string')
  );
};

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
    const plan: unknown = req.body?.plan;

    if (!isPlanLike(plan)) {
      res.status(400).json({ message: 'plan is missing or malformed' });
      return;
    }

    res.status(200).json(reviewAiPlan(plan));
  } catch {
    res.status(500).json({ message: 'Plan review failed unexpectedly.' });
  }
}
