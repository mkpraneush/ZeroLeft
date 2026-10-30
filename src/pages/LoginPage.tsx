import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import './AuthPages.css';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  
  // Verification code step state
  const [step, setStep] = useState<'credentials' | 'verification'>('credentials');
  const [pendingEmail, setPendingEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const requestedLocation = (location.state as {
    from?: { pathname?: string; search?: string; hash?: string };
  } | null)?.from;

  const dashboardFor = (role: string) => {
    const requestedPath = requestedLocation?.pathname || '';
    const isRolePath = role === 'vendor'
      ? requestedPath.startsWith('/vendor/')
      : requestedPath.startsWith('/customer/') || requestedPath === '/offers' || requestedPath.startsWith('/offer/');
    return isRolePath
      ? `${requestedPath}${requestedLocation?.search || ''}${requestedLocation?.hash || ''}`
      : role === 'vendor' ? '/vendor/dashboard' : '/customer/dashboard';
  };

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Login mutation (Step 1)
  const loginMutation = useMutation({
    mutationFn: (data: FormValues) => api.post('/auth/login', data),
    onSuccess: (res) => {
      const data = res.data;
      if (data.requires_verification) {
        // Customer needs verification code
        setPendingEmail(data.email);
        setStep('verification');
        toast('Check your email for a one-time verification code.', { icon: '🔐' });
      } else {
        // Direct login (vendor / admin or pre-verified)
        const { access_token, role, user_id, full_name, email, is_email_verified } = data;
        setAuth(access_token, { user_id, role, full_name, email, is_email_verified });
        toast.success(`Welcome back, ${full_name?.split(' ')[0] || 'User'}! 👋`);
        navigate(dashboardFor(role), { replace: true });
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Invalid email or password');
    },
  });

  // Verification code mutation (Step 2)
  const verifyMutation = useMutation({
    mutationFn: (code: string) => api.post('/auth/verify-code', { email: pendingEmail, code }),
    onSuccess: (res) => {
      const { access_token, role, user_id, full_name, email, is_email_verified } = res.data;
      setAuth(access_token, { user_id, role, full_name, email, is_email_verified });
      toast.success('Email verified. Welcome to your dashboard.');
      navigate(dashboardFor(role), { replace: true });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || 'Could not verify this code.';
      setVerificationError(msg);
      toast.error(msg);
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => api.post('/auth/resend-verification', null, { params: { email: pendingEmail } }),
    onSuccess: (res) => toast.success(res.data.message),
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Could not resend the verification code.'),
  });

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError('');
    if (!verificationCode.trim()) {
      setVerificationError('Enter the six-digit code sent to your email.');
      return;
    }
    verifyMutation.mutate(verificationCode.trim());
  };

  return (
    <div className="auth-page">
      <div className="auth-split">
        {/* Decorative panel */}
        <div className="auth-panel login-panel">
          <div className="auth-panel-content">
            <div className="auth-logo">
              <img src="/assets/logo.png" alt="ZeroLeft" style={{ height: '48px', width: 'auto', background: 'white', padding: '6px 12px', borderRadius: '12px' }} />
            </div>
            <h2>Welcome to ZeroLeft!</h2>
            <p>Connect with local street vendors and rescue fresh surplus produce before the day ends.</p>
            <div className="auth-panel-features">
              <div className="auth-panel-feat"><span>🍅</span> Real-time local farm &amp; produce updates</div>
              <div className="auth-panel-feat"><span>📧</span> Opt-in email alerts for matching nearby offers</div>
              <div className="auth-panel-feat"><span>🔐</span> Email-verified customer accounts</div>
            </div>
          </div>
        </div>

        {/* Form side */}
        <div className="auth-form-side">
          <div className="auth-form-box">
            {step === 'credentials' ? (
              <>
                <div className="auth-form-header">
                  <h1>Sign in to ZeroLeft</h1>
                  <p>New customer or vendor? <Link to="/register">Create an account</Link></p>
                </div>

                <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} noValidate>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label" htmlFor="login-email">Email Address</label>
                      <div className="input-icon-wrap">
                        <Mail size={16} className="input-icon" />
                        <input
                          id="login-email"
                          type="email"
                          className={`form-input input-with-icon ${errors.email ? 'error' : ''}`}
                          placeholder="you@example.com"
                          autoComplete="email"
                          {...register('email')}
                        />
                      </div>
                      {errors.email && <span className="form-error">{errors.email.message}</span>}
                    </div>

                    <div className="form-group">
                      <div className="form-label-row">
                        <label className="form-label" htmlFor="login-password">Password</label>
                      </div>
                      <div className="input-icon-wrap">
                        <Lock size={16} className="input-icon" />
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          className={`form-input input-with-icon input-with-toggle ${errors.password ? 'error' : ''}`}
                          placeholder="Your password"
                          autoComplete="current-password"
                          {...register('password')}
                        />
                        <button
                          type="button"
                          className="input-toggle"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label="Toggle password visibility"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {errors.password && <span className="form-error">{errors.password.message}</span>}
                    </div>
                  </div>

                  <button
                    type="submit"
                    id="login-submit"
                    className="btn btn-primary btn-full btn-lg"
                    style={{ marginTop: '20px' }}
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Checking credentials…</>
                    ) : (
                      <>Continue to Dashboard <ArrowRight size={16} /></>
                    )}
                  </button>

                </form>

                <div className="auth-divider"><span>or register</span></div>

                <div className="auth-register-cta">
                  <div className="auth-register-btns">
                    <Link to="/register?role=customer" className="btn btn-outline">
                      Register as Customer
                    </Link>
                    <Link to="/register?role=vendor" className="btn btn-orange">
                      Shopkeeper Login / Register
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              /* Verification Code Step */
              <div className="verification-step animate-fade-in">
                <div className="auth-form-header">
                  <div className="verification-icon-wrap" style={{ margin: '0 auto 16px', width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534' }}>
                    <ShieldCheck size={32} />
                  </div>
                  <h1>Customer Verification</h1>
                  <p>
                    Please enter the verification code to access your customer dashboard.
                  </p>
                </div>

                <div className="alert alert-info" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.9rem' }}>
                  Check your email for the one-time verification code. The code expires after 15 minutes.
                </div>

                <form onSubmit={handleVerifySubmit}>
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label" htmlFor="verification-code-input" style={{ fontWeight: 600 }}>
                      6-Digit Verification Code
                    </label>
                    <input
                      id="verification-code-input"
                      type="text"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => {
                        setVerificationCode(e.target.value);
                        setVerificationError('');
                      }}
                      placeholder="123456"
                      autoFocus
                      style={{
                        fontSize: '1.75rem',
                        letterSpacing: '8px',
                        textAlign: 'center',
                        fontWeight: 700,
                        padding: '12px',
                        borderRadius: '12px',
                        border: verificationError ? '2px solid #ef4444' : '2px solid #166534',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                    {verificationError && (
                      <span className="form-error" style={{ color: '#ef4444', display: 'block', marginTop: 6, fontSize: '0.85rem' }}>
                        {verificationError}
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    id="verify-submit-btn"
                    className="btn btn-primary btn-full btn-lg"
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending ? (
                      <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Verifying…</>
                    ) : (
                      'Verify & Access Dashboard'
                    )}
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-full"
                    style={{ marginTop: '8px' }}
                    onClick={() => resendMutation.mutate()}
                    disabled={resendMutation.isPending || !pendingEmail}
                  >
                    {resendMutation.isPending ? 'Sending…' : 'Resend verification code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep('credentials');
                      setVerificationError('');
                      setVerificationCode('');
                    }}
                    className="btn btn-outline btn-full"
                    style={{ marginTop: '12px' }}
                  >
                    <ArrowLeft size={16} /> Back to Sign In
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
