import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, X, Loader2 } from 'lucide-react';

interface VoiceSearchState {
    isListening: boolean;
    transcript: string;
    error: string | null;
    isSupported: boolean;
}

interface UseVoiceSearchResult extends VoiceSearchState {
    startListening: () => void;
    stopListening: () => void;
    resetTranscript: () => void;
}

/**
 * useVoiceSearch Hook
 * Provides speech-to-text functionality for search
 */
export const useVoiceSearch = (): UseVoiceSearchResult => {
    const [state, setState] = useState<VoiceSearchState>({
        isListening: false,
        transcript: '',
        error: null,
        isSupported: false,
    });

    const recognitionRef = useRef<SpeechRecognition | null>(null);

    useEffect(() => {
        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
                const transcript = Array.from(event.results)
                    .map(result => result[0].transcript)
                    .join('');

                setState(prev => ({ ...prev, transcript }));
            };

            recognition.onerror = (event) => {
                let errorMessage = 'Speech recognition error';

                switch (event.error) {
                    case 'not-allowed':
                        errorMessage = 'Microphone access denied';
                        break;
                    case 'no-speech':
                        errorMessage = 'No speech detected';
                        break;
                    case 'network':
                        errorMessage = 'Network error';
                        break;
                }

                setState(prev => ({
                    ...prev,
                    error: errorMessage,
                    isListening: false
                }));
            };

            recognition.onend = () => {
                setState(prev => ({ ...prev, isListening: false }));
            };

            recognitionRef.current = recognition;
            setState(prev => ({ ...prev, isSupported: true }));
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, []);

    const startListening = useCallback(() => {
        if (!recognitionRef.current) return;

        setState(prev => ({
            ...prev,
            isListening: true,
            error: null,
            transcript: ''
        }));

        try {
            recognitionRef.current.start();
        } catch {
            // Already started
        }
    }, []);

    const stopListening = useCallback(() => {
        if (!recognitionRef.current) return;

        recognitionRef.current.stop();
        setState(prev => ({ ...prev, isListening: false }));
    }, []);

    const resetTranscript = useCallback(() => {
        setState(prev => ({ ...prev, transcript: '', error: null }));
    }, []);

    return {
        ...state,
        startListening,
        stopListening,
        resetTranscript,
    };
};

interface VoiceSearchButtonProps {
    onResult: (transcript: string) => void;
    className?: string;
    size?: number;
}

/**
 * VoiceSearchButton Component
 * Microphone button that triggers speech recognition
 */
export const VoiceSearchButton: React.FC<VoiceSearchButtonProps> = ({
    onResult,
    className = '',
    size = 20,
}) => {
    const {
        isSupported,
        isListening,
        transcript,
        error,
        startListening,
        stopListening,
        resetTranscript
    } = useVoiceSearch();

    useEffect(() => {
        if (transcript && !isListening) {
            onResult(transcript);
        }
    }, [transcript, isListening, onResult]);

    if (!isSupported) return null;

    return (
        <button
            onClick={isListening ? stopListening : startListening}
            className={`p-2 rounded-xl transition-all duration-200 ${isListening
                    ? 'bg-red-100 text-red-600 animate-pulse'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                } ${className}`}
            title={isListening ? 'Stop listening' : 'Voice search'}
        >
            {isListening ? <MicOff size={size} /> : <Mic size={size} />}
        </button>
    );
};

interface VoiceSearchOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    onResult: (transcript: string) => void;
}

/**
 * VoiceSearchOverlay Component
 * Full-screen voice search experience
 */
export const VoiceSearchOverlay: React.FC<VoiceSearchOverlayProps> = ({
    isOpen,
    onClose,
    onResult,
}) => {
    const {
        isSupported,
        isListening,
        transcript,
        error,
        startListening,
        stopListening,
        resetTranscript
    } = useVoiceSearch();

    useEffect(() => {
        if (isOpen && isSupported) {
            startListening();
        }
        return () => {
            if (isListening) {
                stopListening();
            }
        };
    }, [isOpen]);

    useEffect(() => {
        if (transcript && !isListening) {
            onResult(transcript);
            onClose();
        }
    }, [transcript, isListening]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col items-center justify-center animate-fade-in">
            {/* Close Button */}
            <button
                onClick={() => {
                    stopListening();
                    resetTranscript();
                    onClose();
                }}
                className="absolute top-4 right-4 p-3 text-gray-500 hover:text-gray-700 dark:text-gray-400"
                style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
            >
                <X size={24} />
            </button>

            {/* Microphone Animation */}
            <div className="relative mb-8">
                <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${isListening
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}>
                    {isListening && (
                        <>
                            <div className="absolute inset-0 rounded-full bg-red-200 dark:bg-red-800/50 animate-ping" />
                            <div className="absolute inset-2 rounded-full bg-red-100 dark:bg-red-900/30 animate-pulse" />
                        </>
                    )}
                    <button
                        onClick={isListening ? stopListening : startListening}
                        className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all ${isListening
                                ? 'bg-red-500 text-white'
                                : 'bg-blue-600 text-white'
                            }`}
                    >
                        {isListening ? <MicOff size={32} /> : <Mic size={32} />}
                    </button>
                </div>
            </div>

            {/* Status Text */}
            <div className="text-center px-6">
                {error ? (
                    <p className="text-red-500 text-lg">{error}</p>
                ) : isListening ? (
                    <div className="space-y-2">
                        <p className="text-xl font-medium text-gray-900 dark:text-white">Listening...</p>
                        <div className="flex items-center justify-center gap-1">
                            <span className="w-1 h-4 bg-blue-500 rounded animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-6 bg-blue-500 rounded animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-8 bg-blue-500 rounded animate-bounce" style={{ animationDelay: '300ms' }} />
                            <span className="w-1 h-6 bg-blue-500 rounded animate-bounce" style={{ animationDelay: '450ms' }} />
                            <span className="w-1 h-4 bg-blue-500 rounded animate-bounce" style={{ animationDelay: '600ms' }} />
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-lg">Tap the microphone to start</p>
                )}

                {/* Transcript Preview */}
                {transcript && (
                    <p className="mt-6 text-2xl font-medium text-gray-900 dark:text-white">
                        "{transcript}"
                    </p>
                )}
            </div>

            {/* Hint */}
            <p className="absolute bottom-8 text-sm text-gray-400 dark:text-gray-500 px-6 text-center">
                Try saying: "Show me students in Grade 5" or "Record payment"
            </p>
        </div>
    );
};

// Add types for SpeechRecognition
declare global {
    interface Window {
        SpeechRecognition: typeof SpeechRecognition;
        webkitSpeechRecognition: typeof SpeechRecognition;
    }
}

export default VoiceSearchButton;
