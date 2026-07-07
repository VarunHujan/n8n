import React from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LoginProps {
  onLoginSuccess: (token: string, refreshToken: string | undefined, user: { name: string, email: string }) => void;
}

export const LoginScreen: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();

  const handleLogin = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/contacts.readonly',
    prompt: 'consent',
    // @ts-ignore - access_type is supported by the underlying Google GIS but types might complain
    access_type: 'offline',
    onSuccess: async (codeResponse) => {
      console.log('Got Auth Code:', codeResponse.code);
      
      try {
        const res = await fetch('http://localhost:3000/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeResponse.code })
        });
        const data = await res.json();
        
        if (data.success) {
          onLoginSuccess(data.access_token, data.refresh_token, data.user);
          navigate('/');
        } else {
          console.error("Backend auth failed:", data.error);
        }
      } catch (error) {
        console.error("Failed to authenticate with backend", error);
      }
    },
    onError: (error) => console.log('Login Failed:', error)
  });

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-icon-wrapper">
          <Zap size={32} />
        </div>
        <h1 className="login-title">Welcome Back</h1>
        <p className="login-subtitle">Sign in to sync your workflows and authenticate your automation nodes.</p>
        
        <button className="google-auth-btn" onClick={handleLogin}>
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M47.532 24.5528C47.532 22.9214 47.3997 21.2811 47.1175 19.6761H24.48V28.9181H37.4434C36.9055 31.8988 35.177 34.5356 32.6461 36.2111V42.2078H40.3801C44.9217 38.0278 47.532 31.8547 47.532 24.5528Z" fill="#4285F4"/>
            <path d="M24.48 48.0016C30.9529 48.0016 36.4116 45.8764 40.3888 42.2078L32.6549 36.2111C30.5031 37.675 27.7253 38.5056 24.48 38.5056C18.2276 38.5056 12.9305 34.2798 11.0139 28.6006H3.03296V34.7825C7.10718 42.8868 15.4056 48.0016 24.48 48.0016Z" fill="#34A853"/>
            <path d="M11.0051 28.6006C9.99973 25.6199 9.99973 22.3923 11.0051 19.4117V13.2297H3.03296C-0.371021 20.0012 -0.371021 28.0111 3.03296 34.7825L11.0051 28.6006Z" fill="#FBBC04"/>
            <path d="M24.48 9.49606C27.9016 9.42125 31.2086 10.7027 33.6841 13.0573L40.5387 6.20263C36.1956 2.14818 30.4184 -0.0619894 24.48 0.00125439C15.4056 0.00125439 7.10718 5.11603 3.03296 13.2297L11.0051 19.4117C12.9129 13.7237 18.2188 9.49606 24.48 9.49606Z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
};
