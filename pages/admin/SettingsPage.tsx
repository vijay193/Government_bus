import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { api } from '../../services/api';
import { Settings, AlertCircle, CheckCircle, Gift } from 'lucide-react';

const ToggleSwitch = ({ enabled, onChange, disabled }: { enabled: boolean, onChange: (checked: boolean) => void, disabled?: boolean }) => {
    return (
        <label className="toggle-switch" aria-disabled={disabled}>
            <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
            <span className="toggle-switch__slider-bg"></span>
            <span className="toggle-switch__label">{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
    );
};

const SettingToggle = ({ settingKey, title, description }: { settingKey: 'isBookingSystemOnline' | 'isFreeBookingEnabled', title: string, description: string }) => {
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
                setIsEnabled(status.value);
            } catch (err) {
                setError('Failed to load setting. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStatus();
    }, [settingKey]);

    const handleToggleChange = async (newStatus: boolean) => {
        setIsEnabled(newStatus);
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            await api.updateSetting(settingKey, newStatus);
            setSuccessMessage(`System has been ${newStatus ? 'enabled' : 'disabled'}.`);
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


export const AdminSettingsPage: React.FC = () => {
    return (
        <Card>
            <div className="admin-page-header">
                <h2 className="admin-page-header__title">
                    <Settings /> System Settings
                </h2>
                <p className="admin-page-header__subtitle">Manage global features of the application.</p>
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
                    </div>
                </div>
                {/* Future settings sections can be added here */}
            </div>
        </Card>
    );
};