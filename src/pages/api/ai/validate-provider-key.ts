import type { NextApiRequest, NextApiResponse } from 'next';
import { validateProviderConfig } from '@/lib/ai/providerAdapters';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  try {
    const config: unknown = req.body?.providerConfig;

    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      res.status(400).json({ ok: false, message: 'providerConfig is required' });
      return;
    }

    const { provider, apiKey, model } = config as Record<string, unknown>;

    if (provider !== 'anthropic' && provider !== 'gemini') {
      res.status(400).json({ ok: false, message: 'provider must be "anthropic" or "gemini"' });
      return;
    }

    if (typeof apiKey !== 'string' || apiKey.length > 512) {
      res.status(400).json({ ok: false, message: 'apiKey must be a string of at most 512 characters' });
      return;
    }

    if (model !== undefined && (typeof model !== 'string' || model.length > 200)) {
      res.status(400).json({ ok: false, message: 'model must be a string of at most 200 characters' });
      return;
    }

    // The result only ever contains ok / verified / message, never the key.
    const result = await validateProviderConfig({ provider, apiKey, model: model ?? '' });
    res.status(200).json(result);
  } catch {
    res.status(500).json({ ok: false, message: 'Key verification failed unexpectedly.' });
  }
}
