import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// Standalone Facebook verification page - no authentication required

const FacebookVerification: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    const messageParam = searchParams.get('message');
    
    setStatus(statusParam);
    setMessage(messageParam);
  }, [searchParams]);

  const isSuccess = status === 'success';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className={`rounded-lg p-8 text-center ${
          isSuccess 
            ? 'bg-green-900/50 border border-green-500' 
            : 'bg-red-900/50 border border-red-500'
        }`}>
          
          {/* Icon */}
          <div className="mb-6">
            {isSuccess ? (
              <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="mx-auto w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>

          {/* Title */}
          <h1 className={`text-2xl font-bold mb-4 ${
            isSuccess ? 'text-green-200' : 'text-red-200'
          }`}>
            {isSuccess ? '✅ Verification Successful!' : '❌ Verification Failed'}
          </h1>

          {/* Message */}
          <p className="text-slate-200 mb-6 leading-relaxed">
            {message || 'An error occurred during verification.'}
          </p>

          {/* Instructions */}
          <div className="space-y-3">
            {isSuccess ? (
              <div className="text-green-200 text-sm">
                You can now close this window and return to Discord.
              </div>
            ) : (
              <div className="text-red-200 text-sm">
                Please connect your Facebook to your Discord profile and try again.
              </div>
            )}
          </div>

          {/* BUX Spades Logo */}
          <div className="mt-8 pt-6 border-t border-slate-700">
            <div className="flex items-center justify-center space-x-2">
              <img 
                src="/bux-spades.png" 
                alt="BUX Spades" 
                className="w-8 h-8"
              />
              <span className="text-slate-400 text-sm">BUX Spades League</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacebookVerification; 