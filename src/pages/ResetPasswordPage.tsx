import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { motion } from 'motion/react';
import { Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2, ChevronLeft, Eye, EyeOff } from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const oobCode = searchParams.get('oobCode');

  useEffect(() => {
    const checkCode = async () => {
      if (!oobCode) {
        setError('Invalid or expired password reset link.');
        setVerifying(false);
        return;
      }

      try {
        const userEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(userEmail);
      } catch (err: any) {
        setError('The password reset link is invalid or has already been used.');
      } finally {
        setVerifying(false);
      }
    };

    checkCode();
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (!oobCode) return;

    setLoading(true);
    setError(null);

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError('Failed to update password. Pleas try again.');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-page-bg">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-page-bg p-4 flex-col bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-page-bg to-page-bg">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass-card p-10 border border-white/40 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.3)]" />
        
        {success ? (
          <div className="text-center py-4">
            <div className="inline-flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-green-50 text-green-600 mb-8 shadow-inner ring-8 ring-green-50/50">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Security Updated</h2>
            <p className="text-[11px] font-black text-green-600 uppercase tracking-[0.2em] mb-8 px-5 py-1.5 bg-green-50/80 backdrop-blur-sm rounded-full inline-block border border-green-100">Ready to Login</p>
            <p className="text-slate-500 mb-10 text-sm font-medium leading-relaxed max-w-[280px] mx-auto">
              Your password has been successfully reset. You can now use your new credentials to access your dashboard.
            </p>
            <button 
              onClick={() => navigate('/')}
              className="w-full h-14 rounded-2xl bg-blue-600 text-sm font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-500/30 group active:scale-[0.98]"
            >
              Back to Sign In
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-12">
              <div className="inline-flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-blue-50 text-blue-600 mb-8 shadow-inner ring-8 ring-blue-50/50">
                <Lock className="h-12 w-12" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">New Password</h2>
              <div className="flex flex-col items-center gap-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Restoring identity for</p>
                <p className="text-sm font-extrabold text-blue-600 break-all bg-blue-50/50 px-3 py-1 rounded-lg border border-blue-100/50">{email}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-7">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1">New Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input 
                    required
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••"
                    className="w-full h-13 pl-11 pr-12 rounded-2xl border border-slate-200 bg-white/60 backdrop-blur-sm text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:italic"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 inset-y-0 flex items-center text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest pl-1">Confirm Identity</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input 
                    required
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="••••••••"
                    className="w-full h-13 pl-11 pr-12 rounded-2xl border border-slate-200 bg-white/60 backdrop-blur-sm text-sm font-bold outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:italic"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 inset-y-0 flex items-center text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-[11px] font-bold text-red-600 border border-red-100 shadow-sm shadow-red-500/5"
                >
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}

              <div className="pt-2">
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full h-15 rounded-2xl bg-blue-600 text-sm font-black text-white uppercase tracking-[0.2em] hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-500/30 group disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      Update Password
                      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>

              <button 
                type="button"
                onClick={() => navigate('/')}
                className="w-full flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-900 transition-all pt-4 group shrink-0"
              >
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                Return to Login
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
};
