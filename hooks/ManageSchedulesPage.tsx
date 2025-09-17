import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';
import { api } from '../services/api';
import { UserRole, type Schedule } from '../types';
import { Card } from '../components/common/Card';
import { ScheduleCard } from '../components/bus/ScheduleCard';
import { List, AlertCircle } from 'lucide-react';
import { EditScheduleModal } from '../components/admin/EditScheduleModal';
import { BackButton } from '../components/common/BackButton';

export const ManageSchedulesPage: React.FC = () => {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();
    const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
    const [filterDistricts, setFilterDistricts] = useState<string[]>([]);
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

    const fetchSchedulesAndDistricts = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }
        
        try {
            setIsLoading(true);
            setError(null);
            const schedulesData = await api.getAllSchedules();
            setSchedules(schedulesData);

            if (user.role === UserRole.ADMIN) {
                const districtsData = await api.getDistricts();
                setFilterDistricts(districtsData);
            } else if (user.role === UserRole.SUB_ADMIN && user.assignedDistricts && user.assignedDistricts.length > 1) {
                setFilterDistricts(user.assignedDistricts);
            }

        } catch (err) {
            setError("Failed to load schedules. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchSchedulesAndDistricts();
    }, [fetchSchedulesAndDistricts]);

    const handleEditClick = (schedule: Schedule) => {
        setEditingSchedule(schedule);
        setIsEditModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingSchedule(null);
        setIsEditModalOpen(false);
    };

    const handleSaveSuccess = () => {
        handleCloseModal();
        fetchSchedulesAndDistricts(); // Refetch data
    };

    const filteredSchedules = useMemo(() => {
        if (selectedDistrict === 'all') {
            return schedules;
        }
        return schedules.filter(schedule => schedule.origin === selectedDistrict);
    }, [schedules, selectedDistrict]);

    return (
        <>
            <Card>
                <div className="page-header-with-back" style={{ marginBottom: '2rem' }}>
                    <BackButton to="/admin" />
                    <div className="manage-schedules__header">
                        <div>
                            <h1 className="admin-page-header__title" style={{ marginBottom: 0 }}>
                                <List /> Manage Schedules
                            </h1>
                            <p className="admin-page-header__subtitle" style={{ marginBottom: 0, marginTop: '0.25rem' }}>
                                {user?.role === UserRole.ADMIN 
                                    ? 'View and manage all bus schedules in the system.' 
                                    : 'View and edit schedules for your assigned districts.'}
                            </p>
                        </div>
                        
                        {filterDistricts.length > 0 && (
                            <div className="manage-schedules__filter">
                                <label htmlFor="district-filter" className="input-label">
                                    Filter by Origin District
                                </label>
                                <select
                                    id="district-filter"
                                    value={selectedDistrict}
                                    onChange={(e) => setSelectedDistrict(e.target.value)}
                                    className="manage-schedules__filter-select"
                                >
                                    <option value="all">All Districts</option>
                                    {filterDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                </div>


                {isLoading && (
                    <div className="home-page__loader">
                        <div className="home-page__spinner"></div>
                    </div>
                )}
                
                {error && (
                    <div className="auth-form__error">
                        <AlertCircle size={24} />
                        <p>{error}</p>
                    </div>
                )}
                
                {!isLoading && !error && (
                    <div className="manage-schedules__list">
                        {filteredSchedules.length > 0 ? (
                            filteredSchedules.map(schedule => (
                                <ScheduleCard 
                                    key={schedule.id} 
                                    schedule={schedule} 
                                    showBookingButton={false}
                                    userRole={user?.role}
                                    onEdit={user?.role === UserRole.SUB_ADMIN ? () => handleEditClick(schedule) : undefined}
                                />
                            ))
                        ) : (
                            <Card>
                                <p className="text-center" style={{padding: '2rem'}}>
                                    {schedules.length > 0 && selectedDistrict !== 'all' 
                                        ? `No schedules found for the district "${selectedDistrict}".`
                                        : (user?.role === UserRole.SUB_ADMIN ? 'No schedules found for your assigned districts.' : 'No schedules found in the system.')
                                    }
                                </p>
                            </Card>
                        )}
                    </div>
                )}
            </Card>

            {isEditModalOpen && editingSchedule && (
                <EditScheduleModal
                    isOpen={isEditModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSaveSuccess}
                    scheduleToEdit={editingSchedule}
                />
            )}
        </>
    );
};
