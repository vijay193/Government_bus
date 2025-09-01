import React from 'react';
import { Link } from 'react-router-dom';
import type { Schedule, UserRole } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Clock, ArrowRight, MapPin, Users, IndianRupee, Edit } from 'lucide-react';
import { UserRole as UserRoleEnum } from '../../types';


interface ScheduleCardProps {
  schedule: Schedule;
  showBookingButton?: boolean;
  onEdit?: () => void;
  userRole?: UserRole;
}

export const ScheduleCard: React.FC<ScheduleCardProps> = ({ schedule, showBookingButton = true, onEdit, userRole }) => {
  const isSegmentSearch = schedule.userOrigin && schedule.userDestination;
  const canBook = showBookingButton && (!userRole || userRole === UserRoleEnum.USER);

  return (
    <Card>
      <div className="schedule-card__container">
        <div className="schedule-card__details">
          <h3 className="schedule-card__bus-name">{schedule.busName}</h3>
          <p className="schedule-card__id">Route ID: {schedule.id}</p>
          
          {(isSegmentSearch || (schedule.origin && schedule.destination)) && (
            <div className="schedule-card__route">
              <span>{isSegmentSearch ? schedule.userOrigin : schedule.origin}</span>
              <ArrowRight size={20} className="schedule-card__route-arrow" />
              <span>{isSegmentSearch ? schedule.userDestination : schedule.destination}</span>
            </div>
          )}

          {isSegmentSearch && schedule.fullRoute && (
             <p className="schedule-card__full-route">
                (Full route: {schedule.fullRoute})
            </p>
          )}
          <div className="schedule-card__meta">
            <div className="schedule-card__meta-item">
              <Clock size={16} />
              <span>{schedule.departureTime} - {schedule.arrivalTime}</span>
            </div>
            <div className="schedule-card__meta-item">
              <Users size={16} />
              <span>{schedule.seatLayout} Layout</span>
            </div>
            {schedule.fare > 0 && (
              <div className="schedule-card__meta-item">
                <IndianRupee size={16} />
                <span>{Number(schedule.fare || 0).toFixed(2)}</span>
              </div>
            )}
          </div>
          {schedule.via.length > 0 && (
            <div className="schedule-card__via">
              <MapPin size={16} className="icon" />
              <span>Via: {schedule.via.join(', ')}</span>
            </div>
          )}
        </div>
        <div className="schedule-card__actions">
           {userRole === 'SUB_ADMIN' && onEdit && (
              <Button variant="secondary" onClick={onEdit} className="btn--small">
                <div className="btn__loader"><Edit size={16} /> Edit</div>
              </Button>
           )}
          {canBook && (
            schedule.bookingEnabled ? (
              <Link 
                to={`/book/${schedule.id}`} 
                state={{
                  fare: schedule.fare,
                  userOrigin: isSegmentSearch ? schedule.userOrigin : schedule.origin,
                  userDestination: isSegmentSearch ? schedule.userDestination : schedule.destination,
                }}
              >
                <Button variant="primary">Book Seats</Button>
              </Link>
            ) : (
              <Button variant="secondary" disabled>Booking Unavailable</Button>
            )
          )}
        </div>
      </div>
    </Card>
  );
};