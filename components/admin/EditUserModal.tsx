

import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { api } from '../../services/api';
import type { User } from '../../types';
import { useAuth } from '../../hooks/useAuth';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  userToEdit: User;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, onSave, userToEdit }) => {
  const { user: adminUser } = useAuth();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
    dob: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (userToEdit) {
      setFormData({
        fullName: userToEdit.fullName || '',
        email: userToEdit.email || '',
        phone: userToEdit.phone || '',
        password: '', // Always empty for security
        gender: userToEdit.gender || 'MALE',
        dob: userToEdit.dob ? new Date(userToEdit.dob).toISOString().split('T')[0] : '',
      });
    }
  }, [userToEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) {
      setError("Not authorized");
      return;
    }
    setIsLoading(true);
    setError(null);
    
    const { password, ...rest } = formData;
    const updateData: Partial<User> = { ...rest };
    
    if (password) {
        updateData.password = password;
    }
    
    try {
      await api.adminUpdateUser(userToEdit.id, updateData);
      onSave();
    } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit User: ${userToEdit.fullName}`}>
      <form onSubmit={handleSubmit} className="subadmin-form">
        {error && <p className="auth-form__error">{error}</p>}
        
        <Input id="fullName" name="fullName" label="Full Name" value={formData.fullName} onChange={handleChange} required />
        <Input id="email" name="email" label="Email Address" type="email" value={formData.email} onChange={handleChange} required />
        <Input id="phone" name="phone" label="Phone Number" type="tel" value={formData.phone} onChange={handleChange} required />
        <Input id="dob" name="dob" label="Date of Birth" type="date" value={formData.dob} onChange={handleChange} />
        
        <div className="input-wrapper">
            <label htmlFor="gender" className="input-label">Gender</label>
            <select id="gender" name="gender" value={formData.gender} onChange={handleChange} className="register-form__select">
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
        </div>

        <Input id="password" name="password" label="New Password" type="password" placeholder="Leave blank to keep unchanged" onChange={handleChange} />
        
        <div className="subadmin-form__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
};