import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import type { Schedule } from '../types';
import { SeatLayout } from '../components/bus/SeatLayout';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { Modal } from '../components/common/Modal';
import { SEAT_PRICE } from '../constants';
import { Ticket, X, CheckCircle, Ban, Gift, ArrowRight, Download } from 'lucide-react';

type BookingType = 'normal' | 'free';

interface ModalState {
  isOpen: boolean;
  bookingId: string;
  bookingType: BookingType;
}

export const BookingPage: React.FC = () => {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const { fare: fareFromState, userOrigin, userDestination } = location.state || {};

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [bookedSeats, setBookedSeats] = useState<string[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBooking, setIsBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false, bookingId: '', bookingType: 'normal' });
  const [bookingType, setBookingType] = useState<BookingType>('normal');
  const [freeBookingDetails, setFreeBookingDetails] = useState({ registrationNumber: '', phone: '' });

  useEffect(() => {
    if (!scheduleId) {
      setError("Schedule ID is missing.");
      setIsLoading(false);
      return;
    }

    const fetchBookingData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [scheduleData, bookedSeatsData] = await Promise.all([
          api.getScheduleById(scheduleId),
          api.getBookedSeatsForSchedule(scheduleId)
        ]);
        
        if (scheduleData) {
          if (!scheduleData.bookingEnabled) {
            setError("Booking for this schedule is currently unavailable.");
            setSchedule(null);
          } else {
            setSchedule(scheduleData);
            setBookedSeats(bookedSeatsData);
          }
        } else {
          setError("Schedule not found.");
        }
      } catch (err) {
        setError("Failed to load booking information.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBookingData();
  }, [scheduleId]);

  const handleSeatClick = useCallback((seatId: string) => {
    setSelectedSeats(prev => 
      prev.includes(seatId) ? prev.filter(s => s !== seatId) : [...prev, seatId]
    );
  }, []);

  const pricePerSeat = Number(fareFromState ?? schedule?.fare ?? SEAT_PRICE);
  const totalFare = selectedSeats.length * pricePerSeat;

  const generatePdfReceipt = async (bookingId: string, type: BookingType) => {
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Government Bus - E-Ticket", 20, 20);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Passenger: ${user?.fullName}`, 20, 35);
    doc.text(`Route: ${userOrigin || schedule?.origin} to ${userDestination || schedule?.destination}`, 20, 45);
    doc.text(`Bus: ${schedule?.busName} (${schedule?.id})`, 20, 55);
    doc.text(`Booking Date: ${new Date().toLocaleString()}`, 20, 65);
    doc.text(`Seats: ${selectedSeats.join(', ')}`, 20, 75);

    // QR Code Data
    const qrCodeData = JSON.stringify({
        bookingId: bookingId,
        passenger: user?.fullName,
        scheduleId: schedule?.id,
        seats: selectedSeats,
        route: `${userOrigin || schedule?.origin} to ${userDestination || schedule?.destination}`,
        bookingType: type,
    });
    const qrCodeDataURL = await QRCode.toDataURL(qrCodeData, { errorCorrectionLevel: 'H' });
    
    doc.addImage(qrCodeDataURL, 'PNG', 140, 30, 50, 50);
    doc.setFontSize(8);
    doc.text("Scan for Verification", 147, 85);


    if (type === 'free') {
        doc.setFont("helvetica", "bold");
        doc.text(`Total Fare: FREE (Govt. Special Announcement)`, 20, 85);
    } else {
        doc.setFont("helvetica", "bold");
        doc.text(`Total Fare: INR ${totalFare.toFixed(2)}`, 20, 85);
    }

    doc.save(`GovernmentBus-Ticket-${bookingId}.pdf`);
  };

  const handleFreeBookingFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFreeBookingDetails(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleConfirmBooking = async () => {
    if (!user || !scheduleId || !schedule) return;
    setIsBooking(true);
    setError(null);

    try {
        let bookingId = '';
        if (bookingType === 'free') {
            const res = await api.bookFreeSeats(
                user.id,
                scheduleId,
                selectedSeats,
                userOrigin || schedule.origin,
                userDestination || schedule.destination,
                freeBookingDetails.registrationNumber,
                freeBookingDetails.phone
            );
            bookingId = res.bookingId;
        } else {
            const res = await api.bookSeats(
                user.id, 
                scheduleId, 
                selectedSeats, 
                userOrigin || schedule.origin, 
                userDestination || schedule.destination,
                pricePerSeat
            );
            bookingId = res.bookingId;
        }
        setModalState({ isOpen: true, bookingId, bookingType });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An internal server error occurred in createBooking.";
      setError(message);
    } finally {
      setIsBooking(false);
    }
  };

  const handleDownloadTicket = async () => {
    if (modalState.bookingId) {
        await generatePdfReceipt(modalState.bookingId, modalState.bookingType);
    }
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, bookingId: '', bookingType: 'normal' });
    navigate('/');
  };

  if (isLoading) return <div className="loader-overlay"><div className="page-loader"></div></div>;
  
  if (error && !schedule) return (
    <div className="container booking-page">
      <Card className="booking-page__error-container">
          <Ban className="booking-page__error-icon" />
          <h2 className="booking-page__error-title">Booking Unavailable</h2>
          <p className="booking-page__error-text">{error}</p>
          <Button onClick={() => navigate('/')} className="booking-page__error-btn">Go to Homepage</Button>
      </Card>
    </div>
  );

  if (!schedule) return <div className="container text-center">No schedule data available.</div>;

  return (
    <div className="container booking-page">
      <h1 className="booking-page__title">Book Your Seats</h1>
      <p className="booking-page__subtitle">{userOrigin || schedule.origin} to {userDestination || schedule.destination}</p>
      
      <div className="booking-page__layout">
        <div className="booking-page__seat-area">
            <SeatLayout 
              layout={schedule.seatLayout}
              bookedSeats={bookedSeats}
              selectedSeats={selectedSeats}
              onSeatClick={handleSeatClick}
            />
        </div>
        <div className="booking-page__summary-area">
          <Card className="booking-page__summary-card">
            <h2 className="booking-page__summary-title">Booking Summary</h2>
            
            {schedule.isFreeBookingEnabled && (
                <div className="booking-page__booking-type-toggle">
                    <button onClick={() => setBookingType('normal')} className={`booking-page__booking-type-btn ${bookingType === 'normal' ? 'booking-page__booking-type-btn--active-normal' : ''}`}>Normal Ticket</button>
                    <button onClick={() => setBookingType('free')} className={`booking-page__booking-type-btn ${bookingType === 'free' ? 'booking-page__booking-type-btn--active-free' : ''}`}><Gift size={18}/> Free Ticket</button>
                </div>
            )}

            {bookingType === 'normal' ? (
                 <div className="booking-page__summary-details">
                    <div className="booking-page__summary-row">
                        <span className="booking-page__summary-label">Selected Seats:</span>
                        <span className="booking-page__summary-value">{selectedSeats.length}</span>
                    </div>
                    <div className="booking-page__summary-row">
                        <span className="booking-page__summary-label">Price per Seat:</span>
                        <span className="booking-page__summary-value">₹{pricePerSeat.toFixed(2)}</span>
                    </div>
                    <div className="booking-page__total-fare">
                        <span className="booking-page__total-fare-label">Total Fare:</span>
                        <span className="booking-page__total-fare-value">₹{totalFare.toFixed(2)}</span>
                    </div>
                </div>
            ) : (
                <div className="booking-page__free-form">
                    <p className="booking-page__free-notice">Verify eligibility for a free ticket via special govt. announcement.</p>
                    <Input id="registrationNumber" label="Registration Number" value={freeBookingDetails.registrationNumber} onChange={handleFreeBookingFormChange} required />
                    <Input id="phone" label="Registered Phone Number" type="tel" value={freeBookingDetails.phone} onChange={handleFreeBookingFormChange} required />
                </div>
            )}

            {error && <p className="booking-page__error">{error}</p>}
            
            <Button 
              onClick={handleConfirmBooking} 
              disabled={selectedSeats.length === 0 || isBooking || (bookingType === 'free' && (!freeBookingDetails.registrationNumber || !freeBookingDetails.phone))}
              isLoading={isBooking}
              className={`booking-page__confirm-btn ${bookingType === 'free' ? 'booking-page__confirm-btn--free' : ''}`}
            >
              {bookingType === 'free' ? <><Gift size={20} /> Verify & Book Free</> : <><Ticket size={20} /> Confirm Booking</>}
            </Button>
          </Card>
        </div>
      </div>
      <Modal isOpen={modalState.isOpen} onClose={handleCloseModal} title="Booking Successful!">
        <div className="booking-page__modal-content">
            <CheckCircle className="booking-page__modal-icon" />
            <p className="booking-page__modal-text1">Your seats have been booked successfully!</p>
            <p className="booking-page__modal-text2">Your e-ticket is ready. Please download it for your records.</p>
            <div className="booking-page__modal-actions">
                <Button onClick={handleDownloadTicket}>
                    <Download size={18} />
                    Download Ticket
                </Button>
                <Button onClick={handleCloseModal} variant="secondary">
                    Close
                </Button>
            </div>
        </div>
      </Modal>
    </div>
  );
};