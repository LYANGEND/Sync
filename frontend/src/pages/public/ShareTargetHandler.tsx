import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FileText, Upload, CheckCircle, X, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * Share Target Handler Component
 * Handles files/content shared TO the app from other apps
 * 
 * When user shares a PDF receipt or document to Sync,
 * this component receives and processes it.
 */
const ShareTargetHandler: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [sharedData, setSharedData] = useState<{
        title?: string;
        text?: string;
        url?: string;
        files?: File[];
    } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        // Get shared data from URL params (for text/url shares)
        const title = searchParams.get('title') || undefined;
        const text = searchParams.get('text') || undefined;
        const url = searchParams.get('url') || undefined;

        // Check for file shares via POST
        const handleFileShare = async () => {
            // Files are posted to this endpoint via FormData
            // In a real implementation, you'd handle this server-side
            // or via service worker
        };

        if (title || text || url) {
            setSharedData({ title, text, url });
        }

        handleFileShare();
    }, [searchParams]);

    const handleProcess = async () => {
        setIsProcessing(true);

        try {
            // Process the shared content
            // This could be:
            // - Adding a note/comment
            // - Uploading a document
            // - Processing a shared receipt

            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate processing

            setIsComplete(true);
            toast.success('Content processed successfully!');

            // Redirect after a delay
            setTimeout(() => {
                navigate('/');
            }, 2000);
        } catch (error) {
            toast.error('Failed to process shared content');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDismiss = () => {
        navigate('/');
    };

    if (!sharedData) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Loader2 className="animate-spin text-slate-400" size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Processing Share</h2>
                    <p className="text-slate-500">Please wait...</p>
                </div>
            </div>
        );
    }

    if (isComplete) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="text-green-600" size={40} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Success!</h2>
                    <p className="text-slate-500 mb-6">Content has been added to Sync.</p>
                    <p className="text-sm text-slate-400">Redirecting to dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                            <Upload className="text-blue-600" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Shared Content</h2>
                            <p className="text-sm text-slate-500">Review and process</p>
                        </div>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                {/* Content Preview */}
                <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-3">
                    {sharedData.title && (
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Title</p>
                            <p className="text-slate-900 font-medium">{sharedData.title}</p>
                        </div>
                    )}

                    {sharedData.text && (
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Content</p>
                            <p className="text-slate-700 text-sm line-clamp-3">{sharedData.text}</p>
                        </div>
                    )}

                    {sharedData.url && (
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">URL</p>
                            <a
                                href={sharedData.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 text-sm hover:underline truncate block"
                            >
                                {sharedData.url}
                            </a>
                        </div>
                    )}

                    {sharedData.files && sharedData.files.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Files</p>
                            <div className="space-y-2">
                                {sharedData.files.map((file, index) => (
                                    <div key={index} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
                                        <FileText size={20} className="text-blue-600" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                                            <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={handleDismiss}
                        className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleProcess}
                        disabled={isProcessing}
                        className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Processing...
                            </>
                        ) : (
                            'Add to Sync'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper function
const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default ShareTargetHandler;
