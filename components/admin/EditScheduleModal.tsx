
import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { api } from '../../services/api';
import type { Schedule, SeatLayout, ParsedStop } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { ArrowUp, ArrowDown, Trash2, PlusCircle, AlertCircle } from 'lucide-react';

interface EditScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  scheduleToEdit: Schedule;
}

const formatTimeForInput = (time: string | null): string => {
    if (!time) return '';
    // time can be 'HH:mm:ss' or 'HH:mm'
    return time.substring(0, 5);
}

export const EditScheduleModal: React.FC<EditScheduleModalProps> = ({ isOpen, onClose, onSave, scheduleToEdit }) => {
  const [formData, setFormData] = useState({
    busName: '',
    seatLayout: '2x2' as SeatLayout,
    bookingEnabled: false,
  });
  const [routeStops, setRouteStops] = useState<ParsedStop[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (isOpen && scheduleToEdit) {
      setIsFetchingDetails(true);
      setError(null);
      
      const fetchFullSchedule = async () => {
        try {
          const fullSchedule = await api.getScheduleById(scheduleToEdit.id);
          if (fullSchedule) {
            setFormData({
              busName: fullSchedule.busName,
              seatLayout: fullSchedule.seatLayout,
              bookingEnabled: fullSchedule.bookingEnabled,
            });
            // Map backend RouteStop to frontend ParsedStop for editing
            const stopsForEditing = (fullSchedule.fullRouteStops || []).map(stop => ({
                stopName: stop.name,
                arrivalTime: formatTimeForInput(stop.arrival),
                departureTime: formatTimeForInput(stop.departure),
                fareFromOrigin: stop.fare,
                stopOrder: stop.order,
            }));
            setRouteStops(stopsForEditing);
          } else {
            setError("Could not load full schedule details.");
          }
        } catch(err) {
            setError("Failed to fetch schedule details. Please try again.");
        } finally {
            setIsFetchingDetails(false);
        }
      };
      
      fetchFullSchedule();
    }
  }, [scheduleToEdit, isOpen]);

  const handleBaseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleStopChange = (index: number, field: keyof ParsedStop, value: string | number | null) => {
    setRouteStops(prev => {
        const newStops = [...prev];
        (newStops[index] as any)[field] = value;
        return newStops;
    });
  };

  const handleAddStop = () => {
    setRouteStops(prev => [...prev, {
        stopName: '',
        arrivalTime: '00:00',
        departureTime: '00:00',
        fareFromOrigin: prev.length > 0 ? prev[prev.length - 1].fareFromOrigin : 0,
    }]);
  };

  const handleRemoveStop = (index: number) => {
    if (routeStops.length <= 1) {
        alert("A schedule must have at least one stop.");
        return;
    }
    setRouteStops(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= routeStops.length) return;

      setRouteStops(prev => {
          const newStops = [...prev];
          const temp = newStops[index];
          newStops[index] = newStops[newIndex];
          newStops[newIndex] = temp;
          return newStops;
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
        setError("You must be logged in to perform this action.");
        return;
    }
    setIsLoading(true);
    setError(null);
    
    try {
      await api.updateSchedule(scheduleToEdit.id, { ...formData, stops: routeStops });
      onSave();
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStopEditor = () => {
    if (isFetchingDetails) {
        return <div className="home-page__loader"><div className="home-page__spinner"></div></div>;
    }
    return (
        <div className="edit-schedule-form__stops-editor">
            {routeStops.map((stop, index) => (
                <div key={index} className="stop-editor-card">
                     <div className="stop-editor-card__controls">
                        <Button type="button" variant="secondary" onClick={() => handleMoveStop(index, 'up')} disabled={index === 0} className="stop-editor-card__control-btn"><ArrowUp size={16}/></Button>
                        <Button type="button" variant="secondary" onClick={() => handleMoveStop(index, 'down')} disabled={index === routeStops.length - 1} className="stop-editor-card__control-btn"><ArrowDown size={16}/></Button>
                    </div>
                    <div className="stop-editor-card__fields">
                        <div className="stop-editor-card__field--full-span">
                             <Input label={`Stop ${index + 1}: Name`} id={`stopName-${index}`} value={stop.stopName} onChange={e => handleStopChange(index, 'stopName', e.target.value)} required />
                        </div>
                        <Input type="time" label="Arrival Time" id={`arrivalTime-${index}`} value={stop.arrivalTime || ''} onChange={e => handleStopChange(index, 'arrivalTime', e.target.value)} disabled={index === 0} />
                        <Input type="time" label="Departure Time" id={`departureTime-${index}`} value={stop.departureTime} onChange={e => handleStopChange(index, 'departureTime', e.target.value)} required />
                        <div className="stop-editor-card__field--full-span">
                            <Input type="number" label="Fare from Origin (₹)" id={`fare-${index}`} value={stop.fareFromOrigin} onChange={e => handleStopChange(index, 'fareFromOrigin', Number(e.target.value))} required disabled={index===0}/>
                        </div>
                    </div>
                    <div className="stop-editor-card__delete-wrapper">
                        <Button type="button" variant="danger" onClick={() => handleRemoveStop(index)} disabled={routeStops.length <= 1} className="stop-editor-card__delete-btn"><Trash2 size={16}/></Button>
                    </div>
                </div>
            ))}
            <Button type="button" variant="secondary" onClick={handleAddStop} className="edit-schedule-form__add-stop-btn">
                <PlusCircle size={18} /> Add Stop
            </Button>
        </div>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Schedule: ${scheduleToEdit.busName}`} size="3xl">
      <form onSubmit={handleSubmit} className="edit-schedule-form">
        {error && <p className="auth-form__error"><AlertCircle size={20}/> {error}</p>}
        
        <div className="edit-schedule-form__section">
            <h3 className="edit-schedule-form__section-title">Basic Details</h3>
            <div className="space-y-4">
                <Input id="busName" name="busName" label="Bus Name" value={formData.busName} onChange={handleBaseChange} required disabled={isFetchingDetails}/>
                <div className="input-wrapper">
                    <label htmlFor="seatLayout" className="input-label">Seat Layout</label>
                    <select id="seatLayout" name="seatLayout" value={formData.seatLayout} onChange={handleBaseChange} disabled={isFetchingDetails} className="edit-schedule-form__select">
                        <option value="2x2">2x2</option>
                        <option value="2x3">2x3</option>
                        <option value="2x1">2x1</option>
                    </select>
                </div>
                <div className="edit-schedule-form__checkbox-wrapper">
                    <input id="bookingEnabled" name="bookingEnabled" type="checkbox" checked={formData.bookingEnabled} onChange={handleBaseChange} disabled={isFetchingDetails} className="edit-schedule-form__checkbox" />
                    <label htmlFor="bookingEnabled" className="edit-schedule-form__checkbox-label">Booking Enabled</label>
                </div>
            </div>
        </div>

        <div>
            <h3 className="edit-schedule-form__section-title">Route Stops & Timings</h3>
            {renderStopEditor()}
        </div>

        <div className="subadmin-form__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} disabled={isFetchingDetails}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
};