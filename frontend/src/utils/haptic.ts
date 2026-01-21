/**
 * Haptic Feedback Utilities
 * Provides native-feeling vibration feedback for interactions
 */

type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

// Vibration patterns for different feedback types
const hapticPatterns: Record<HapticType, number | number[]> = {
    light: 5,
    medium: 10,
    heavy: 20,
    selection: 3,
    success: [10, 50, 10],
    warning: [20, 50, 20],
    error: [30, 50, 30, 50, 30],
};

/**
 * Check if haptic feedback is supported
 */
export const isHapticSupported = (): boolean => {
    return 'vibrate' in navigator;
};

/**
 * Trigger haptic feedback
 */
export const haptic = (type: HapticType = 'light'): boolean => {
    if (!isHapticSupported()) return false;

    try {
        const pattern = hapticPatterns[type];
        navigator.vibrate(pattern);
        return true;
    } catch {
        return false;
    }
};

/**
 * Light tap feedback (buttons, selections)
 */
export const hapticLight = (): boolean => haptic('light');

/**
 * Medium feedback (confirmations)
 */
export const hapticMedium = (): boolean => haptic('medium');

/**
 * Heavy feedback (important actions)
 */
export const hapticHeavy = (): boolean => haptic('heavy');

/**
 * Selection feedback (toggles, switches)
 */
export const hapticSelection = (): boolean => haptic('selection');

/**
 * Success feedback (completed actions)
 */
export const hapticSuccess = (): boolean => haptic('success');

/**
 * Warning feedback (alerts)
 */
export const hapticWarning = (): boolean => haptic('warning');

/**
 * Error feedback (failures)
 */
export const hapticError = (): boolean => haptic('error');

/**
 * React hook for haptic feedback
 */
export const useHaptic = () => {
    return {
        isSupported: isHapticSupported(),
        trigger: haptic,
        light: hapticLight,
        medium: hapticMedium,
        heavy: hapticHeavy,
        selection: hapticSelection,
        success: hapticSuccess,
        warning: hapticWarning,
        error: hapticError,
    };
};

export default haptic;
