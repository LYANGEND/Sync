import React, { useState, useRef, useCallback, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface TouchListItemProps {
    children: ReactNode;
    onClick?: () => void;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    leftAction?: {
        icon: ReactNode;
        color: string;
        label: string;
    };
    rightAction?: {
        icon: ReactNode;
        color: string;
        label: string;
    };
    showChevron?: boolean;
    className?: string;
}

/**
 * TouchListItem Component
 * Touch-optimized list item with swipe actions
 */
export const TouchListItem: React.FC<TouchListItemProps> = ({
    children,
    onClick,
    onSwipeLeft,
    onSwipeRight,
    leftAction,
    rightAction,
    showChevron = false,
    className = '',
}) => {
    const [swipeX, setSwipeX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const isHorizontalSwipe = useRef<boolean | null>(null);
    const threshold = 80;

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        isHorizontalSwipe.current = null;
        setIsSwiping(true);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isSwiping) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - startX.current;
        const deltaY = currentY - startY.current;

        // Determine direction
        if (isHorizontalSwipe.current === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
            isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
        }

        if (isHorizontalSwipe.current) {
            e.preventDefault();

            // Limit swipe distance
            const maxSwipe = threshold * 1.5;
            const limitedDelta = Math.max(-maxSwipe, Math.min(maxSwipe, deltaX));

            // Only allow valid swipe directions
            if ((deltaX > 0 && leftAction) || (deltaX < 0 && rightAction)) {
                setSwipeX(limitedDelta);
            }
        }
    }, [isSwiping, leftAction, rightAction]);

    const handleTouchEnd = useCallback(() => {
        setIsSwiping(false);

        if (Math.abs(swipeX) >= threshold) {
            if ('vibrate' in navigator) navigator.vibrate(10);

            if (swipeX > 0 && onSwipeLeft) {
                onSwipeLeft();
            } else if (swipeX < 0 && onSwipeRight) {
                onSwipeRight();
            }
        }

        setSwipeX(0);
        isHorizontalSwipe.current = null;
    }, [swipeX, onSwipeLeft, onSwipeRight]);

    const getActionOpacity = (direction: 'left' | 'right') => {
        if (direction === 'left' && swipeX > 0) return Math.min(swipeX / threshold, 1);
        if (direction === 'right' && swipeX < 0) return Math.min(-swipeX / threshold, 1);
        return 0;
    };

    return (
        <div className="relative overflow-hidden">
            {/* Left Action Background */}
            {leftAction && (
                <div
                    className={`absolute inset-y-0 left-0 flex items-center px-6 ${leftAction.color}`}
                    style={{ opacity: getActionOpacity('left'), width: Math.max(swipeX, 0) }}
                >
                    <div className="flex flex-col items-center text-white">
                        {leftAction.icon}
                        <span className="text-[10px] mt-1 font-medium">{leftAction.label}</span>
                    </div>
                </div>
            )}

            {/* Right Action Background */}
            {rightAction && (
                <div
                    className={`absolute inset-y-0 right-0 flex items-center justify-end px-6 ${rightAction.color}`}
                    style={{ opacity: getActionOpacity('right'), width: Math.max(-swipeX, 0) }}
                >
                    <div className="flex flex-col items-center text-white">
                        {rightAction.icon}
                        <span className="text-[10px] mt-1 font-medium">{rightAction.label}</span>
                    </div>
                </div>
            )}

            {/* Content */}
            <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={onClick}
                className={`relative bg-white transition-transform touch-target ${className}`}
                style={{
                    transform: `translateX(${swipeX}px)`,
                    transition: isSwiping ? 'none' : 'transform 0.3s ease-out',
                }}
            >
                <div className="flex items-center min-h-[56px] px-4 py-3 active:bg-gray-50">
                    <div className="flex-1 min-w-0">
                        {children}
                    </div>
                    {showChevron && (
                        <ChevronRight size={20} className="text-gray-400 flex-shrink-0 ml-2" />
                    )}
                </div>
            </div>
        </div>
    );
};

interface TouchListProps {
    children: ReactNode;
    className?: string;
    divided?: boolean;
}

/**
 * TouchList Component
 * Container for touch-optimized list items
 */
export const TouchList: React.FC<TouchListProps> = ({
    children,
    className = '',
    divided = true,
}) => {
    return (
        <div className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 ${className}`}>
            <div className={divided ? 'divide-y divide-gray-100' : ''}>
                {children}
            </div>
        </div>
    );
};

interface EmptyStateProps {
    icon: ReactNode;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

/**
 * EmptyState Component
 * Clean empty state with action
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    action,
}) => {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 mb-4">
                {icon}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-gray-500 mb-4 max-w-xs">{description}</p>
            )}
            {action && (
                <button
                    onClick={action.onClick}
                    className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl active:scale-95 transition-transform"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
};

export default TouchListItem;
