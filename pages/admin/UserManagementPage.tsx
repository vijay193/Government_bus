import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { api } from '../../services/api';
import type { User } from '../../types';
import { UserRole } from '../../types';
import { Users, PlusCircle, Edit, Trash2, Shield, User as UserIcon } from 'lucide-react';
import { SubAdminFormModal } from '../../components/admin/SubAdminFormModal';
import { useAuth } from '../../hooks/useAuth';

export const AdminUserManagementPage: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const { user: loggedInUser } = useAuth();

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const userList = await api.getUsers();
            setUsers(userList);
        } catch (err) {
            setError("Failed to load users. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const filteredUsers = useMemo(() => {
        if (!loggedInUser) return [];

        if (loggedInUser.role === UserRole.ADMIN) {
            return users.filter(u => u.role !== UserRole.ADMIN);
        }
        if (loggedInUser.role === UserRole.SUB_ADMIN) {
            return users.filter(u => u.role === UserRole.USER);
        }
        return [];
    }, [users, loggedInUser]);

    const handleOpenCreateModal = () => {
        setEditingUser(null);
        setIsModalOpen(true);
    };
    
    const handleOpenEditModal = (user: User) => {
        setEditingUser(user);
        setIsModalOpen(true);
    };
    
    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
    };

    const handleDeleteUser = async (userId: string) => {
        if (window.confirm("Are you sure you want to delete this sub-admin? This action cannot be undone.")) {
            try {
                await api.deleteUser(userId);
                setUsers(prev => prev.filter(u => u.id !== userId));
            } catch (err) {
                const message = err instanceof Error ? err.message : "An unexpected error occurred.";
                alert(`Failed to delete user: ${message}`);
            }
        }
    };
    
    const handleSaveSuccess = () => {
        handleCloseModal();
        fetchUsers();
    };

    const roleIndicator = (role: UserRole) => {
        switch(role) {
            case UserRole.ADMIN:
                return <span className="user-management__role-indicator role-admin"><Shield size={14}/>ADMIN</span>;
            case UserRole.SUB_ADMIN:
                return <span className="user-management__role-indicator role-sub-admin"><Shield size={14}/>SUB-ADMIN</span>;
            case UserRole.USER:
                return <span className="user-management__role-indicator role-user"><UserIcon size={14}/>USER</span>;
            default:
                return <span className="user-management__role-indicator">{role}</span>
        }
    };

    return (
        <>
            <Card>
                <div className="user-management__header">
                    <div>
                        <h2 className="admin-page-header__title">
                            <Users /> User Management
                        </h2>
                        <p className="admin-page-header__subtitle">Manage all user and sub-admin accounts.</p>
                    </div>
                    {loggedInUser?.role === UserRole.ADMIN && (
                        <Button onClick={handleOpenCreateModal}>
                            <PlusCircle size={20} /> Add Sub-Admin
                        </Button>
                    )}
                </div>

                {isLoading && <div className="text-center py-8">Loading users...</div>}
                {error && <p className="auth-form__error">{error}</p>}

                {!isLoading && !error && (
                    <div className="user-management__table-wrapper">
                        <table className="user-management__table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Contact</th>
                                    <th>Assigned Districts</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map(user => (
                                    <tr key={user.id}>
                                        <td>
                                            <div className="user-management__user-name">{user.fullName}</div>
                                        </td>
                                        <td>
                                            {roleIndicator(user.role)}
                                        </td>
                                        <td className="user-management__user-contact">
                                            <div>{user.phone}</div>
                                            <div className="user-management__user-contact-email">{user.email}</div>
                                        </td>
                                        <td>
                                            {user.role === UserRole.SUB_ADMIN ? (
                                                (user.assignedDistricts && user.assignedDistricts.length > 0)
                                                    ? <div className="user-management__districts">{user.assignedDistricts.map(d => <span key={d} className="user-management__district-tag">{d}</span>)}</div>
                                                    : <span className="text-gray-400 italic">None</span>
                                            ) : 'N/A'}
                                        </td>
                                        <td>
                                            {loggedInUser?.role === UserRole.ADMIN && user.role === UserRole.SUB_ADMIN && (
                                                <div className="user-management__actions">
                                                    <Button variant="secondary" onClick={() => handleOpenEditModal(user)} className="user-management__action-btn">
                                                        <Edit size={16} />
                                                    </Button>
                                                    <Button variant="danger" onClick={() => handleDeleteUser(user.id)} className="user-management__action-btn">
                                                        <Trash2 size={16} />
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {isModalOpen && (
                <SubAdminFormModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSaveSuccess}
                    userToEdit={editingUser}
                />
            )}
        </>
    );
};