import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribedToPush,
} from '../utils/pushNotifications';

export const PushNotificationToggle: React.FC = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      const supported = isPushSupported();
      setIsSupported(supported);

      if (supported) {
        setPermission(getNotificationPermission());
        const subscribed = await isSubscribedToPush();
        setIsSubscribed(subscribed);
      }
      setIsLoading(false);
    };

    checkStatus();
  }, []);

  const handleToggle = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isSubscribed) {
        await unsubscribeFromPush();
        setIsSubscribed(false);
      } else {
        await subscribeToPush();
        setIsSubscribed(true);
        setPermission('granted');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notification settings');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
        <BellOff className="text-gray-400" size={20} />
        <div>
          <p className="text-sm font-medium text-gray-700">Push Notifications</p>
          <p className="text-xs text-gray-500">Not supported in this browser</p>
        </div>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
        <BellOff className="text-red-400" size={20} />
        <div>
          <p className="text-sm font-medium text-red-700">Notifications Blocked</p>
          <p className="text-xs text-red-500">
            Enable notifications in your browser settings
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 bg-white border rounded-lg">
      <div className="flex items-center gap-3">
        {isSubscribed ? (
          <Bell className="text-indigo-600" size={20} />
        ) : (
          <BellOff className="text-gray-400" size={20} />
        )}
        <div>
          <p className="text-sm font-medium text-gray-700">Push Notifications</p>
          <p className="text-xs text-gray-500">
            {isSubscribed ? 'You will receive notifications' : 'Enable to receive updates'}
          </p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      </div>

      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          isSubscribed ? 'bg-indigo-600' : 'bg-gray-200'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isLoading ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={14} className="animate-spin text-gray-500" />
          </span>
        ) : (
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isSubscribed ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        )}
      </button>
    </div>
  );
};
