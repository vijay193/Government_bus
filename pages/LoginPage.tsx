


import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Captcha } from '../components/common/Captcha';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { KeyRound, Smartphone } from 'lucide-react';
import type { User } from '../types';
import { UserRole } from '../types';

type LoginMode = 'password' | 'otp';

export const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<LoginMode>('password');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const handleLoginSuccess = (sessionData: { token: string; user: User }) => {
    login(sessionData);
    if (sessionData.user.role === UserRole.ADMIN || sessionData.user.role === UserRole.SUB_ADMIN) {
        navigate('/admin');
    } else {
        navigate('/');
    }
  };

  const validatePhone = (phoneNumber: string): boolean => {
    if (phoneNumber.length !== 10) {
      setError("Phone number must be exactly 10 digits.");
      return false;
    }
    setError(null);
    return true;
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePhone(phone)) return;
    if (!isCaptchaVerified) {
      setError("Please complete the captcha.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const sessionData = await api.login(phone, password);
      if (sessionData) {
        handleLoginSuccess(sessionData);
      } else {
        setError("Invalid phone number or password.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!validatePhone(phone)) return;
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await api.sendOtp(phone);
      // For simulation, we get the OTP back. In production, this would be sent via SMS.
      setSuccessMessage(`${response.message} For testing, your OTP is: ${response.otp}`);
      setIsOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePhone(phone)) return;
    setIsLoading(true);
    setError(null);
    try {
      const sessionData = await api.verifyOtp(phone, otp);
      if (sessionData) {
        handleLoginSuccess(sessionData);
      } else {
        setError("Invalid OTP. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred during OTP verification.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderPasswordForm = () => (
    <form onSubmit={handlePasswordSubmit} className="auth-form">
      {error && <p className="auth-form__error">{error}</p>}
      <Input id="phone" label="Phone Number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required maxLength={10} pattern="\d{10}" title="Please enter a 10-digit phone number."/>
      <Input id="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <Captcha onVerify={setIsCaptchaVerified} />
      <Button type="submit" isLoading={isLoading} disabled={!isCaptchaVerified || isLoading}>
        Login with Password
      </Button>
    </form>
  );

  const renderOtpForm = () => (
    <form onSubmit={handleOtpSubmit} className="auth-form">
      {error && <p className="auth-form__error">{error}</p>}
      {successMessage && <p className="auth-form__success">{successMessage}</p>}
      <Input
        id="phone"
        label="Phone Number"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
        required
        disabled={isOtpSent}
        maxLength={10} 
        pattern="\d{10}" 
        title="Please enter a 10-digit phone number."
      />
      {isOtpSent ? (
        <>
          <Input
            id="otp"
            label="Enter OTP"
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
            maxLength={6}
          />
          <Button type="submit" isLoading={isLoading}>Login with OTP</Button>
        </>
      ) : (
        <Button type="button" onClick={handleSendOtp} isLoading={isLoading}>
          Send OTP
        </Button>
      )}
    </form>
  );

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="booking-page__booking-type-toggle" style={{ margin: '0 auto 2rem' }}>
          <button onClick={() => setMode('password')} className={`booking-page__booking-type-btn ${mode === 'password' ? 'booking-page__booking-type-btn--active-normal' : ''}`}>
            <KeyRound size={18} /> Password
          </button>
          <button onClick={() => setMode('otp')} className={`booking-page__booking-type-btn ${mode === 'otp' ? 'booking-page__booking-type-btn--active-free' : ''}`}>
            <Smartphone size={18} /> OTP
          </button>
        </div>
        <h2 className="auth-card__title" style={{ marginTop: 0 }}>
            {mode === 'password' ? "User Login" : "Beneficiary Login"}
        </h2>
        
        {mode === 'password' ? renderPasswordForm() : renderOtpForm()}
        
        <div className="auth-card__footer">
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="auth-card__footer-link">
              Register here
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
};