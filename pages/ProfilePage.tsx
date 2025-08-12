import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import type { User } from '../types';
import { User as UserIcon, Save, AlertCircle, CheckCircle } from 'lucide-react';

// Helper to safely get the correct gender value, handling potential casing issues or null values.
const getSanitizedGender = (gender?: string): 'MALE' | 'FEMALE' | 'OTHER' => {
    const upperGender = gender?.toUpperCase();
    if (upperGender === 'FEMALE') return 'FEMALE';
    if (upperGender === 'OTHER') return 'OTHER';
    return 'MALE'; // Default to MALE if undefined, null, or any other value.
};

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const passwordHint = "Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).";


export const ProfilePage: React.FC = () => {
    const { user, login, token } = useAuth();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        dob: '',
        gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
        password: '',
        confirmPassword: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            // Helper to format date string to YYYY-MM-DD
            const formatDateForInput = (dateStr?: string) => {
                if (!dateStr) return '';
                // Assuming date is in ISO format (e.g., from database)
                return new Date(dateStr).toISOString().split('T')[0];
            }

            setFormData({
                fullName: user.fullName || '',
                email: user.email || '',
                phone: user.phone || '',
                dob: formatDateForInput(user.dob),
                gender: getSanitizedGender(user.gender),
                password: '',
                confirmPassword: '',
            });
        } else {
            navigate('/login');
        }
    }, [user, navigate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            setFormData({ ...formData, [name]: value.replace(/\D/g, '') });
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        
        if (formData.phone.length !== 10) {
            setError("Phone number must be exactly 10 digits.");
            return;
        }

        if (formData.password) {
            if (!passwordRegex.test(formData.password)) {
                setError(passwordHint);
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                setError("New passwords do not match.");
                return;
            }
        }

        setIsLoading(true);

        try {
            const { confirmPassword, ...updateData } = formData;
            
            const payload: Partial<User> = {
                ...updateData,
                gender: updateData.gender,
            };
            
            if (!payload.password) {
                delete payload.password; // Don't send empty password
            }
            
            const updatedUser = await api.updateUserProfile(user!.id, payload);

            // FIX: The login function from AuthContext expects an object with both the user and the token.
            // The existing token is retrieved from the auth context and passed along with the updated user details.
            if (token) {
                login({ user: updatedUser, token });
            } else {
                // This case is unlikely due to ProtectedRoute, but is a safe fallback.
                setError("Your session has expired. Please log in again.");
                navigate('/login');
                return;
            }

            setSuccess("Profile updated successfully!");
            // Clear password fields after successful submission
            setFormData(prev => ({ ...prev, password: '', confirmPassword: ''}));
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unexpected error occurred.";
            setError(`Update failed: ${message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setSuccess(null), 4000);
        }
    };

    return (
        <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
            <Card className="auth-card" style={{ maxWidth: '42rem', margin: 'auto' }}>
                <h2 className="admin-page-header__title">
                    <UserIcon /> My Profile
                </h2>
                <p className="admin-page-header__subtitle">
                    Update your personal information and password.
                </p>

                <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: '2rem' }}>
                    {error && (
                        <div className="upload-schedules__status-message status-error">
                            <AlertCircle /> {error}
                        </div>
                    )}
                    {success && (
                        <div className="upload-schedules__status-message status-success">
                            <CheckCircle /> {success}
                        </div>
                    )}

                    <Input id="fullName" name="fullName" label="Full Name" value={formData.fullName} onChange={handleChange} required />
                    <Input id="email" name="email" label="Email Address" type="email" value={formData.email} onChange={handleChange} required />
                    <Input id="phone" name="phone" label="Phone Number" type="tel" value={formData.phone} onChange={handleChange} required maxLength={10} pattern="\d{10}" title="Please enter a 10-digit phone number."/>
                    <Input id="dob" name="dob" label="Date of Birth" type="date" value={formData.dob} onChange={handleChange} required />
                    
                    <div className="input-wrapper">
                        <label htmlFor="gender" className="input-label">Gender</label>
                        <select id="gender" name="gender" value={formData.gender} onChange={handleChange} className="register-form__select">
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>

                    <h3 className="edit-schedule-form__section-title" style={{ marginTop: '1rem', marginBottom: 0 }}>Change Password</h3>
                    <Input id="password" name="password" label="New Password" type="password" value={formData.password} placeholder="Leave blank to keep unchanged" onChange={handleChange} />
                    {formData.password && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '-1rem', textAlign: 'center' }}>{passwordHint}</p>}
                    <Input id="confirmPassword" name="confirmPassword" label="Confirm New Password" value={formData.confirmPassword} type="password" onChange={handleChange} />

                    <Button type="submit" isLoading={isLoading} style={{ marginTop: '1rem' }}>
                        <Save size={18} /> Save Changes
                    </Button>
                </form>
            </Card>
        </div>
    );
};