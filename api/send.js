import { send } from '../lib/api-handlers.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  return send(req, res);
}
