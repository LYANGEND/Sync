import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  subscribeToPush,
  unsubscribeFromPush,
  getVapidPublicKey,
} from '../services/pushService';

const router = Router();

// Get VAPID public key (public endpoint)
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }
  return res.json({ publicKey: key });
});

// Subscribe to push notifications
router.post('/subscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { subscription } = req.body;
    const userId = req.user!.id;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    await subscribeToPush(userId, subscription);
    return res.json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint required' });
    }

    await unsubscribeFromPush(endpoint);
    return res.json({ success: true, message: 'Unsubscribed from push notifications' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

export default router;
