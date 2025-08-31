
import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Ticket, CreditCard, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';

export const UserLayout: React.FC = () => {
    const { user } = useAuth();
    const [showPassCardLink, setShowPassCardLink] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    
    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const checkPassCardAccess = async () => {
            setIsLoading(true);
            try {
                // Simplified logic: The backend already checks if the system is enabled.
                // If we receive a passCard object, it means the user has one AND the feature is on.
                const passCard = await api.getPassCardForUser(user.id);
                if (passCard) {
                    setShowPassCardLink(true);
                }
            } catch (err) {
                console.error("Failed to check for pass card", err);
                setError("Could not load user options.");
            } finally {
                setIsLoading(false);
            }
        };

        checkPassCardAccess();
    }, [user]);

    const getNavLinkClass = ({ isActive }: { isActive: boolean }) => 
        `admin-sidebar__nav-link ${isActive ? 'active' : ''}`;

    return (
        <div className="container admin-layout">
            <aside className="admin-sidebar">
                <div className="admin-sidebar__content">
                    <h2 className="admin-sidebar__title">My Dashboard</h2>
                    <nav className="admin-sidebar__nav">
                        <NavLink to="/dashboard" end className={getNavLinkClass}>
                            <Ticket size={20} />
                            <span>My Bookings</span>
                        </NavLink>
                        { isLoading && <div className="admin-sidebar__nav-link"><div className="btn__spinner" style={{width: '20px', height: '20px'}}></div><span>Loading...</span></div> }
                        { error && <div className="admin-sidebar__nav-link" style={{color: 'var(--color-danger)'}}><AlertCircle size={20} /><span>Error</span></div> }
                        { !isLoading && showPassCardLink && (
                            <NavLink to="/dashboard/pass-card" className={getNavLinkClass}>
                                <CreditCard size={20} />
                                <span>My Pass Card</span>
                            </NavLink>
                        )}
                    </nav>
                </div>
            </aside>
            <main className="admin-main-content">
                <Outlet />
            </main>
        </div>
    );
};
