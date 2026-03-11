import React, { useState } from 'react';
import { Share2, Copy, Check, Download } from 'lucide-react';
import { share, canShare, copyToClipboard, ShareData } from '../../utils/share';
import { toast } from 'react-hot-toast';

interface ShareButtonProps {
    data: ShareData;
    variant?: 'button' | 'icon';
    className?: string;
    onShare?: () => void;
}

export const ShareButton: React.FC<ShareButtonProps> = ({
    data,
    variant = 'button',
    className = '',
    onShare,
}) => {
    const [copied, setCopied] = useState(false);
    const shareSupported = canShare();

    const handleShare = async () => {
        if (shareSupported) {
            const success = await share(data);
            if (success) {
                onShare?.();
                toast.success('Shared successfully!');
            }
        } else {
            // Fallback: copy to clipboard
            const textToCopy = data.url || data.text || '';
            const success = await copyToClipboard(textToCopy);
            if (success) {
                setCopied(true);
                toast.success('Link copied to clipboard!');
                setTimeout(() => setCopied(false), 2000);
                onShare?.();
            }
        }
    };

    if (variant === 'icon') {
        return (
            <button
                onClick={handleShare}
                className={`p-2 rounded-lg hover:bg-slate-100 transition-colors ${className}`}
                title={shareSupported ? 'Share' : 'Copy link'}
            >
                {copied ? <Check size={20} className="text-green-600" /> : <Share2 size={20} className="text-slate-600" />}
            </button>
        );
    }

    return (
        <button
            onClick={handleShare}
            className={`flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors ${className}`}
        >
            {copied ? <Check size={18} /> : <Share2 size={18} />}
            {shareSupported ? 'Share' : copied ? 'Copied!' : 'Copy Link'}
        </button>
    );
};

interface ShareReceiptButtonProps {
    transactionId: string;
    studentName: string;
    amount: number;
    date: string;
    className?: string;
}

export const ShareReceiptButton: React.FC<ShareReceiptButtonProps> = ({
    transactionId,
    studentName,
    amount,
    date,
    className = '',
}) => {
    const handleShare = async () => {
        const text = `
📄 Payment Receipt

Transaction: ${transactionId}
Student: ${studentName}
Amount: ZMW ${amount.toLocaleString()}
Date: ${date}

Paid via Sync — Run your school. In sync.
    `.trim();

        const success = await share({
            title: `Receipt - ${transactionId}`,
            text,
        });

        if (!success && !canShare()) {
            await copyToClipboard(text);
            toast.success('Receipt copied to clipboard!');
        }
    };

    return (
        <button
            onClick={handleShare}
            className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors ${className}`}
        >
            <Share2 size={18} />
            Share Receipt
        </button>
    );
};

export default ShareButton;
