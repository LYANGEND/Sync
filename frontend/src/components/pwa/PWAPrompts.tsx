import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAUpdatePrompt = () => {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(swUrl, r) {
            console.log('SW registered:', swUrl);
            // Check for updates every hour
            if (r) {
                setInterval(() => {
                    r.update();
                }, 60 * 60 * 1000);
            }
        },
        onRegisterError(error) {
            console.error('SW registration error:', error);
        },
    });

    const handleUpdate = () => {
        updateServiceWorker(true);
    };

    const handleDismiss = () => {
        setNeedRefresh(false);
    };

    if (!needRefresh) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[9999] animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-slate-900 text-white rounded-2xl shadow-2xl p-4 flex items-start gap-4">
                <div className="bg-blue-600 p-2 rounded-xl shrink-0">
                    <RefreshCw size={20} />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm mb-1">Update Available</h4>
                    <p className="text-slate-300 text-xs leading-relaxed">
                        A new version of Sync is ready. Refresh to get the latest features and improvements.
                    </p>
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={handleUpdate}
                            className="bg-primary hover:bg-primary-hover text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                        >
                            Update Now
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                            Later
                        </button>
                    </div>
                </div>
                <button
                    onClick={handleDismiss}
                    className="text-slate-400 hover:text-white transition-colors shrink-0"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};

export const PWAInstallPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;

        if (isIOSDevice && !isInStandaloneMode) {
            // Check if user has dismissed before (store in localStorage)
            const dismissed = localStorage.getItem('pwa-install-dismissed');
            if (!dismissed) {
                setIsIOS(true);
                setShowPrompt(true);
            }
        }

        // Listen for beforeinstallprompt event (Android/Desktop)
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);

            const dismissed = localStorage.getItem('pwa-install-dismissed');
            if (!dismissed) {
                setShowPrompt(true);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstall = async () => {
        if (deferredPrompt) {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setShowPrompt(false);
            }
            setDeferredPrompt(null);
        }
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', 'true');
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[9998] animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 flex items-start gap-4">
                <div className="bg-blue-100 text-blue-600 p-2 rounded-xl shrink-0">
                    <Download size={20} />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm text-slate-900 mb-1">Install Sync App</h4>
                    {isIOS ? (
                        <p className="text-slate-500 text-xs leading-relaxed">
                            Tap the <strong>Share</strong> button, then <strong>"Add to Home Screen"</strong> for a better experience.
                        </p>
                    ) : (
                        <p className="text-slate-500 text-xs leading-relaxed">
                            Install Sync on your device for quick access and offline support.
                        </p>
                    )}
                    <div className="flex gap-2 mt-3">
                        {!isIOS && (
                            <button
                                onClick={handleInstall}
                                className="bg-primary hover:bg-primary-hover text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                            >
                                Install
                            </button>
                        )}
                        <button
                            onClick={handleDismiss}
                            className="bg-slate-100 hover:bg-surface-hover-strong text-slate-600 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                            {isIOS ? 'Got it' : 'Not now'}
                        </button>
                    </div>
                </div>
                <button
                    onClick={handleDismiss}
                    className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};

export default PWAUpdatePrompt;
