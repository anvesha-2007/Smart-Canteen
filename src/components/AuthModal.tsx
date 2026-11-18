import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'login' | 'register';
}

export function AuthModal({ open, onOpenChange, defaultTab = 'login' }: AuthModalProps) {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>(defaultTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engg');
  const [enrollmentId, setEnrollmentId] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      if (tab === 'login') {
        const u = await loginWithEmail(email, password);
        toast.success(`Welcome back, ${u.fullName}`);
      } else {
        const u = await registerWithEmail({
          email,
          password,
          fullName,
          department,
          enrollmentId,
          phone,
        });
        toast.success(`Account created! Welcome, ${u.fullName}`);
      }
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const u = await loginWithGoogle();
      toast.success(`Signed in as ${u.fullName}`);
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Google Sign-In was cancelled or failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPass: string, roleLabel: string) => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const u = await loginWithEmail(demoEmail, demoPass);
      toast.success(`Signed in as ${u.fullName} (${roleLabel})`);
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Demo login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#202124]">
            {tab === 'login' ? 'Sign in to Smart Canteen' : 'Create your campus account'}
          </DialogTitle>
          <DialogDescription>
            {tab === 'login'
              ? 'Pre-order campus meals, track preparation live, and collect with QR codes.'
              : 'Register with your college credentials to place canteen pre-orders.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex rounded-lg bg-[#F3F2EE] p-1">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg('');
            }}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'login'
                ? 'bg-white text-[#202124] shadow-sm'
                : 'text-[#5F6368] hover:text-[#202124]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg('');
            }}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'register'
                ? 'bg-white text-[#202124] shadow-sm'
                : 'text-[#5F6368] hover:text-[#202124]'
            }`}
          >
            Register
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full h-11 font-semibold"
          onClick={handleGoogleSignIn}
          disabled={submitting}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-[#E7E5E0]" />
          <span className="mx-3 text-xs text-[#5F6368]">or with campus email</span>
          <div className="flex-grow border-t border-[#E7E5E0]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {tab === 'register' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#202124]">
                  Full Name
                </label>
                <Input
                  required
                  placeholder="Anvesha Jaiswal"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#202124]">
                    Enrollment / Staff ID
                  </label>
                  <Input
                    placeholder="EN24CS3010200"
                    value={enrollmentId}
                    onChange={(e) => setEnrollmentId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#202124]">
                    Department
                  </label>
                  <Input
                    placeholder="Computer Science"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#202124]">
              Email Address
            </label>
            <Input
              type="email"
              required
              placeholder="you@campus.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#202124]">
              Password
            </label>
            <Input
              type="password"
              required
              minLength={6}
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {tab === 'register' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#202124]">
                Mobile Number (optional)
              </label>
              <Input
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}

          <Button type="submit" className="w-full h-11" disabled={submitting}>
            {submitting
              ? 'Please wait...'
              : tab === 'login'
              ? 'Sign In'
              : 'Create Account'}
          </Button>
        </form>

        <div className="border-t border-[#E7E5E0] pt-4">
          <p className="mb-2.5 text-xs font-semibold text-[#5F6368]">
            Demo Accounts (Quick Role Preview)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => handleDemoLogin('student@campus.edu', 'Student@123', 'Student')}
            >
              Student Demo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => handleDemoLogin('staff@campus.edu', 'Staff@123', 'Canteen Staff')}
            >
              Staff Demo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => handleDemoLogin('admin@campus.edu', 'Admin@123', 'Admin')}
            >
              Admin Demo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
