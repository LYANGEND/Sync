import React, { useRef, useState, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface SwipeBackProps {
    children: ReactNode;
    threshold?: number;
    enabled?: boolean;
}

/**
 * SwipeBack Component
 * Enables swipe right gesture to navigate back (like iOS)
 */
export const SwipeBack: React.FC<SwipeBackProps> = ({
    children,
    threshold = 100,
    enabled = true,
}) => {
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);
    const [swipeDistance, setSwipeDistance] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const isHorizontalSwipe = useRef<boolean | null>(null);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (!enabled) return;

        // Only trigger from left edge (first 30px)
        if (e.touches[0].clientX > 30) return;

        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        isHorizontalSwipe.current = null;
        setIsSwiping(true);
    }, [enabled]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isSwiping || !enabled) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - startX.current;
        const deltaY = currentY - startY.current;

        // Determine swipe direction on first significant movement
        if (isHorizontalSwipe.current === null) {
            if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
            }
        }

        // Only handle horizontal swipes to the right
        if (isHorizontalSwipe.current && deltaX > 0) {
            e.preventDefault();
            setSwipeDistance(Math.min(deltaX * 0.8, threshold * 1.5));
        }
    }, [isSwiping, enabled, threshold]);

    const handleTouchEnd = useCallback(() => {
        if (!isSwiping) return;

        if (swipeDistance >= threshold) {
            // Haptic feedback
            if ('vibrate' in navigator) {
                navigator.vibrate(10);
            }
            navigate(-1);
        }

        setSwipeDistance(0);
        setIsSwiping(false);
        isHorizontalSwipe.current = null;
    }, [isSwiping, swipeDistance, threshold, navigate]);

    const shouldTrigger = swipeDistance >= threshold;
    const opacity = Math.max(0, 1 - swipeDistance / threshold / 2);

    return (
        <div
            ref={containerRef}
            className="relative"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Back Indicator */}
            <div
                className="fixed left-0 top-1/2 -translate-y-1/2 z-50 pointer-events-none transition-all duration-100"
                style={{
                    opacity: swipeDistance / threshold,
                    transform: `translateY(-50%) translateX(${Math.min(swipeDistance / 3, 40)}px)`,
                }}
            >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors ${shouldTrigger ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
                    }`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </div>
            </div>

            {/* Content */}
            <div
                style={{
                    transform: isSwiping ? `translateX(${swipeDistance}px)` : 'translateX(0)',
                    opacity: isSwiping ? opacity : 1,
                    transition: isSwiping ? 'none' : 'all 0.3s ease-out',
                }}
            >
                {children}
            </div>
        </div>
    );
};

interface SwipeableCardsProps {
    children: ReactNode[];
    className?: string;
    onCardChange?: (index: number) => void;
}

/**
 * SwipeableCards Component
 * Horizontal swipeable cards with snap points
 */
export const SwipeableCards: React.FC<SwipeableCardsProps> = ({
    children,
    className = '',
    onCardChange,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const scrollLeft = container.scrollLeft;
        const cardWidth = container.offsetWidth * 0.85; // Approximate card width
        const newIndex = Math.round(scrollLeft / cardWidth);

        if (newIndex !== activeIndex && newIndex >= 0 && newIndex < children.length) {
            setActiveIndex(newIndex);
            onCardChange?.(newIndex);
        }
    }, [activeIndex, children.length, onCardChange]);

    return (
        <div className={className}>
            {/* Cards Container */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4 -mx-4 px-4"
                style={{ scrollBehavior: 'smooth' }}
            >
                {React.Children.map(children, (child, index) => (
                    <div
                        key={index}
                        className="flex-shrink-0 w-[85%] snap-center"
                    >
                        {child}
                    </div>
                ))}
            </div>

            {/* Indicators */}
            {children.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-3">
                    {React.Children.map(children, (_, index) => (
                        <button
                            key={index}
                            onClick={() => {
                                const container = containerRef.current;
                                if (container) {
                                    const cardWidth = container.offsetWidth * 0.85 + 16; // width + gap
                                    container.scrollTo({ left: cardWidth * index, behavior: 'smooth' });
                                    setActiveIndex(index);
                                }
                            }}
                            className={`w-2 h-2 rounded-full transition-all duration-200 ${index === activeIndex
                                ? 'bg-blue-600 w-6'
                                : 'bg-gray-300 hover:bg-gray-400'
                                }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SwipeBack;
