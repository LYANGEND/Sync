import React, { useState, useRef, useCallback, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
    children: ReactNode;
    onRefresh: () => Promise<void>;
    className?: string;
    threshold?: number;
    disabled?: boolean;
}

/**
 * Pull-to-Refresh Component
 * Native-feeling pull gesture to refresh content
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({
    children,
    onRefresh,
    className = '',
    threshold = 80,
    disabled = false,
}) => {
    const [pulling, setPulling] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const currentY = useRef(0);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (disabled || refreshing) return;

        const scrollTop = containerRef.current?.scrollTop || 0;
        if (scrollTop > 0) return; // Only trigger at top

        startY.current = e.touches[0].clientY;
        setPulling(true);
    }, [disabled, refreshing]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!pulling || disabled || refreshing) return;

        const scrollTop = containerRef.current?.scrollTop || 0;
        if (scrollTop > 0) {
            setPulling(false);
            setPullDistance(0);
            return;
        }

        currentY.current = e.touches[0].clientY;
        const distance = Math.max(0, currentY.current - startY.current);

        // Apply resistance curve
        const resistance = Math.min(distance * 0.4, threshold * 1.5);
        setPullDistance(resistance);
    }, [pulling, disabled, refreshing, threshold]);

    const handleTouchEnd = useCallback(async () => {
        if (!pulling || disabled) return;

        setPulling(false);

        if (pullDistance >= threshold) {
            setRefreshing(true);

            // Haptic feedback if available
            if ('vibrate' in navigator) {
                navigator.vibrate(10);
            }

            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
            }
        }

        setPullDistance(0);
    }, [pulling, pullDistance, threshold, onRefresh, disabled]);

    const indicatorOpacity = Math.min(pullDistance / threshold, 1);
    const indicatorScale = 0.5 + (indicatorOpacity * 0.5);
    const shouldTrigger = pullDistance >= threshold;

    return (
        <div
            ref={containerRef}
            className={`relative overflow-auto ${className}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull Indicator */}
            <div
                className="absolute left-0 right-0 flex justify-center items-center pointer-events-none z-50 transition-transform duration-200"
                style={{
                    top: -40,
                    transform: `translateY(${pullDistance}px)`,
                }}
            >
                <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${shouldTrigger ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 shadow-lg border border-gray-100'
                        }`}
                    style={{
                        opacity: indicatorOpacity,
                        transform: `scale(${indicatorScale})`,
                    }}
                >
                    <RefreshCw
                        size={20}
                        className={`transition-transform duration-300 ${refreshing ? 'animate-spin' : ''}`}
                        style={{
                            transform: `rotate(${pullDistance * 3}deg)`,
                        }}
                    />
                </div>
            </div>

            {/* Refreshing Banner */}
            {refreshing && (
                <div className="sticky top-0 left-0 right-0 bg-blue-600 text-white py-2 px-4 text-center text-sm font-medium z-40 flex items-center justify-center gap-2">
                    <RefreshCw size={14} className="animate-spin" />
                    Refreshing...
                </div>
            )}

            {/* Content */}
            <div
                style={{
                    transform: pulling ? `translateY(${pullDistance}px)` : 'translateY(0)',
                    transition: pulling ? 'none' : 'transform 0.3s ease-out',
                }}
            >
                {children}
            </div>
        </div>
    );
};

export default PullToRefresh;
