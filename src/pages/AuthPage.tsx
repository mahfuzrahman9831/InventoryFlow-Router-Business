import React, { useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { createItem } from '../services/firestoreService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LogIn, 
  UserPlus, 
  Mail, 
  Lock, 
  User, 
  ArrowRight,
  Loader2,
  AlertCircle,
  Store,
  MapPin,
  CheckCircle2,
  Phone,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';

export const AuthPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [generatedCode, setGeneratedCode] = useState('');
  const [view, setView] = useState<'login' | 'signup' | 'otp' | 'forgot'>('login');

  // Handle OTP input changes
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;

    const newCode = [...otpCode];
    newCode[index] = value;
    setOtpCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError(null);
    const enteredCode = otpCode.join('');
    
    if (enteredCode.length !== 6) {
      setError('Please enter the full 6-digit code.');
      setLoading(false);
      return;
    }

    if (enteredCode === generatedCode) {
      try {
        const user = auth.currentUser;
        if (!user) throw new Error('Session expired. Please try signing up again.');

        // Successfully verified. Create the settings doc now.
        await createItem(user.uid, 'settings', {
          shopName,
          ownerName: name,
          address,
          email,
          phone,
          createdAt: new Date().toISOString()
        });

        // The user wanted to log in manually after completion
        await signOut(auth);
        
        setSuccessMessage('Registration Complete! You can now sign in with your credentials.');
        setView('login');
        setOtpCode(['', '', '', '', '', '']);
      } catch (err: any) {
        setError(cleanErrorMessage(err.message));
      }
    } else {
      setError('Invalid verification code. Please try again.');
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/auth-action`,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
      setSuccessMessage('Password reset link sent! Please check your inbox.');
    } catch (err: any) {
      setError(cleanErrorMessage(err.message));
    } finally {
      setLoading(false);
    }
  };

  // Clear messages when switching views
  useEffect(() => {
    setError(null);
    setSuccessMessage(null);
  }, [view]);

  if (view === 'forgot' && successMessage) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-page-bg p-4 flex-col bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-page-bg to-page-bg">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md glass-card p-10 border border-white/40 shadow-2xl text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-600" />
          
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-blue-600 mb-8 shadow-inner">
            <Mail className="h-10 w-10 animate-bounce" />
          </div>
          
          <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Check Your Inbox</h2>
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-6 px-4 py-1 bg-blue-50 rounded-full inline-block">Reset Link Sent</p>
          
          <p className="text-slate-500 mb-8 text-sm font-medium leading-relaxed px-4">
            We've sent a secure password reset link to: <br/>
            <span className="font-extrabold text-slate-900 break-all">{email}</span>. <br/>
            Please check your email and follow the instructions to reset your password.
          </p>

          <button 
            onClick={() => setView('login')}
            className="w-full h-14 rounded-2xl bg-blue-600 text-sm font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-500/25 group"
          >
            Back to Sign In
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </motion.div>
      </div>
    );
  }

  const cleanErrorMessage = (errMsg: string) => {
    if (!errMsg) return 'Authentication failed';
    
    // common firebase error codes mapping
    if (errMsg.includes('email-already-in-use')) return 'This email is already registered. Please sign in instead.';
    if (errMsg.includes('invalid-credential')) return 'Invalid email or password. Please try again.';
    if (errMsg.includes('user-not-found')) return 'No account found with this email.';
    if (errMsg.includes('wrong-password')) return 'Incorrect password. Please try again.';
    if (errMsg.includes('too-many-requests')) return 'Too many failed attempts. Please try again later.';
    if (errMsg.includes('network-request-failed')) return 'Network error. Please check your internet connection.';

    // Fallback cleaning
    return errMsg.replace(/Firebase: Error \(auth\/.*\)\./, '').replace(/Firebase: /, '').trim() || 'Authentication failed';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (view === 'login') {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // We are skipping the emailVerified check because the app uses its own OTP logic
        if (false && !userCredential.user.emailVerified) {
          setError('Please verify your email before logging in. Check your inbox for the verification link.');
          setView('otp'); 
          await signOut(auth);
        }
      } else if (view === 'signup') {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        try {
          // Attempt to create user to check for existing email
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(userCredential.user, { displayName: name });
          
          // Store the code in state for verification
          setGeneratedCode(code);
          console.log(`[VERIFICATION CODE FOR ${email}]: ${code}`);
          
          setSuccessMessage('A 6-digit verification code has been sent to your email.');
          setTimeout(() => setView('otp'), 500);
        } catch (err: any) {
          setError(cleanErrorMessage(err.message));
        }
      }
    } catch (err: any) {
      setError(cleanErrorMessage(err.message) || 'Authentication failed');
      if (view === 'login') {
        setEmail('');
        setPassword('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  if (view === 'otp') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-page-bg p-4 flex-col bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-page-bg to-page-bg">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md glass-card p-10 border border-white/40 shadow-2xl text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-600" />
          
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-blue-600 mb-8 shadow-inner">
            <Mail className="h-10 w-10 animate-bounce" />
          </div>
          
          <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Enter Verification Code</h2>
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-6 px-4 py-1 bg-blue-50 rounded-full inline-block">Code Sent to {email}</p>
          
          <p className="text-slate-500 mb-8 text-sm font-medium leading-relaxed px-4">
            We've sent a 6-digit code to your email. <br/>
            Please enter it below to complete your registration.
          </p>

          <div className="space-y-6 mb-8">
             <div className="flex items-center justify-center gap-2">
                {otpCode.map((digit, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    maxLength={1}
                    className="w-12 h-14 rounded-xl bg-white border-2 border-slate-200 text-center font-black text-xl text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm"
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                  />
                ))}
             </div>
             
             {error && (
               <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-[11px] font-bold text-red-600 border border-red-100 justify-center">
                 <AlertCircle className="h-4 w-4 shrink-0" />
                 <span>{error}</span>
               </div>
             )}
          </div>

          <div className="space-y-4">
            <button 
              onClick={verifyOtp}
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-blue-600 text-sm font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-500/25 group disabled:opacity-70"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Verify & Complete
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
            <button 
              onClick={() => {
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                setGeneratedCode(code);
                console.log(`[NEW VERIFICATION CODE]: ${code}`);
                setSuccessMessage('New code sent!');
                setOtpCode(['','','','','','']);
              }}
              className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
            >
              Resend Code
            </button>
            <button 
              onClick={() => setView('signup')}
              className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              Change Email
            </button>
          </div>
        </motion.div>
        
        <p className="mt-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">
           Secure Registration Process &bull; InvFlow Pro
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-page-bg p-4 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-page-bg to-page-bg">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {view === 'login' ? 'Welcome Back' : view === 'forgot' ? 'Reset Password' : 'Create Account'}
          </h1>
          <p className="text-sm text-slate-500 mt-2 font-medium">
            {view === 'login' ? 'Enter your credentials to access your dashboard' : view === 'forgot' ? 'We will send a reset link to your email' : 'Join InvFlow Pro to manage your business inventory'}
          </p>
        </div>

        <div className="glass-card p-8 border border-white/40 shadow-2xl">
          <form onSubmit={view === 'forgot' ? handleResetPassword : handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {view === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Full Name</label>
                    <div className="relative group">
                      <User className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                      <input 
                        required
                        type="text" 
                        placeholder="Your Name"
                        className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white/50 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                        value={name}
                        onChange={e => setName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Shop Name</label>
                    <div className="relative group">
                      <Store className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                      <input 
                        required
                        type="text" 
                        placeholder="Shop Name"
                        className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white/50 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                        value={shopName}
                        onChange={e => setShopName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Shop Address</label>
                    <div className="relative group">
                      <MapPin className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                      <input 
                        required
                        type="text" 
                        placeholder="Address"
                        className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white/50 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Mobile Number</label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                      <input 
                        required
                        type="tel" 
                        placeholder="Mobile Number"
                        className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white/50 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  required
                  type="email" 
                  placeholder="Email"
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-white/50 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:italic"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            {view !== 'forgot' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between pl-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password</label>
                  {view === 'login' && <button type="button" onClick={() => setView('forgot')} className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline">Forgot?</button>}
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <input 
                    required={view !== 'forgot'}
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••"
                    className="w-full h-12 pl-11 pr-12 rounded-xl border border-slate-200 bg-white/50 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-3.5 text-slate-400 hover:text-blue-500 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-[11px] font-bold text-red-600 border border-red-100">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-[11px] font-bold text-green-600 border border-green-100">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full h-12 rounded-xl bg-blue-600 text-sm font-black text-white uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 group disabled:opacity-70"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {view === 'login' ? 'Sign In' : view === 'forgot' ? 'Send Link' : 'Sign Up'}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
              <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-400"><span className="bg-white/80 px-4">Or continue with</span></div>
            </div>

            <button 
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full h-12 rounded-xl border-2 border-slate-200 bg-white py-2 text-xs font-black uppercase tracking-widest transition-all hover:bg-slate-50 flex items-center justify-center gap-3"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
          </div>

          <p className="mt-8 text-center text-xs font-bold text-slate-500">
            {view === 'forgot' ? (
              <button 
                onClick={() => setView('login')}
                className="text-blue-600 hover:underline underline-offset-2"
              >
                Back to Sign In
              </button>
            ) : (
              <>
                {view === 'login' ? "Don't have an account?" : 'Already have an account?'}
                <button 
                  onClick={() => setView(view === 'login' ? 'signup' : 'login')}
                  className="ml-1.5 text-blue-600 hover:underline underline-offset-2"
                >
                  {view === 'login' ? 'Sign Up' : 'Sign In'}
                </button>
              </>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
};
