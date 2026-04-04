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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="w-[380px] max-sm:w-[280px] sm:w-[320px] md:w-[360px] rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-lobby backdrop-blur-xl max-sm:p-3">
        <div className="flex items-center justify-center gap-2 mb-3">
          <FaClock className="h-6 w-6 text-orange-500" />
          <h2 className="text-lg font-bold text-white text-center">Seat Replacement</h2>
        </div>

        <p className="mb-4 text-center text-sm text-slate-400">
          Seat {seatIndex + 1} will be filled by a bot in:
        </p>

        <div className="text-3xl font-bold text-orange-500 text-center mb-6">
          {formatTime(timeRemaining)}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onFillSeat}
            className="flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500"
          >
            <FaRobot className="mr-2" />
            Fill Seat Now
          </button>
          
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 