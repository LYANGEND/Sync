import { runScheduledCollection, reconcileCampaignPayments } from '../services/debtCollectionService';

/**
 * Simple interval-based scheduler for debt collection.
 * Runs daily at the configured time.
 * 
 * In production, consider using node-cron or BullMQ for more robust scheduling.
 * This uses setInterval for zero-dependency simplicity.
 */

let isRunning = false;

async function runDailyTasks() {
  if (isRunning) {
    console.log('[Scheduler] Previous run still in progress, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`[Scheduler] Starting daily tasks at ${new Date().toISOString()}`);

    // 1. Run automated debt collection (sends reminders based on escalation rules)
    await runScheduledCollection();

    // 2. Reconcile payments (detect which contacted debtors have paid)
    const reconciled = await reconcileCampaignPayments();
    if (reconciled > 0) {
      console.log(`[Scheduler] Reconciled ${reconciled} campaign payments`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Scheduler] Daily tasks completed in ${elapsed}s`);
  } catch (error) {
    console.error('[Scheduler] Daily tasks failed:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Initialize the scheduler — called from server.ts
 */
export function initScheduler() {
  // Run at 8:00 AM daily (check every hour, only execute if it's 8 AM)
  const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
  const TARGET_HOUR = 8; // 8 AM

  let lastRunDate = '';

  setInterval(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Only run once per day at the target hour
    if (now.getHours() === TARGET_HOUR && lastRunDate !== todayStr) {
      lastRunDate = todayStr;
      runDailyTasks();
    }
  }, CHECK_INTERVAL);

  console.log(`[Scheduler] Initialized — debt collection runs daily at ${TARGET_HOUR}:00`);

  // Also run reconciliation every 6 hours (to detect payments quickly)
  setInterval(async () => {
    try {
      await reconcileCampaignPayments();
    } catch (error) {
      console.error('[Scheduler] Reconciliation failed:', error);
    }
  }, 6 * 60 * 60 * 1000);
}
