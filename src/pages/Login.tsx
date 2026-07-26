import React from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { ShoppingBag, ShieldCheck } from 'lucide-react';

// Helper sederkena decoding JWT tanpa dependency tambahan
function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse JWT', e);
    return null;
  }
}

export const Login: React.FC = () => {
  const { login } = useAuth();

  const handleSuccess = (credentialResponse: CredentialResponse) => {
    if (credentialResponse.credential) {
      const decoded = parseJwt(credentialResponse.credential);
      if (decoded) {
        login({
          id: decoded.sub,
          email: decoded.email,
          name: decoded.name || decoded.email.split('@')[0],
          picture: decoded.picture,
        });
      }
    }
  };

  const handleError = () => {
    console.error('Login Google Gagal');
    alert('Autentikasi gagal. Silakan coba lagi.');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-red-600/20 rounded-full border border-red-500/30">
            <ShoppingBag className="w-12 h-12 text-red-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Toko Merah Putih</h1>
          <p className="text-slate-400 text-sm">
            Silakan masuk dengan akun Google petugas untuk membuka Kiosk Pemesanan.
          </p>
        </div>

        <div className="pt-4 flex flex-col items-center justify-center">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            theme="filled_blue"
            size="large"
            shape="pill"
            text="signin_with"
          />
        </div>

        <div className="pt-6 border-t border-slate-700/50 flex items-center justify-center space-x-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Sistem Terverifikasi & Terintegrasi GAS</span>
        </div>
      </div>
    </div>
  );
};
