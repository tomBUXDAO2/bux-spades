import React, { useState, useEffect } from 'react';
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <FaClock className="text-orange-500 text-2xl mr-2" />
            <h2 className="text-xl font-bold text-gray-800">Seat Replacement</h2>
          </div>
          
          <p className="text-gray-600 mb-4">
            Seat {seatIndex + 1} will be filled by a bot in:
          </p>
          
          <div className="text-3xl font-bold text-orange-500 mb-6">
            {formatTime(timeRemaining)}
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onFillSeat}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center"
            >
              <FaRobot className="mr-2" />
              Fill Seat Now
            </button>
            
            <button
              onClick={onClose}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-2 px-4 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 