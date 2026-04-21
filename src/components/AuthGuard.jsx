import { useState } from 'react';
import { useAuth } from '../firebase/AuthContext.jsx';

export default function AuthGuard({ children }) {
  const { user, loading, loginWithGoogle } = useAuth();
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-stone-950 flex items-center justify-center" style={{ zIndex: 9999 }}>
        <p className="text-stone-400 text-lg">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-stone-950 flex items-center justify-center" style={{ zIndex: 9999 }}>
        <div className="bg-stone-900 border border-stone-700 rounded-xl p-8 max-w-sm w-full mx-4 text-center">
          <img src="/images/logo-color.png" alt="Ultraphonics" className="w-20 h-20 rounded-full mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Admin Access</h1>
          <p className="text-stone-400 text-sm mb-6">Sign in with an authorized Google account.</p>
          {authError && (
            <p className="text-red-400 text-sm mb-4 bg-red-950/30 rounded p-3">{authError}</p>
          )}
          <button
            className="w-full py-3 px-4 bg-white text-stone-900 font-semibold rounded-lg hover:bg-stone-100 transition-colors disabled:opacity-50 cursor-pointer"
            disabled={signingIn}
            onClick={async () => {
              setSigningIn(true);
              setAuthError('');
              try {
                await loginWithGoogle();
              } catch (err) {
                setAuthError(err.message || 'Sign-in failed. Please try again.');
              } finally {
                setSigningIn(false);
              }
            }}
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  return children;
}
