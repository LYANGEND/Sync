import React, { useState, useRef, useCallback, ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    title?: string;
    showHandle?: boolean;
    height?: 'auto' | 'half' | 'full';
    className?: string;
}

/**
 * BottomSheet Component
 * Native-feeling draggable bottom sheet modal
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
    isOpen,
    onClose,
    children,
    title,
    showHandle = true,
    height = 'auto',
    className = '',
}) => {
    const sheetRef = useRef<HTMLDivElement>(null);
    const [dragY, setDragY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);
    const sheetHeight = useRef(0);

    // Calculate height class
    const getHeightClass = () => {
        switch (height) {
            case 'full': return 'max-h-[95vh]';
            case 'half': return 'max-h-[50vh]';
            default: return 'max-h-[80vh]';
        }
    };

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        startY.current = e.touches[0].clientY;
        sheetHeight.current = sheetRef.current?.offsetHeight || 0;
        setIsDragging(true);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging) return;

        const currentY = e.touches[0].clientY;
        const delta = currentY - startY.current;

        // Only allow dragging down
        if (delta > 0) {
            setDragY(delta);
        }
    }, [isDragging]);

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);

        // Close if dragged more than 30% of sheet height
        if (dragY > sheetHeight.current * 0.3) {
            onClose();
        }

        setDragY(0);
    }, [dragY, onClose]);

    // Lock body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const content = (
        <div className="fixed inset-0 z-50">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 transition-opacity duration-300"
                style={{ opacity: 1 - dragY / 300 }}
                onClick={onClose}
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl ${getHeightClass()} ${className}`}
                style={{
                    transform: `translateY(${dragY}px)`,
                    transition: isDragging ? 'none' : 'transform 0.3s ease-out',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                }}
            >
                {/* Handle */}
                {showHandle && (
                    <div
                        className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        <div className="w-10 h-1 bg-gray-300 rounded-full" />
                    </div>
                )}

                {/* Header */}
                {title && (
                    <div className="px-5 pb-3 flex justify-between items-center border-b border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="overflow-y-auto overscroll-contain flex-1">
                    {children}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

interface ActionSheetOption {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    destructive?: boolean;
    disabled?: boolean;
}

interface ActionSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    options: ActionSheetOption[];
}

/**
 * ActionSheet Component
 * iOS-style action sheet with options
 */
export const ActionSheet: React.FC<ActionSheetProps> = ({
    isOpen,
    onClose,
    title,
    options,
}) => {
    if (!isOpen) return null;

    const content = (
        <div className="fixed inset-0 z-50">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
            />

            {/* Sheet */}
            <div
                className="absolute bottom-0 left-0 right-0 px-3 animate-slide-up"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
            >
                {/* Options Card */}
                <div className="bg-white rounded-2xl overflow-hidden mb-2 shadow-xl">
                    {title && (
                        <div className="px-4 py-3 border-b border-gray-100">
                            <p className="text-center text-sm text-gray-500 font-medium">{title}</p>
                        </div>
                    )}

                    <div className="divide-y divide-gray-100">
                        {options.map((option, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    if (!option.disabled) {
                                        option.onClick();
                                        onClose();
                                    }
                                }}
                                disabled={option.disabled}
                                className={`w-full px-4 py-4 flex items-center justify-center gap-3 transition-colors ${option.disabled
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : option.destructive
                                            ? 'text-red-600 active:bg-red-50'
                                            : 'text-blue-600 active:bg-gray-50'
                                    }`}
                            >
                                {option.icon}
                                <span className="font-medium">{option.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Cancel Button */}
                <button
                    onClick={onClose}
                    className="w-full py-4 bg-white rounded-2xl font-semibold text-blue-600 shadow-xl active:bg-gray-50 transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

export default BottomSheet;
