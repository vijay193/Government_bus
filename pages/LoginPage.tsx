import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Captcha } from '../components/common/Captcha';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

export const LoginPage: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCaptchaVerified) {
      setError("Please complete the captcha.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const user = await api.login(phone, password);
      if (user) {
        login(user);
        navigate('/');
      } else {
        setError("Invalid phone number or password.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h2 className="auth-card__title">User Login</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <p className="auth-form__error">{error}</p>}
          <Input id="phone" label="Phone Number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          <Input id="password" label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Captcha onVerify={setIsCaptchaVerified} />
          <Button type="submit" isLoading={isLoading} disabled={!isCaptchaVerified || isLoading}>
            Login
          </Button>
        </form>
        <div className="auth-card__footer">
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="auth-card__footer-link">
              Register here
            </Link>
          </p>
          <p>
            <Link to="#" className="auth-card__footer-link--small">
              Forgot password?
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
};