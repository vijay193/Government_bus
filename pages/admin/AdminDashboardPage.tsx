
import React from 'react';
import { Card } from '../../components/common/Card';
import { Link } from 'react-router-dom';
import { Settings, Users, IndianRupee } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';

export const AdminDashboardPage: React.FC = () => {
    const { user } = useAuth();
    return (
        <Card>
            <h1 className="admin-dashboard__title">Welcome, {user?.fullName.split(' ')[0]}!</h1>
            <p className="admin-dashboard__subtitle">This is the central control panel for Government Bus.</p>

            <div className="admin-dashboard__grid">
                 {user?.role === UserRole.ADMIN && (
                    <Link to="/admin/settings" className="admin-dashboard__grid-item">
                        <Settings className="admin-dashboard__grid-icon" />
                        <h3 className="admin-dashboard__grid-title">System Settings</h3>
                        <p className="admin-dashboard__grid-text">Manage global application settings like online booking.</p>
                    </Link>
                 )}
                <Link to="/admin/users" className="admin-dashboard__grid-item">
                    <Users className="admin-dashboard__grid-icon" />
                    <h3 className="admin-dashboard__grid-title">User Management</h3>
                    <p className="admin-dashboard__grid-text">
                        {user?.role === UserRole.ADMIN 
                          ? 'Create, view, and manage sub-admin accounts.' 
                          : 'View all user accounts.'
                        }
                    </p>
                </Link>
                <Link to="/admin/revenue" className="admin-dashboard__grid-item">
                    <IndianRupee className="admin-dashboard__grid-icon" />
                    <h3 className="admin-dashboard__grid-title">Revenue Analytics</h3>
                    <p className="admin-dashboard__grid-text">
                        {user?.role === UserRole.ADMIN 
                          ? 'View revenue data across all districts.'
                          : 'View revenue data for your assigned districts.'
                        }
                    </p>
                </Link>
            </div>
        </Card>
    );
};
