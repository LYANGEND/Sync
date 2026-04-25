import { useEffect, useCallback } from 'react';
import { useBadge, usePeriodicSync, useSWMessages } from '../../hooks/usePWA';
import { toast } from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

/**
 * PWA Manager Component
 * Handles badge updates, periodic sync registration, and SW message handling
 * Should be mounted once at the app root level
 */
export const PWAManager: React.FC = () => {
    const { isAuthenticated, isLoading } = useAuth();
    const { setBadge } = useBadge();
    const { registerPeriodicSync } = usePeriodicSync();

    // Fetch and set notification badge on mount
    const updateNotificationBadge = useCallback(async () => {
        if (!isAuthenticated) {
            await setBadge(0);
            return;
        }

        try {
            const response = await api.get('/communication/notifications/unread-count');
            const count = response.data?.count || 0;
            await setBadge(count);
        } catch (error: any) {
            const status = error.response?.status;
            if (status !== 401 && status !== 403) {
                console.log('Could not fetch notification count');
            }
        }
    }, [isAuthenticated, setBadge]);

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
        if (isLoading) {
            return;
        }

        if (!isAuthenticated) {
            setBadge(0);
            return;
        }

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
    }, [isAuthenticated, isLoading, setBadge, updateNotificationBadge, setupPeriodicSync]);

    // No UI - this is a manager component
    return null;
};

export default PWAManager;
