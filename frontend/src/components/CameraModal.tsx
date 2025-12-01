import React, { useRef, useState, useCallback } from 'react';
import { X, Camera, RefreshCw } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

const CameraModal = ({ isOpen, onClose, onCapture }: CameraModalProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError('');
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError('Could not access camera. Please check permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  React.useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      if (context) {
        // Flip horizontally if using front camera (mirror effect)
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
            onCapture(file);
            onClose();
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-black rounded-2xl overflow-hidden relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white z-10 p-2 bg-gray-800 rounded-full"
        >
          <X size={24} />
        </button>

        {error ? (
          <div className="h-96 flex items-center justify-center text-white text-center p-6">
            <p>{error}</p>
          </div>
        ) : (
          <div className="relative aspect-[3/4] bg-gray-900">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover transform -scale-x-100" // Mirror effect
            />
          </div>
        )}

        <div className="p-6 flex justify-center items-center gap-8 bg-black">
          <button 
            onClick={capturePhoto}
            className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white/50 transition-colors"
          >
            <div className="w-12 h-12 bg-white rounded-full" />
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraModal;
