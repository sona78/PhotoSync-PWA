import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import './Auth.css';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handlePasswordlessLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    console.log('[Auth] Starting passwordless login for:', email);
    console.log('[Auth] Window origin:', window.location.origin);

    // Check if running on unusual port
    if (window.location.port === '3002') {
      console.warn('[Auth] ⚠️ WARNING: Running on port 3002 (signaling server port)');
      console.warn('[Auth] The PWA should run on port 3000 or 3001');
      console.warn('[Auth] This may cause authentication issues');
    }

    try {
      console.log('[Auth] Calling supabase.auth.signInWithOtp...');
      console.log('[Auth] Email redirect URL:', window.location.origin);

      const result = await Promise.race([
        supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: window.location.origin,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
        )
      ]);

      console.log('[Auth] Supabase response:', result);

      if (result.error) {
        console.error('[Auth] Supabase error:', result.error);
        setMessage(`ERROR: ${result.error.message}`);
      } else {
        console.log('[Auth] Success! Email sent.');
        setMessage('CHECK YOUR EMAIL FOR THE LOGIN LINK. CLICK THE LINK TO SIGN IN.');
      }
    } catch (error) {
      console.error('[Auth] Exception caught:', error);

      let errorMessage = error.message;

      if (error.message.includes('timeout')) {
        errorMessage = 'Connection timeout. Possible issues:\n' +
          '1. Check your internet connection\n' +
          '2. Visit /test-supabase.html to diagnose\n' +
          '3. Check Supabase dashboard: Email auth enabled?\n' +
          '4. Check browser console for CORS errors';
      }

      setMessage(`ERROR: ${errorMessage}`);
    } finally {
      console.log('[Auth] Finished (loading = false)');
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-header">PHOTOSYNC AUTH</div>
        
        <form onSubmit={handlePasswordlessLogin} className="auth-form">
          <div className="auth-field">
            <label>EMAIL:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              disabled={loading}
              className="auth-input"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email}
            className="auth-button"
          >
            {loading ? 'SENDING...' : 'SEND LOGIN LINK'}
          </button>
        </form>

        {message && (
          <div className={`auth-message ${message.includes('ERROR') ? 'error' : ''}`}>
            {message}
          </div>
        )}

        <div className="auth-info">
          <p>ENTER YOUR EMAIL ADDRESS TO RECEIVE A PASSWORDLESS LOGIN LINK.</p>
          <p>CLICK THE LINK IN YOUR EMAIL TO SIGN IN AUTOMATICALLY.</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
