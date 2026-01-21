import React, { useState, useEffect } from 'react';
import { Plus, X, UserPlus, Wallet, ClipboardCheck, MessageSquare, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface FABAction {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    color?: string;
}

interface FloatingActionButtonProps {
    actions?: FABAction[];
    position?: 'bottom-right' | 'bottom-center';
    className?: string;
}

/**
 * Floating Action Button (FAB)
 * Role-based quick action button with expandable menu
 */
export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
    actions,
    position = 'bottom-right',
    className = '',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const navigate = useNavigate();
    const { user } = useAuth();
    const lastScrollY = React.useRef(0);

    // Default actions based on role
    const getDefaultActions = (): FABAction[] => {
        const role = user?.role;

        if (role === 'PARENT') {
            return [
                {
                    icon: <Wallet size={20} />,
                    label: 'Pay Fees',
                    onClick: () => navigate('/pay'),
                    color: 'bg-green-500'
                },
                {
                    icon: <MessageSquare size={20} />,
                    label: 'Message School',
                    onClick: () => navigate('/communication'),
                    color: 'bg-blue-500'
                },
            ];
        }

        if (role === 'TEACHER') {
            return [
                {
                    icon: <ClipboardCheck size={20} />,
                    label: 'Take Attendance',
                    onClick: () => navigate('/academics/attendance'),
                    color: 'bg-orange-500'
                },
                {
                    icon: <BookOpen size={20} />,
                    label: 'Enter Grades',
                    onClick: () => navigate('/academics/gradebook'),
                    color: 'bg-purple-500'
                },
                {
                    icon: <MessageSquare size={20} />,
                    label: 'Announcement',
                    onClick: () => navigate('/communication'),
                    color: 'bg-blue-500'
                },
            ];
        }

        // Admin, Bursar, Secretary
        return [
            {
                icon: <UserPlus size={20} />,
                label: 'Add Student',
                onClick: () => navigate('/students'),
                color: 'bg-blue-500'
            },
            {
                icon: <Wallet size={20} />,
                label: 'Record Payment',
                onClick: () => navigate('/finance'),
                color: 'bg-green-500'
            },
            {
                icon: <ClipboardCheck size={20} />,
                label: 'Attendance',
                onClick: () => navigate('/attendance'),
                color: 'bg-orange-500'
            },
            {
                icon: <MessageSquare size={20} />,
                label: 'Announcement',
                onClick: () => navigate('/communication'),
                color: 'bg-purple-500'
            },
        ];
    };

    const fabActions = actions || getDefaultActions();

    // Hide FAB on scroll down, show on scroll up
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                setIsVisible(false);
                setIsOpen(false);
            } else {
                setIsVisible(true);
            }

            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleToggle = () => {
        if ('vibrate' in navigator) {
            navigator.vibrate(5);
        }
        setIsOpen(!isOpen);
    };

    const handleAction = (action: FABAction) => {
        if ('vibrate' in navigator) {
            navigator.vibrate(5);
        }
        setIsOpen(false);
        action.onClick();
    };

    const positionClasses = position === 'bottom-center'
        ? 'bottom-20 left-1/2 -translate-x-1/2'
        : 'bottom-20 right-4';

    return (
        <>
            {/* Backdrop when open */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/20 z-40 md:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* FAB Container - only on mobile */}
            <div
                className={`fixed z-50 md:hidden transition-all duration-300 ${positionClasses} ${className} ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'
                    }`}
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {/* Action Items */}
                <div className={`absolute bottom-16 right-0 flex flex-col-reverse items-end gap-3 transition-all duration-300 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                    }`}>
                    {fabActions.map((action, index) => (
                        <button
                            key={index}
                            onClick={() => handleAction(action)}
                            className="flex items-center gap-3 animate-scale-in"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            {/* Label */}
                            <span className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg shadow-lg whitespace-nowrap">
                                {action.label}
                            </span>

                            {/* Icon Button */}
                            <div className={`w-12 h-12 rounded-full ${action.color || 'bg-blue-500'} text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform`}>
                                {action.icon}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Main FAB Button */}
                <button
                    onClick={handleToggle}
                    className={`w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl active:scale-95 transition-all duration-300 ${isOpen ? 'rotate-45 bg-gray-700' : 'rotate-0'
                        }`}
                >
                    {isOpen ? <X size={24} /> : <Plus size={24} />}
                </button>
            </div>
        </>
    );
};

/**
 * Simple FAB for single action
 */
export const SimpleFAB: React.FC<{
    icon?: React.ReactNode;
    onClick: () => void;
    label?: string;
    className?: string;
}> = ({ icon = <Plus size={24} />, onClick, label, className = '' }) => {
    const [isVisible, setIsVisible] = useState(true);
    const lastScrollY = React.useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            setIsVisible(currentScrollY <= lastScrollY.current || currentScrollY < 100);
            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <button
            onClick={() => {
                if ('vibrate' in navigator) navigator.vibrate(5);
                onClick();
            }}
            className={`fixed bottom-20 right-4 z-50 md:hidden flex items-center gap-2 px-5 h-14 bg-blue-600 text-white rounded-full shadow-xl active:scale-95 transition-all duration-300 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0'
                } ${className}`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            {icon}
            {label && <span className="font-medium">{label}</span>}
        </button>
    );
};

export default FloatingActionButton;
