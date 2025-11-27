import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Check } from 'lucide-react';
import { syncPendingActions } from '../utils/api';
import { offlineStorage } from '../utils/offlineStorage';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: number; failed: number } | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      setShowBanner(!online);
      
      // Auto-sync when coming back online
      if (online && pendingCount > 0) {
        handleSync();
      }
    };

    const checkPendingActions = async () => {
      const pending = await offlineStorage.getPendingActions();
      setPendingCount(pending.length);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Check pending actions periodically
    checkPendingActions();
    const interval = setInterval(checkPendingActions, 5000);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(interval);
    };
  }, [pendingCount]);

  const handleSync = async () => {
    if (isSyncing || !isOnline) return;
    
    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      const result = await syncPendingActions();
      setSyncResult(result);
      
      // Update pending count
      const pending = await offlineStorage.getPendingActions();
      setPendingCount(pending.length);
      
      // Clear sync result after 3 seconds
      setTimeout(() => setSyncResult(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Don't show anything if online and no pending actions
  if (isOnline && pendingCount === 0 && !syncResult) {
    return null;
  }

  return (
    <>
      {/* Offline Banner */}
      {showBanner && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium z-50 flex items-center justify-center gap-2">
          <WifiOff size={16} />
          <span>You're offline. Changes will sync when you reconnect.</span>
        </div>
      )}

      {/* Status indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        {/* Pending actions badge */}
        {pendingCount > 0 && (
          <div className="bg-white rounded-lg shadow-lg border p-3 flex items-center gap-3">
            <div className={`p-2 rounded-full ${isOnline ? 'bg-green-100' : 'bg-amber-100'}`}>
              {isOnline ? (
                <Wifi size={18} className="text-green-600" />
              ) : (
                <WifiOff size={18} className="text-amber-600" />
              )}
            </div>
            
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'}
              </p>
              <p className="text-xs text-gray-500">
                {isOnline ? 'Ready to sync' : 'Will sync when online'}
              </p>
            </div>

            {isOnline && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="p-2 rounded-lg bg-indigo-100 text-indigo-600 hover:bg-indigo-200 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        )}

        {/* Sync result toast */}
        {syncResult && (
          <div className="mt-2 bg-white rounded-lg shadow-lg border p-3 flex items-center gap-2">
            <Check size={18} className="text-green-600" />
            <span className="text-sm text-gray-700">
              Synced {syncResult.success} {syncResult.success === 1 ? 'change' : 'changes'}
              {syncResult.failed > 0 && `, ${syncResult.failed} failed`}
            </span>
          </div>
        )}
      </div>
    </>
  );
};
