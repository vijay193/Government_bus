import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { api } from '../../services/api';
import type { User } from '../../types';
import { UserRole } from '../../types';

interface SubAdminFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  userToEdit: User | null;
}

export const SubAdminFormModal: React.FC<SubAdminFormModalProps> = ({ isOpen, onClose, onSave, userToEdit }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [assignedDistricts, setAssignedDistricts] = useState<string[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!userToEdit;

  useEffect(() => {
    const fetchDistricts = async () => {
      try {
        const districts = await api.getDistricts();
        setAvailableDistricts(districts);
      } catch (err) {
        setError("Could not load available districts.");
      }
    };
    fetchDistricts();

    if (isEditMode) {
      setFormData({
        fullName: userToEdit.fullName,
        email: userToEdit.email || '',
        phone: userToEdit.phone,
        password: '', // Password is not pre-filled for security
      });
      setAssignedDistricts(userToEdit.assignedDistricts || []);
    } else {
      setFormData({ fullName: '', email: '', phone: '', password: '' });
      setAssignedDistricts([]);
    }
  }, [userToEdit, isEditMode, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDistrictChange = (district: string) => {
    setAssignedDistricts(prev => 
      prev.includes(district) ? prev.filter(d => d !== district) : [...prev, district]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    const userData: Partial<User> = {
        ...formData,
        role: UserRole.SUB_ADMIN,
        assignedDistricts: assignedDistricts,
    };
    
    // In edit mode, if password is not entered, don't send it in the payload.
    if (isEditMode && !userData.password) {
        delete userData.password;
    }
    
    try {
      if (isEditMode) {
        await api.updateSubAdmin(userToEdit.id, userData);
      } else {
        await api.createSubAdmin(userData);
      }
      onSave();
    } catch (err) {
        const message = err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? "Edit Sub-Admin" : "Create New Sub-Admin"}>
      <form onSubmit={handleSubmit} className="subadmin-form">
        {error && <p className="auth-form__error">{error}</p>}
        
        <Input id="fullName" name="fullName" label="Full Name" value={formData.fullName} onChange={handleChange} required />
        <Input id="email" name="email" label="Email Address" type="email" value={formData.email} onChange={handleChange} required />
        <Input id="phone" name="phone" label="Phone Number" type="tel" value={formData.phone} onChange={handleChange} required />
        <Input id="password" name="password" label="Password" type="password" placeholder={isEditMode ? "Leave blank to keep unchanged" : ""} onChange={handleChange} required={!isEditMode} />
        
        <div className="input-wrapper">
            <label className="input-label">Assign Districts</label>
            <div className="subadmin-form__district-picker">
                <div className="subadmin-form__district-grid">
                    {availableDistricts.length > 0 ? availableDistricts.map(district => (
                        <label key={district} className="subadmin-form__district-label">
                            <input
                                type="checkbox"
                                className="subadmin-form__district-checkbox"
                                checked={assignedDistricts.includes(district)}
                                onChange={() => handleDistrictChange(district)}
                            />
                            <span>{district}</span>
                        </label>
                    )) : (
                        <p>No districts available to assign.</p>
                    )}
                </div>
            </div>
        </div>

        <div className="subadmin-form__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEditMode ? "Save Changes" : "Create Sub-Admin"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};