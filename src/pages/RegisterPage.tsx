import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Phone, Store, ShoppingBag, ArrowRight } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import './AuthPages.css';

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
  role: z.enum(['customer', 'vendor']),
}).refine((d) => d.password === d.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRole = (searchParams.get('role') as 'customer' | 'vendor') || 'customer';
  const { setAuth } = useAuthStore();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: defaultRole },
  });

  const selectedRole = watch('role');

  const registerMutation = useMutation({
    mutationFn: (data: FormValues) => api.post('/auth/register', {
      full_name: data.full_name,
      email: data.email,
      phone: data.phone || undefined,
      password: data.password,
      role: data.role,
    }),
    onSuccess: (res) => {
      const { access_token, role, user_id, full_name, email, is_email_verified } = res.data;
      setAuth(access_token, { user_id, role, full_name, email, is_email_verified });
      toast.success(role === 'vendor' ? 'Account created. Set up your shop profile.' : 'Account created. Set up your customer profile.');
      navigate(role === 'vendor' ? '/vendor/profile' : '/customer/profile', { replace: true });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      if (!err?.response) {
        toast.error('Cannot reach the server. Start the backend on port 8000.');
        return;
      }
      toast.error(typeof detail === 'string' ? detail : 'Registration failed. Please try again.');
    },
  });

  return (
    <div className="auth-page">
      <div className="auth-split">
        {/* Decorative panel */}
        <div className="auth-panel register-panel">
          <div className="auth-panel-content">
            <div className="auth-logo">
              <img src="/assets/logo.png" alt="ZeroLeft" style={{ height: '48px', width: 'auto', background: 'white', padding: '6px 12px', borderRadius: '12px' }} />
            </div>
            <h2>Join ZeroLeft Today</h2>
            <p>Whether you're shopping for fresh farm harvest or selling surplus produce before the day ends, ZeroLeft has you covered.</p>
            <div className="auth-panel-features">
              <div className="auth-panel-feat"><span>🌱</span> Zero produce wasted in our communities</div>
              <div className="auth-panel-feat"><span>🔔</span> Opt-in alerts for matching nearby offers</div>
              <div className="auth-panel-feat"><span>💰</span> Big discounts on fresh fruits, vegetables, and flowers</div>
            </div>
          </div>
        </div>

        {/* Form side */}
        <div className="auth-form-side">
          <div className="auth-form-box">
                <div className="auth-form-header">
                  <h1>Create an Account</h1>
                  <p>Already have an account? <Link to="/login">Sign in</Link></p>
                </div>

                <form onSubmit={handleSubmit((d) => registerMutation.mutate(d))} noValidate>
                  {/* Role Selector */}
                  <div className="role-selector">
                    <button
                      type="button"
                      className={`role-btn ${selectedRole === 'customer' ? 'active' : ''}`}
                      onClick={() => setValue('role', 'customer')}
                    >
                      <ShoppingBag size={20} />
                      <div className="role-btn-text">
                        <strong>Customer</strong>
                        <span>I want to buy fresh surplus</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`role-btn ${selectedRole === 'vendor' ? 'active' : ''}`}
                      onClick={() => setValue('role', 'vendor')}
                    >
                      <Store size={20} />
                      <div className="role-btn-text">
                        <strong>Shopkeeper</strong>
                        <span>I want to sell surplus produce</span>
                      </div>
                    </button>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-name">Full Name</label>
                      <div className="input-icon-wrap">
                        <User size={16} className="input-icon" />
                        <input
                          id="reg-name"
                          type="text"
                          className={`form-input input-with-icon ${errors.full_name ? 'error' : ''}`}
                          placeholder="Your full name"
                          autoComplete="name"
                          {...register('full_name')}
                        />
                      </div>
                      {errors.full_name && <span className="form-error">{errors.full_name.message}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-email">Email Address</label>
                      <div className="input-icon-wrap">
                        <Mail size={16} className="input-icon" />
                        <input
                          id="reg-email"
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
                      <label className="form-label" htmlFor="reg-phone">Phone Number (Optional)</label>
                      <div className="input-icon-wrap">
                        <Phone size={16} className="input-icon" />
                        <input
                          id="reg-phone"
                          type="tel"
                          className="form-input input-with-icon"
                          placeholder="+91 98765 43210"
                          autoComplete="tel"
                          {...register('phone')}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-password">Password</label>
                      <div className="input-icon-wrap">
                        <Lock size={16} className="input-icon" />
                        <input
                          id="reg-password"
                          type={showPassword ? 'text' : 'password'}
                          className={`form-input input-with-icon input-with-toggle ${errors.password ? 'error' : ''}`}
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
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

                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-confirm">Confirm Password</label>
                      <div className="input-icon-wrap">
                        <Lock size={16} className="input-icon" />
                        <input
                          id="reg-confirm"
                          type={showConfirm ? 'text' : 'password'}
                          className={`form-input input-with-icon input-with-toggle ${errors.confirm_password ? 'error' : ''}`}
                          placeholder="Re-enter password"
                          autoComplete="new-password"
                          {...register('confirm_password')}
                        />
                        <button
                          type="button"
                          className="input-toggle"
                          onClick={() => setShowConfirm(!showConfirm)}
                          aria-label="Toggle confirm password visibility"
                        >
                          {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {errors.confirm_password && <span className="form-error">{errors.confirm_password.message}</span>}
                    </div>
                  </div>

                  <button
                    type="submit"
                    id="register-submit"
                    className="btn btn-primary btn-full btn-lg"
                    style={{ marginTop: '20px' }}
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? (
                      <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Registering…</>
                    ) : (
                      <>Create Account <ArrowRight size={16} /></>
                    )}
                  </button>
                </form>
          </div>
        </div>
      </div>
    </div>
  );
}
