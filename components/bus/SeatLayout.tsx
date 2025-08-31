import React from 'react';
import type { SeatLayout as SeatLayoutType } from '../../types';
import { Seat } from './Seat';

interface SeatLayoutProps {
  layout: SeatLayoutType;
  bookedSeats: string[];
  selectedSeats: string[];
  onSeatClick: (seatId: string) => void;
  disableSelection: boolean;
}

const generateSeats = (rows: number, cols: number, letters: string[]) => {
    const seats = [];
    for (let i = 0; i < rows; i++) {
        const rowSeats = [];
        for (let j = 0; j < cols; j++) {
            rowSeats.push(`${letters[i]}${j + 1}`);
        }
        seats.push(rowSeats);
    }
    return seats;
}

export const SeatLayout: React.FC<SeatLayoutProps> = ({ layout, bookedSeats, selectedSeats, onSeatClick, disableSelection }) => {
  const getSeatStatus = (seatId: string): 'available' | 'booked' | 'selected' | 'disabled' => {
    if (selectedSeats.includes(seatId)) return 'selected';
    if (bookedSeats.includes(seatId)) return 'booked';
    if (disableSelection) return 'disabled';
    return 'available';
  };

  const layoutConfig = {
    '2x2': { rows: 10, cols: [2, 2], letters: ['A', 'B', 'C', 'D'] },
    '2x3': { rows: 10, cols: [2, 3], letters: ['A', 'B', 'C', 'D', 'E'] },
    '2x1': { rows: 10, cols: [2, 1], letters: ['A', 'B', 'C'] },
  };

  const config = layoutConfig[layout];
  const seatGrid = [];
  for (let row = 1; row <= config.rows; row++) {
    const rowSeats: React.ReactNode[] = [];
    let seatLetterIndex = 0;
    for (let colGroup of config.cols) {
        for (let i = 0; i < colGroup; i++) {
            const seatId = `${config.letters[seatLetterIndex++]}${row}`;
            rowSeats.push(
              <Seat key={seatId} seatId={seatId} status={getSeatStatus(seatId)} onClick={onSeatClick} />
            );
        }
        if (colGroup !== config.cols[config.cols.length-1]) {
            rowSeats.push(<div key={`aisle-${row}`} className="seat-layout__aisle"></div>);
        }
    }
    seatGrid.push(<div key={row} className="seat-layout__row">{rowSeats}</div>);
  }

  return (
    <div className="seat-layout">
        <div className="seat-layout__header">
            <span>FRONT</span>
            <span>REAR</span>
        </div>
        <div className="seat-layout__grid">
            {seatGrid}
        </div>
        <div className="seat-layout__legend">
            <div className="seat-layout__legend-item"><div className="seat-layout__legend-swatch swatch--available"></div><span>Available</span></div>
            <div className="seat-layout__legend-item"><div className="seat-layout__legend-swatch swatch--selected"></div><span>Selected</span></div>
            <div className="seat-layout__legend-item"><div className="seat-layout__legend-swatch swatch--booked"></div><span>Booked</span></div>
            <div className="seat-layout__legend-item"><div className="seat-layout__legend-swatch swatch--disabled"></div><span>Disabled</span></div>
        </div>
    </div>
  );
};