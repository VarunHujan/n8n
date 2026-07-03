import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App.tsx'

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginScreen } from './Login';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID_HERE";

// PrivateRoute component to protect the canvas
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = localStorage.getItem('auth_token') !== null;
  const requireLogin = import.meta.env.VITE_REQUIRE_LOGIN === 'true';
  
  if (requireLogin && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={
            <LoginScreen 
              onLoginSuccess={(token, user) => {
                localStorage.setItem('auth_token', token);
                localStorage.setItem('user_profile', JSON.stringify(user));
              }} 
            />
          } />
          <Route path="/" element={
            <PrivateRoute>
              <App />
            </PrivateRoute>
          } />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  </StrictMode>,
)
