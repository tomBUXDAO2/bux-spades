import React, { useState } from 'react';
import axios from 'axios';

interface FacebookVerificationProps {
  userDiscordId?: string;
  onVerificationChange?: (verified: boolean) => void;
}

const FacebookVerification: React.FC<FacebookVerificationProps> = ({ 
  userDiscordId, 
  onVerificationChange 
}) => {
  const [discordId, setDiscordId] = useState(userDiscordId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(null), 5000);
  };

  const verifyFacebook = async () => {
    if (!discordId.trim()) {
      showMessage('Please enter a Discord ID', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post('/api/discord/webhook/verify-facebook', {
        discordId: discordId.trim()
      });

      if (response.data.success) {
        showMessage('Facebook connection verified! LEAGUE role awarded.', 'success');
        onVerificationChange?.(true);
      } else {
        showMessage('Failed to verify Facebook connection', 'error');
      }
    } catch (error: any) {
      console.error('Error verifying Facebook:', error);
      showMessage(
        error.response?.data?.error || 'Failed to verify Facebook connection',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const revokeVerification = async () => {
    if (!discordId.trim()) {
      showMessage('Please enter a Discord ID', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post('/api/discord/webhook/revoke-facebook', {
        discordId: discordId.trim()
      });

      if (response.data.success) {
        showMessage('Facebook verification revoked! LEAGUE role removed.', 'success');
        onVerificationChange?.(false);
      } else {
        showMessage('Failed to revoke Facebook verification', 'error');
      }
    } catch (error: any) {
      console.error('Error revoking verification:', error);
      showMessage(
        error.response?.data?.error || 'Failed to revoke Facebook verification',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 max-w-md mx-auto">
      <h3 className="text-xl font-semibold text-slate-200 mb-4">
        Facebook Verification
      </h3>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="discordId" className="block text-sm font-medium text-slate-300 mb-2">
            Discord User ID
          </label>
          <input
            type="text"
            id="discordId"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            placeholder="Enter Discord User ID"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {message && (
          <div className={`p-3 rounded-md ${
            messageType === 'success' 
              ? 'bg-green-900/50 border border-green-500 text-green-200' 
              : 'bg-red-900/50 border border-red-500 text-red-200'
          }`}>
            {message}
          </div>
        )}

        <div className="flex space-x-3">
          <button
            onClick={verifyFacebook}
            disabled={isLoading}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
          >
            {isLoading ? 'Verifying...' : 'Verify Facebook'}
          </button>
          
          <button
            onClick={revokeVerification}
            disabled={isLoading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
          >
            {isLoading ? 'Revoking...' : 'Revoke'}
          </button>
        </div>

        <div className="text-xs text-slate-400 mt-4">
          <p className="mb-2">
            <strong>How it works:</strong>
          </p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Enter a Discord User ID</li>
            <li>Click "Verify Facebook" to award LEAGUE role</li>
            <li>Click "Revoke" to remove LEAGUE role</li>
            <li>Only verified users can access league game rooms</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FacebookVerification; 