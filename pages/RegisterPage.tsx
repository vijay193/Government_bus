import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { api } from '../services/api';

export const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    dob: '',
    gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'gender') {
        setFormData({ ...formData, gender: value as 'MALE' | 'FEMALE' | 'OTHER' });
    } else {
        setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { confirmPassword, ...registrationData } = formData;
      await api.register(registrationData);
      navigate('/login?registered=true');
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(`Registration failed: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page register-page">
      <Card className="auth-card">
        <h2 className="auth-card__title">Create Account</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <p className="auth-form__error">{error}</p>}
          <Input id="fullName" name="fullName" label="Full Name" value={formData.fullName} onChange={handleChange} required />
          <Input id="email" name="email" label="Email Address" type="email" value={formData.email} onChange={handleChange} required />
          <Input id="phone" name="phone" label="Phone Number" type="tel" value={formData.phone} onChange={handleChange} required />
          <Input id="dob" name="dob" label="Date of Birth" type="date" value={formData.dob} onChange={handleChange} required />
          <div className="input-wrapper">
            <label htmlFor="gender" className="input-label">Gender</label>
            <select id="gender" name="gender" value={formData.gender} onChange={handleChange} className="register-form__select">
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <Input id="password" name="password" label="Password" type="password" value={formData.password} onChange={handleChange} required />
          <Input id="confirmPassword" name="confirmPassword" label="Confirm Password" type="password" value={formData.confirmPassword} onChange={handleChange} required />
          <Button type="submit" isLoading={isLoading}>Register</Button>
        </form>
        <p className="auth-card__footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-card__footer-link">
            Login
          </Link>
        </p>
      </Card>
    </div>
  );
};