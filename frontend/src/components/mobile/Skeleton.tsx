import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    animation?: 'pulse' | 'shimmer' | 'none';
}

/**
 * Skeleton Loading Component
 * Displays a placeholder while content is loading
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rectangular',
    width,
    height,
    animation = 'shimmer',
}) => {
    const baseClasses = 'bg-gray-200';

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg',
    };

    const animationClasses = {
        pulse: 'animate-pulse',
        shimmer: 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
        none: '',
    };

    const style: React.CSSProperties = {
        width: width,
        height: height,
    };

    return (
        <div
            className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
            style={style}
        />
    );
};

// Pre-built skeleton components for common use cases

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
    lines = 1,
    className = ''
}) => (
    <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
                key={i}
                variant="text"
                height={16}
                width={i === lines - 1 && lines > 1 ? '70%' : '100%'}
            />
        ))}
    </div>
);

export const SkeletonAvatar: React.FC<{ size?: number; className?: string }> = ({
    size = 40,
    className = ''
}) => (
    <Skeleton variant="circular" width={size} height={size} className={className} />
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`bg-white rounded-xl p-4 shadow-sm border border-gray-100 ${className}`}>
        <div className="flex items-center gap-4 mb-4">
            <SkeletonAvatar size={48} />
            <div className="flex-1">
                <Skeleton height={16} width="60%" className="mb-2" />
                <Skeleton height={12} width="40%" />
            </div>
        </div>
        <SkeletonText lines={3} />
    </div>
);

export const SkeletonStatCard: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`bg-white rounded-xl p-4 shadow-sm border border-gray-100 ${className}`}>
        <div className="flex items-center justify-between mb-4">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
            <Skeleton variant="rectangular" width={60} height={24} className="rounded-full" />
        </div>
        <Skeleton height={14} width="60%" className="mb-2" />
        <Skeleton height={28} width="80%" />
    </div>
);

export const SkeletonListItem: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`flex items-center gap-4 p-4 ${className}`}>
        <SkeletonAvatar size={44} />
        <div className="flex-1">
            <Skeleton height={16} width="70%" className="mb-2" />
            <Skeleton height={12} width="50%" />
        </div>
        <Skeleton height={20} width={60} className="rounded-full" />
    </div>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
    rows = 5,
    cols = 4
}) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 p-4 flex gap-4">
            {Array.from({ length: cols }).map((_, i) => (
                <Skeleton key={i} height={16} className="flex-1" />
            ))}
        </div>
        {/* Rows */}
        <div className="divide-y divide-gray-100">
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="p-4 flex gap-4 items-center">
                    {Array.from({ length: cols }).map((_, colIndex) => (
                        <Skeleton
                            key={colIndex}
                            height={14}
                            className="flex-1"
                            width={colIndex === 0 ? '80%' : '60%'}
                        />
                    ))}
                </div>
            ))}
        </div>
    </div>
);

// Dashboard-specific skeletons
export const DashboardSkeleton: React.FC = () => (
    <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div>
            <Skeleton height={28} width={200} className="mb-2" />
            <Skeleton height={16} width={300} />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-4 flex flex-col items-center gap-3">
                    <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
                    <Skeleton height={14} width={60} />
                </div>
            ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between">
                <Skeleton height={20} width={150} />
                <Skeleton height={16} width={60} />
            </div>
            <div className="divide-y divide-gray-100">
                {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonListItem key={i} />
                ))}
            </div>
        </div>
    </div>
);

export default Skeleton;
