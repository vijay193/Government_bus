import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Settings, Users, IndianRupee, UploadCloud, List, UserPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';

export const AdminLayout: React.FC = () => {
    const { user } = useAuth();
    
    const getNavLinkClass = ({ isActive }: { isActive: boolean }) => 
        `admin-sidebar__nav-link ${isActive ? 'active' : ''}`;

    return (
        <div className="container admin-layout">
            <aside className="admin-sidebar">
                <div className="admin-sidebar__content">
                    <h2 className="admin-sidebar__title">{user?.role === UserRole.ADMIN ? 'Admin' : 'Sub-Admin'} Panel</h2>
                    <nav className="admin-sidebar__nav">
                        <NavLink to="/admin" end className={getNavLinkClass}>
                            <LayoutDashboard size={20} />
                            <span>Dashboard</span>
                        </NavLink>
                        {user?.role === UserRole.ADMIN && (
                            <>
                                <NavLink to="/admin/settings" className={getNavLinkClass}>
                                    <Settings size={20} />
                                    <span>Settings</span>
                                </NavLink>
                                <NavLink to="/admin/bulk-users" className={getNavLinkClass}>
                                    <UserPlus size={20} />
                                    <span>Bulk User Upload</span>
                                </NavLink>
                            </>
                        )}
                        <NavLink to="/admin/users" className={getNavLinkClass}>
                            <Users size={20} />
                            <span>User Management</span>
                        </NavLink>
                        <NavLink to="/admin/revenue" className={getNavLinkClass}>
                            <IndianRupee size={20} />
                            <span>Revenue Analytics</span>
                        </NavLink>
                        <NavLink to="/admin/schedules" className={getNavLinkClass}>
                            <UploadCloud size={20} />
                            <span>Upload Schedules</span>
                        </NavLink>
                        <NavLink to="/admin/manage-schedules" className={getNavLinkClass}>
                            <List size={20} />
                            <span>Manage Schedules</span>
                        </NavLink>
                    </nav>
                </div>
            </aside>
            <main className="admin-main-content">
                <Outlet />
            </main>
        </div>
    );
};