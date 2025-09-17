import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { api } from '../../services/api';
import { Settings, AlertCircle, CheckCircle, Percent, MapPin, Save, Loader2, UserCog } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { BackButton } from '../../components/common/BackButton';

const ToggleSwitch = ({ enabled, onChange, disabled }: { enabled: boolean, onChange: (checked: boolean) => void, disabled?: boolean }) => {
    return (
        <label className="toggle-switch" aria-disabled={disabled}>
            <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
            <span className="toggle-switch__slider-bg"></span>
            <span className="toggle-switch__label">{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
    );
};

const SettingToggle = ({ settingKey, title, description, onToggle }: { settingKey: string, title: string, description: string, onToggle?: (status: boolean) => void }) => {
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                setError(null);
                setIsLoading(true);
                const status = await api.getSetting(settingKey);
                const isEnabledValue = status.value === 'true';
                setIsEnabled(isEnabledValue);
                if (onToggle) onToggle(isEnabledValue);
            } catch (err) {
                setError('Failed to load setting. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStatus();
    }, [settingKey, onToggle]);

    const handleToggleChange = async (newStatus: boolean) => {
        setIsEnabled(newStatus);
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await api.updateSetting(settingKey, newStatus);
            setSuccessMessage(`System has been ${newStatus ? 'enabled' : 'disabled'}.`);
            if (onToggle) onToggle(newStatus);
        } catch(err) {
            setError('Failed to update setting. Please refresh and try again.');
            setIsEnabled(!newStatus);
        } finally {
            setIsSaving(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };
    
    if (isLoading) {
        return <div className="setting-toggle"><div className="home-page__loader"><div className="btn__spinner"></div></div></div>;
    }

    return (
        <div className="setting-toggle">
            <div className="setting-toggle__container">
                <div>
                    <h3 className="setting-toggle__title">{title}</h3>
                    <p className="setting-toggle__description">{description}</p>
                </div>
                <div className="setting-toggle__controls">
                    {isSaving && <div className="setting-toggle__spinner"></div>}
                    <ToggleSwitch enabled={isEnabled} onChange={handleToggleChange} disabled={isSaving} />
                </div>
            </div>
            {error && (
                <div className="setting-toggle__status setting-toggle__status--error">
                    <AlertCircle size={20} /> <p>{error}</p>
                </div>
            )}
            {successMessage && !error && (
                <div className="setting-toggle__status setting-toggle__status--success">
                    <CheckCircle size={20} /> <p>{successMessage}</p>
                </div>
            )}
        </div>
    );
};

const DiscountPercentageManager: React.FC = () => {
    const [discounts, setDiscounts] = useState({ child: '40', senior: '50' });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        const fetchDiscounts = async () => {
            setIsLoading(true);
            try {
                const [childRes, seniorRes] = await Promise.all([
                    api.getSetting('childDiscountPercentage'),
                    api.getSetting('seniorDiscountPercentage')
                ]);
                setDiscounts({
                    child: childRes.value ? String(childRes.value) : '40',
                    senior: seniorRes.value ? String(seniorRes.value) : '50'
                });
            } catch (err) {
                setError("Failed to load discount percentages.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchDiscounts();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const numValue = Math.max(0, Math.min(100, Number(value)));
        setDiscounts(prev => ({ ...prev, [name]: String(numValue) }));
    };
    
    const handleSaveChanges = async () => {
        setIsSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await Promise.all([
                api.updateSetting('childDiscountPercentage', Number(discounts.child)),
                api.updateSetting('seniorDiscountPercentage', Number(discounts.senior))
            ]);
            setSuccess("Discount percentages updated successfully!");
        } catch (err) {
            setError("Failed to save changes. Please try again.");
        } finally {
            setIsSaving(false);
            setTimeout(() => setSuccess(null), 3000);
        }
    }

    if(isLoading) {
        return <div className="setting-toggle"><div className="home-page__loader"><div className="btn__spinner"></div></div></div>;
    }

    return (
        <div className="setting-toggle">
            <h3 className="setting-toggle__title flex items-center gap-2"><Percent size={24}/> Discount Percentages</h3>
            <p className="setting-toggle__description mb-4">Set the discount percentage for child and senior citizen tickets (0-100%).</p>
            
            {error && <p className="auth-form__error">{error}</p>}
            {success && <p className="auth-form__success">{success}</p>}
            
            <div className="discount-manager__inputs">
                <Input 
                    id="child-discount" 
                    label="Child Discount (%)" 
                    name="child"
                    type="number"
                    value={discounts.child}
                    onChange={handleChange}
                    min="0"
                    max="100"
                />
                 <Input 
                    id="senior-discount" 
                    label="Senior Discount (%)" 
                    name="senior"
                    type="number"
                    value={discounts.senior}
                    onChange={handleChange}
                    min="0"
                    max="100"
                />
            </div>
            
            <div className="flex justify-end items-center mt-4">
                <Button onClick={handleSaveChanges} isLoading={isSaving}>
                    <Save size={18} /> Save Percentages
                </Button>
            </div>
        </div>
    );
};

const DiscountDistrictManager: React.FC = () => {
    const [allDistricts, setAllDistricts] = useState<string[]>([]);
    const [selectedDistricts, setSelectedDistricts] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [all, discounted] = await Promise.all([
                    api.getDistricts(),
                    api.getDiscountedDistricts()
                ]);
                setAllDistricts(all);
                setSelectedDistricts(new Set(discounted));
            } catch (err) {
                setError("Failed to load district information.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleDistrictToggle = (district: string) => {
        const newSelection = new Set(selectedDistricts);
        if (newSelection.has(district)) {
            newSelection.delete(district);
        } else {
            newSelection.add(district);
        }
        setSelectedDistricts(newSelection);
    };

    const handleSelectAll = () => {
        if (selectedDistricts.size === allDistricts.length) {
            setSelectedDistricts(new Set()); // Deselect all
        } else {
            setSelectedDistricts(new Set(allDistricts)); // Select all
        }
    };
    
    const handleSaveChanges = async () => {
        setIsSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await api.updateDiscountedDistricts(Array.from(selectedDistricts));
            setSuccess("Discount districts have been updated successfully!");
        } catch (err) {
            setError("Failed to save changes. Please try again.");
        } finally {
            setIsSaving(false);
            setTimeout(() => setSuccess(null), 3000);
        }
    }

    if(isLoading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" size={32} /></div>
    }

    return (
        <div className="setting-toggle">
            <h3 className="setting-toggle__title flex items-center gap-2"><MapPin size={24}/> Discounted Districts</h3>
            <p className="setting-toggle__description mb-4">Select the districts where child and senior discounts will be applicable.</p>
            
            {error && <p className="auth-form__error">{error}</p>}
            {success && <p className="auth-form__success">{success}</p>}

            <div className="subadmin-form__district-picker">
                <div className="subadmin-form__district-grid">
                    {allDistricts.map(district => (
                        <label key={district} className="subadmin-form__district-label">
                            <input
                                type="checkbox"
                                className="subadmin-form__district-checkbox"
                                checked={selectedDistricts.has(district)}
                                onChange={() => handleDistrictToggle(district)}
                            />
                            <span>{district}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div className="flex justify-between items-center mt-4">
                 <Button onClick={handleSelectAll} variant="secondary" className="btn--small">
                    {selectedDistricts.size === allDistricts.length ? "Deselect All" : "Select All"}
                </Button>
                <Button onClick={handleSaveChanges} isLoading={isSaving}>
                    <Save size={18} /> Save Changes
                </Button>
            </div>
        </div>
    );
};


export const AdminSettingsPage: React.FC = () => {
    const [isDiscountSystemEnabled, setIsDiscountSystemEnabled] = useState(false);
    return (
        <Card>
            <div className="page-header-with-back" style={{ marginBottom: '2rem' }}>
                <BackButton to="/admin" />
                <div>
                    <h2 className="admin-page-header__title" style={{ marginBottom: 0 }}>
                        <Settings /> System Settings
                    </h2>
                    <p className="admin-page-header__subtitle" style={{ marginBottom: 0, marginTop: '0.25rem' }}>
                        Manage global features of the application.
                    </p>
                </div>
            </div>
            
            <div className="admin-settings-sections">
                <div className="admin-settings__section">
                    <h3 className="admin-settings__section-title">Booking Controls</h3>
                    <div className="admin-settings__toggles-container">
                        <SettingToggle 
                            settingKey="isBookingSystemOnline"
                            title="Global Booking System"
                            description="This is the master switch for all ticket bookings."
                        />
                         <SettingToggle 
                            settingKey="isFreeBookingEnabled"
                            title="Free Booking (Govt. Special)"
                            description="Enable free tickets for verified beneficiaries."
                        />
                        <SettingToggle 
                            settingKey="isCancellationEnabled"
                            title="Ticket Cancellation System"
                            description="Allow users to cancel their bookings up to 1 hour before departure."
                        />
                    </div>
                </div>

                <div className="admin-settings__section">
                    <h3 className="admin-settings__section-title">User Features</h3>
                    <div className="admin-settings__toggles-container">
                        <SettingToggle 
                            settingKey="isPassCardSystemEnabled"
                            title="User Pass Card System"
                            description="Enable digital pass cards. If enabled, users with a pass can view it in their dashboard."
                        />
                    </div>
                </div>

                <div className="admin-settings__section">
                    <h3 className="admin-settings__section-title">Fare Discounts</h3>
                    <div className="admin-settings__toggles-container">
                        <SettingToggle 
                            settingKey="isDiscountSystemEnabled"
                            title="Fare Discount System"
                            description="Enable discounts for children and senior citizens."
                            onToggle={setIsDiscountSystemEnabled}
                        />
                        {isDiscountSystemEnabled && (
                            <>
                                <DiscountPercentageManager />
                                <DiscountDistrictManager />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
};
