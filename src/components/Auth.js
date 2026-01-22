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

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        setMessage(`ERROR: ${error.message}`);
      } else {
        setMessage('CHECK YOUR EMAIL FOR THE LOGIN LINK. CLICK THE LINK TO SIGN IN.');
      }
    } catch (error) {
      setMessage(`ERROR: ${error.message}`);
    } finally {
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
