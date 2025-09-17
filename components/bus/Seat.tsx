import React from 'react';

interface SeatProps {
  seatId: string;
  status: 'available' | 'booked' | 'selected' | 'disabled';
  onClick: (seatId: string) => void;
}

export const Seat: React.FC<SeatProps> = ({ seatId, status, onClick }) => {
  const statusClass = `seat--${status}`;

  const handleClick = () => {
    if (status === 'available' || status === 'selected') {
      onClick(seatId);
    }
  };

  return (
    <div
      className={`seat ${statusClass}`}
      onClick={handleClick}
      title={`Seat ${seatId}`}
      aria-label={`Seat ${seatId}, ${status}`}
    >
      {seatId}
    </div>
  );
};