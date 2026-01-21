/**
 * Web Share API Utility
 * Provides native sharing capabilities for receipts, reports, and content
 */

export interface ShareData {
    title?: string;
    text?: string;
    url?: string;
    files?: File[];
}

/**
 * Check if Web Share API is supported
 */
export const canShare = (): boolean => {
    return 'share' in navigator;
};

/**
 * Check if file sharing is supported
 */
export const canShareFiles = (files?: File[]): boolean => {
    if (!files || !('canShare' in navigator)) return false;
    return navigator.canShare({ files });
};

/**
 * Share content using native share dialog
 */
export const share = async (data: ShareData): Promise<boolean> => {
    if (!canShare()) {
        console.warn('Web Share API not supported');
        return false;
    }

    try {
        await navigator.share(data);
        return true;
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            // User cancelled - not an error
            return false;
        }
        console.error('Share failed:', error);
        return false;
    }
};

/**
 * Share a payment receipt
 */
export const shareReceipt = async (receipt: {
    transactionId: string;
    studentName: string;
    amount: number;
    date: string;
}): Promise<boolean> => {
    const text = `
Payment Receipt - Sync School Management

Transaction ID: ${receipt.transactionId}
Student: ${receipt.studentName}
Amount: ZMW ${receipt.amount.toLocaleString()}
Date: ${receipt.date}

Thank you for your payment!
  `.trim();

    return share({
        title: `Receipt - ${receipt.transactionId}`,
        text,
    });
};

/**
 * Share a PDF file (e.g., report card)
 */
export const sharePDF = async (file: File, title: string): Promise<boolean> => {
    if (!canShareFiles([file])) {
        // Fallback: download the file
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    }

    return share({
        title,
        files: [file],
    });
};

/**
 * Share app link
 */
export const shareAppLink = async (): Promise<boolean> => {
    return share({
        title: 'Sync School Management',
        text: 'Check out Sync - Modern School Management System for managing students, fees, and academics.',
        url: window.location.origin,
    });
};

/**
 * Copy to clipboard fallback
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        if ('clipboard' in navigator) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
    } catch (error) {
        console.error('Copy failed:', error);
        return false;
    }
};

export default { share, shareReceipt, sharePDF, shareAppLink, canShare, copyToClipboard };
