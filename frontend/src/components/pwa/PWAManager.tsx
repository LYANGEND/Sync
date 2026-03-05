import { useEffect, useCallback } from 'react';
import { useBadge, usePeriodicSync, useSWMessages } from '../../hooks/usePWA';
import { toast } from 'react-hot-toast';
import api from '../../utils/api';

/**
 * PWA Manager Component
 * Handles badge updates, periodic sync registration, and SW message handling
 * Should be mounted once at the app root level
 */
export const PWAManager: React.FC = () => {
    const { setBadge } = useBadge();
    const { registerPeriodicSync } = usePeriodicSync();

    // Fetch and set notification badge on mount
    const updateNotificationBadge = useCallback(async () => {
        try {
            const response = await api.get('/communication/notifications/unread-count');
            const count = response.data?.count || 0;
            await setBadge(count);
        } catch (error) {
            // Silently fail - notifications might not be critical
            console.log('Could not fetch notification count');
        }
    }, [setBadge]);

    // Register periodic sync for data refresh
    const setupPeriodicSync = useCallback(async () => {
        try {
            // Sync student data every 12 hours
            await registerPeriodicSync('sync-student-data', 12 * 60 * 60 * 1000);

            // Sync notifications every 1 hour
            await registerPeriodicSync('sync-notifications', 60 * 60 * 1000);
        } catch (error) {
            console.log('Periodic sync not available');
        }
    }, [registerPeriodicSync]);

    // Handle messages from service worker
    const handleSWMessage = useCallback((data: any) => {
        switch (data.type) {
            case 'SYNC_SUCCESS':
                // A failed request was successfully replayed
                toast.success('Your request was synced successfully!', {
                    icon: '🔄',
                    duration: 4000,
                });
                break;

            case 'DATA_REFRESHED':
                // Data was refreshed in background
                console.log('Data refreshed in background');
                break;

            default:
                break;
        }
    }, []);

    // Listen to SW messages
    useSWMessages(handleSWMessage);

    // Initialize on mount
    useEffect(() => {
        // Update badge on load
        updateNotificationBadge();

        // Setup periodic sync (only works in installed PWA)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setupPeriodicSync();
        }

        // Update badge periodically while app is open
        const badgeInterval = setInterval(updateNotificationBadge, 5 * 60 * 1000); // Every 5 mins

        return () => {
            clearInterval(badgeInterval);
        };
    }, [updateNotificationBadge, setupPeriodicSync]);

    // No UI - this is a manager component
    return null;
};

export default PWAManager;
