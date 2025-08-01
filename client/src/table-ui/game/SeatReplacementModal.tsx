import { useState, useEffect } from 'react';
import { FaRobot, FaClock } from 'react-icons/fa';

interface SeatReplacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  seatIndex: number;
  expiresAt: number;
  onFillSeat: () => void;
}

export default function SeatReplacementModal({
  isOpen,
  onClose,
  seatIndex,
  expiresAt,
  onFillSeat
}: SeatReplacementModalProps) {
  const [timeRemaining, setTimeRemaining] = useState(120); // 2 minutes in seconds

  useEffect(() => {
    if (!isOpen) {
      setTimeRemaining(120);
      return;
    }

    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        onClose();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, expiresAt, onClose]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
      <div className="w-[380px] md:w-[360px] sm:w-[320px] max-sm:w-[280px] backdrop-blur-md bg-gray-900/75 border border-white/20 rounded-2xl p-4 max-sm:p-3 shadow-xl">
        <div className="flex items-center justify-center gap-2 mb-3">
          <FaClock className="h-6 w-6 text-orange-500" />
          <h2 className="text-lg font-bold text-white text-center">Seat Replacement</h2>
        </div>

        <p className="text-sm text-gray-300 text-center mb-4">
          Seat {seatIndex + 1} will be filled by a bot in:
        </p>

        <div className="text-3xl font-bold text-orange-500 text-center mb-6">
          {formatTime(timeRemaining)}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onFillSeat}
            className="w-full px-4 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-blue-800 text-white font-medium rounded shadow hover:from-blue-700 hover:to-blue-900 transition-all flex items-center justify-center"
          >
            <FaRobot className="mr-2" />
            Fill Seat Now
          </button>
          
          <button
            onClick={onClose}
            className="w-full px-4 py-1.5 text-sm bg-gradient-to-r from-gray-600 to-gray-800 text-white font-medium rounded shadow hover:from-gray-700 hover:to-gray-900 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 