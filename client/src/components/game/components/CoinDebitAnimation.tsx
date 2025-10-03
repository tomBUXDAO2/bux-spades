import React from 'react';

interface CoinDebitAnimationProps {
  amount: number;
  isVisible: boolean;
}

const CoinDebitAnimation: React.FC<CoinDebitAnimationProps> = ({ amount, isVisible }) => {
  if (!isVisible) return null;
  
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
      <div className="text-red-500 font-bold text-lg px-3 py-1 rounded-lg animate-[floatUp_3s_ease-out_forwards] bg-black bg-opacity-80 border-2 border-red-500">
        -{(amount / 1000).toFixed(0)}k
      </div>
    </div>
  );
};

export default CoinDebitAnimation;
