import React from 'react';

const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8">
          <h1 className="text-4xl font-bold text-slate-200 mb-8">Terms of Service</h1>
          
          <div className="text-slate-300 space-y-6">
            <p className="text-sm text-slate-400">Last updated: {new Date().toLocaleDateString()}</p>
            
            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">1. Acceptance of Terms</h2>
              <p>
                By accessing and using BUX Spades ("the Service"), you accept and agree to be bound by 
                the terms and provision of this agreement. If you do not agree to abide by the above, 
                please do not use this service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">2. Description of Service</h2>
              <p>
                BUX Spades is an online card game service that allows users to play Spades with other 
                players. The service includes features such as game statistics, virtual currency (coins), 
                and social interaction features.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">3. User Accounts</h2>
              <p>To use our service, you must:</p>
              <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                <li>Authenticate using Facebook or Discord</li>
                <li>Be at least 13 years of age</li>
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account</li>
                <li>Not share your account with others</li>
                <li>Be responsible for all activities that occur under your account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">4. Virtual Currency</h2>
              <p>
                BUX Spades uses virtual currency ("coins") that can be earned through gameplay. 
                Coins have no real-world value and cannot be redeemed for cash or transferred to 
                other users or services. Coins are provided "as is" and we reserve the right to 
                modify, suspend, or terminate coin balances at any time without notice.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">5. User Conduct</h2>
              <p>You agree not to:</p>
              <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                <li>Use the service for any illegal purpose or in violation of any laws</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Attempt to gain unauthorized access to the service or other users' accounts</li>
                <li>Interfere with or disrupt the service or servers</li>
                <li>Use automated systems or bots to access the service</li>
                <li>Exploit bugs or glitches for personal gain</li>
                <li>Impersonate any person or entity</li>
                <li>Transmit any malicious code, viruses, or harmful content</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">6. Game Rules and Fair Play</h2>
              <p>
                All users are expected to play fairly and follow the standard rules of Spades. 
                Cheating, collusion, or any form of unfair play is strictly prohibited and may 
                result in immediate account suspension or termination.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">7. Intellectual Property</h2>
              <p>
                The service and its original content, features, and functionality are owned by 
                BUX Spades and are protected by international copyright, trademark, and other 
                intellectual property laws. You may not reproduce, distribute, modify, or create 
                derivative works from our content without express written permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">8. Termination</h2>
              <p>
                We reserve the right to terminate or suspend your account and access to the service 
                immediately, without prior notice or liability, for any reason, including but not 
                limited to a breach of these Terms of Service. Upon termination, your right to use 
                the service will cease immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">9. Disclaimer of Warranties</h2>
              <p>
                The service is provided on an "as is" and "as available" basis. We make no 
                warranties, expressed or implied, and hereby disclaim all warranties including, 
                without limitation, implied warranties of merchantability, fitness for a particular 
                purpose, or non-infringement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">10. Limitation of Liability</h2>
              <p>
                In no event shall BUX Spades, its owners, operators, or affiliates be liable for 
                any indirect, incidental, special, consequential, or punitive damages, including 
                without limitation, loss of profits, data, use, goodwill, or other intangible 
                losses, resulting from your use or inability to use the service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">11. Changes to Terms</h2>
              <p>
                We reserve the right to modify or replace these Terms of Service at any time. 
                If a revision is material, we will provide at least 30 days notice prior to any 
                new terms taking effect. What constitutes a material change will be determined 
                at our sole discretion. By continuing to access or use our service after any 
                revisions become effective, you agree to be bound by the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">12. Governing Law</h2>
              <p>
                These Terms of Service shall be governed by and construed in accordance with the 
                laws of the jurisdiction in which the service operates, without regard to its 
                conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">13. Contact Information</h2>
              <p>
                If you have any questions about these Terms of Service, please contact us at:
              </p>
              <p className="mt-2">
                Email: <a href="mailto:buxdao@gmail.com" className="text-blue-400 hover:text-blue-300 underline">buxdao@gmail.com</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;

