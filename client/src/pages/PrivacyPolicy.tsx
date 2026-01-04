import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8">
          <h1 className="text-4xl font-bold text-slate-200 mb-8">Privacy Policy</h1>
          
          <div className="text-slate-300 space-y-6">
            <p className="text-sm text-slate-400">Last updated: {new Date().toLocaleDateString()}</p>
            
            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">1. Introduction</h2>
              <p>
                Welcome to BUX Spades ("we," "our," or "us"). This Privacy Policy explains how we collect, 
                use, disclose, and safeguard your information when you use our service. Please read this 
                privacy policy carefully.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">2. Information We Collect</h2>
              <p>We collect information that you provide to us directly through authentication providers:</p>
              <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                <li><strong>Authentication Data:</strong> When you log in using Facebook or Discord, we receive and store:
                  <ul className="list-circle list-inside ml-6 mt-2 space-y-1">
                    <li>Your user ID from the authentication provider</li>
                    <li>Your display name or username</li>
                    <li>Your profile picture/avatar URL</li>
                    <li>Email address (if provided by the authentication provider and you grant permission)</li>
                  </ul>
                </li>
                <li><strong>Game Data:</strong> We store information related to your gameplay, including:
                  <ul className="list-circle list-inside ml-6 mt-2 space-y-1">
                    <li>Game history and statistics</li>
                    <li>Win/loss records</li>
                    <li>Virtual currency (coins) balance</li>
                    <li>In-game achievements and progress</li>
                  </ul>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                <li>Provide, maintain, and improve our game service</li>
                <li>Authenticate your identity and manage your account</li>
                <li>Track your game statistics and progress</li>
                <li>Manage virtual currency and in-game rewards</li>
                <li>Communicate with you about your account and our services</li>
                <li>Ensure the security and integrity of our service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">4. Data Storage and Security</h2>
              <p>
                Your data is stored securely in our database. We implement appropriate technical and 
                organizational measures to protect your personal information against unauthorized access, 
                alteration, disclosure, or destruction.
              </p>
              <p className="mt-2">
                However, no method of transmission over the Internet or electronic storage is 100% secure. 
                While we strive to use commercially acceptable means to protect your personal information, 
                we cannot guarantee its absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">5. Data Sharing</h2>
              <p>
                We do not sell, trade, or rent your personal information to third parties. We may share 
                your information only in the following circumstances:
              </p>
              <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                <li>With your consent</li>
                <li>To comply with legal obligations</li>
                <li>To protect and defend our rights or property</li>
                <li>To prevent or investigate possible wrongdoing in connection with our service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">6. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                <li>Access your personal data</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data (see Section 7)</li>
                <li>Withdraw consent for data processing</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">7. Data Deletion</h2>
              <p>
                You have the right to request deletion of your account and personal data. To request 
                data deletion:
              </p>
              <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                <li>Send an email to <a href="mailto:buxdao@gmail.com" className="text-blue-400 hover:text-blue-300 underline">buxdao@gmail.com</a> with the subject "Data Deletion Request"</li>
                <li>Include your username and the email address associated with your account</li>
                <li>We will process your request within 30 days</li>
              </ul>
              <p className="mt-4">
                <strong>Note:</strong> Some information may be retained for legal or operational purposes 
                (e.g., transaction records for financial compliance), but all personally identifiable 
                information will be removed or anonymized.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">8. Cookies and Tracking</h2>
              <p>
                We use session tokens stored in your browser's localStorage to maintain your login 
                session. These tokens are necessary for the service to function and are not shared 
                with third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">9. Third-Party Services</h2>
              <p>
                Our service uses authentication providers (Facebook and Discord) to authenticate users. 
                These providers have their own privacy policies governing how they collect and use your 
                information. We encourage you to review their privacy policies:
              </p>
              <ul className="list-disc list-inside ml-4 space-y-2 mt-2">
                <li><a href="https://www.facebook.com/privacy/explanation" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Facebook Privacy Policy</a></li>
                <li><a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Discord Privacy Policy</a></li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">10. Children's Privacy</h2>
              <p>
                Our service is not intended for users under the age of 13. We do not knowingly collect 
                personal information from children under 13. If we become aware that we have collected 
                personal information from a child under 13, we will take steps to delete such information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">11. Changes to This Privacy Policy</h2>
              <p>
                We may update our Privacy Policy from time to time. We will notify you of any changes 
                by posting the new Privacy Policy on this page and updating the "Last updated" date. 
                You are advised to review this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">12. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy or wish to exercise your rights, 
                please contact us at:
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

export default PrivacyPolicy;

