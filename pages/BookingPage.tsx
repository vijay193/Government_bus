


import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import type { Schedule, SeatBookingInfo } from '../types';
import { SeatLayout } from '../components/bus/SeatLayout';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { Modal } from '../components/common/Modal';
import { SEAT_PRICE } from '../constants';
import { Ticket, X, CheckCircle, Ban, Gift, ArrowRight, Download, Baby, Accessibility, ShieldAlert, Users, IndianRupee, Trash2 } from 'lucide-react';

type BookingMode = 'paid' | 'free';
type SeatType = 'normal' | 'child' | 'senior';

interface SeatDetails {
    [seatId: string]: {
        type: SeatType;
        aadhaar: string;
        fullName: string;
    }
}

interface ModalState {
  isOpen: boolean;
  bookingId: string;
  bookingMode: BookingMode;
}

const SeatDetailsEditor: React.FC<{
    seatId: string;
    details: SeatDetails[string];
    onDetailChange: (seatId: string, field: keyof SeatDetails[string], value: string) => void;
    onRemove: (seatId: string) => void;
    isDiscountEnabled: boolean;
}> = ({ seatId, details, onDetailChange, onRemove, isDiscountEnabled }) => {
    return (
        <div className="seat-details-editor-card">
            <div className="seat-details-editor-card__header">
                <span className="seat-details-editor-card__seat-id">{seatId}</span>
                <button onClick={() => onRemove(seatId)} className="seat-details-editor-card__remove-btn">
                    <Trash2 size={16}/>
                </button>
            </div>
            <div className="input-wrapper">
                <label htmlFor={`type-${seatId}`} className="input-label">Ticket Type</label>
                <select 
                    id={`type-${seatId}`} 
                    className="input-field"
                    value={details.type}
                    onChange={(e) => onDetailChange(seatId, 'type', e.target.value)}
                >
                    <option value="normal">Normal</option>
                    {isDiscountEnabled && <option value="child">Child</option>}
                    {isDiscountEnabled && <option value="senior">Senior</option>}
                </select>
            </div>
            <Input 
                id={`fullName-${seatId}`} 
                label="Full Name"
                value={details.fullName}
                onChange={(e) => onDetailChange(seatId, 'fullName', e.target.value)}
                placeholder="Enter passenger's full name"
                required
            />
            {(details.type === 'child' || details.type === 'senior') && (
                 <Input 
                    id={`aadhaar-${seatId}`} 
                    label="Aadhaar Number"
                    value={details.aadhaar}
                    onChange={(e) => onDetailChange(seatId, 'aadhaar', e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="Enter 12-digit number"
                    maxLength={12}
                    pattern="\d{12}"
                    required
                />
            )}
        </div>
    );
};


export const BookingPage: React.FC = () => {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const { fare: fareFromState, userOrigin, userDestination } = location.state || {};

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [bookedSeats, setBookedSeats] = useState<string[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [seatDetails, setSeatDetails] = useState<SeatDetails>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isBooking, setIsBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({ isOpen: false, bookingId: '', bookingMode: 'paid' });
  const [mode, setMode] = useState<BookingMode>('paid');
  
  const [freeBookingDetails, setFreeBookingDetails] = useState({ registrationNumber: '', phone: '' });
  const [discounts, setDiscounts] = useState({ child: 40, senior: 50 });

  const MAX_SEATS = useMemo(() => (mode === 'free' ? 1 : 5), [mode]);

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
        const scheduleData = await api.getScheduleById(scheduleId);
        
        if (scheduleData) {
          if (!scheduleData.bookingEnabled) {
            setError("Booking for this schedule is currently unavailable.");
            setSchedule(null);
          } else {
            setSchedule(scheduleData);
            const origin = userOrigin || scheduleData.origin;
            const destination = userDestination || scheduleData.destination;

            if (!origin || !destination) {
                setError("Could not determine origin and destination for booking.");
                return;
            }

            const bookedSeatsData = await api.getBookedSeatsForSchedule(scheduleId, origin, destination);
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
    
    const fetchDiscounts = async () => {
        try {
           const [childRes, seniorRes] = await Promise.all([
               api.getSetting('childDiscountPercentage'),
               api.getSetting('seniorDiscountPercentage')
           ]);
           setDiscounts({
               child: Number(childRes.value || 40),
               senior: Number(seniorRes.value || 50)
           });
       } catch(e) {
           console.error("Could not fetch discounts, using defaults.", e);
       }
   }

    fetchBookingData();
    fetchDiscounts();
  }, [scheduleId, userOrigin, userDestination]);

    const handleModeChange = (newMode: BookingMode) => {
        setMode(newMode);
        setSelectedSeats([]);
        setSeatDetails({});
        setError(null);
    }

  const handleSeatClick = useCallback((seatId: string) => {
    setError(null);
    const isSelected = selectedSeats.includes(seatId);

    if (isSelected) {
        setSelectedSeats(prev => prev.filter(s => s !== seatId));
        setSeatDetails(prev => {
            const newDetails = {...prev};
            delete newDetails[seatId];
            return newDetails;
        });
    } else {
        if (selectedSeats.length >= MAX_SEATS) {
            setError(`You can select a maximum of ${MAX_SEATS} seat(s) in ${mode} mode.`);
            setTimeout(() => setError(null), 3000);
            return;
        }
        setSelectedSeats(prev => [...prev, seatId]);
        if(mode === 'paid') {
            const isFirstSeat = selectedSeats.length === 0;
            setSeatDetails(prev => ({...prev, [seatId]: { type: 'normal', aadhaar: '', fullName: isFirstSeat ? (user?.fullName || '') : '' }}));
        }
    }
  }, [selectedSeats, MAX_SEATS, mode, user?.fullName]);
  
  const handleSeatDetailChange = (seatId: string, field: keyof SeatDetails[string], value: string) => {
      setSeatDetails(prev => ({
          ...prev,
          [seatId]: {
              ...prev[seatId],
              [field]: value
          }
      }));
  };

  const pricePerSeat = Number(fareFromState ?? schedule?.fare ?? SEAT_PRICE);
  
  const totalFare = useMemo(() => {
    if (mode === 'free' || !schedule) return 0;
    
    return selectedSeats.reduce((total, seatId) => {
        const details = seatDetails[seatId];
        if (!details) return total;

        let multiplier = 1;
        if (details.type === 'child') multiplier = 1 - (discounts.child / 100);
        if (details.type === 'senior') multiplier = 1 - (discounts.senior / 100);
        
        return total + (pricePerSeat * multiplier);
    }, 0);
  }, [selectedSeats, seatDetails, mode, schedule, pricePerSeat, discounts]);

  const bookingSummary = useMemo(() => {
      const summary = { normal: 0, child: 0, senior: 0 };
      selectedSeats.forEach(seatId => {
          const type = seatDetails[seatId]?.type;
          if(type) summary[type]++;
      });
      return summary;
  }, [selectedSeats, seatDetails]);

  const generatePdfReceipt = async (bookingId: string) => {
    if (!user || !schedule || !schedule.fullRouteStops) return;

    const doc = new jsPDF();

    const formatTime = (timeStr?: string | null) => timeStr ? timeStr.substring(0, 5) : 'N/A';
    
    const originStop = schedule.fullRouteStops.find(s => s.name === (userOrigin || schedule.origin));
    const destStop = schedule.fullRouteStops.find(s => s.name === (userDestination || schedule.destination));
    const departureTime = formatTime(originStop?.departure);
    const arrivalTime = formatTime(destStop?.arrival);
    
    const normalFare = pricePerSeat;
    const childFare = normalFare * (1 - (discounts.child / 100));
    const seniorFare = normalFare * (1 - (discounts.senior / 100));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Government Bus - E-Ticket", 20, 20);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Passenger: ${user?.fullName}`, 20, 35);
    doc.text(`Route: ${userOrigin || schedule?.origin} to ${userDestination || schedule?.destination}`, 20, 45);
    doc.text(`Bus: ${schedule?.busName} (${schedule?.id})`, 20, 55);
    doc.text(`Booking Date: ${new Date().toLocaleString()}`, 20, 65);
    doc.text(`Departure from ${userOrigin || schedule?.origin}: ${departureTime}`, 20, 75);
    doc.text(`Arrival at ${userDestination || schedule?.destination}: ${arrivalTime}`, 20, 82);
    doc.text(`Seats: ${selectedSeats.join(', ')}`, 20, 92);

    const passengerDetailsForQr = selectedSeats
        .map(seatId => ({ details: seatDetails[seatId], seatId }))
        .map(item => ({
            seatId: item.seatId,
            fullName: item.details.fullName,
            aadhaarNumber: (item.details.type === 'child' || item.details.type === 'senior') ? `...${item.details.aadhaar.slice(-4)}` : undefined,
            type: item.details.type.toUpperCase() as 'CHILD' | 'SENIOR' | 'NORMAL',
        }));

    const qrPayload = {
        bookingId: bookingId,
        passengerName: user?.fullName,
        busName: schedule?.busName,
        scheduleId: schedule?.id,
        route: {
            origin: userOrigin || schedule?.origin,
            destination: userDestination || schedule?.destination,
        },
        timings: {
            departure: `Departure from ${userOrigin || schedule?.origin}: ${departureTime}`,
            arrival: `Arrival at ${userDestination || schedule?.destination}: ${arrivalTime}`,
        },
        seats: selectedSeats,
        fare: {
            total: totalFare.toFixed(2),
            summary: {
                normal: { count: bookingSummary.normal, price: normalFare.toFixed(2) },
                child: { count: bookingSummary.child, price: childFare.toFixed(2) },
                senior: { count: bookingSummary.senior, price: seniorFare.toFixed(2) }
            }
        },
        bookingType: mode,
        bookingDate: new Date().toISOString(),
        passengers: passengerDetailsForQr,
    };
    
    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrPayload), { errorCorrectionLevel: 'H' });
    
    doc.addImage(qrCodeDataURL, 'PNG', 140, 30, 50, 50);
    doc.setFontSize(8);
    doc.text("Scan for Verification", 147, 85);

    let yPos = 100;

    doc.setFont("helvetica", "bold");
    doc.text("Ticket Summary:", 20, yPos);
    yPos += 7;
    doc.setFont("helvetica", "normal");
    if (bookingSummary.normal > 0) {
        const subtotal = bookingSummary.normal * normalFare;
        doc.text(`- Normal Tickets: ${bookingSummary.normal} x ₹${normalFare.toFixed(2)} = ₹${subtotal.toFixed(2)}`, 25, yPos);
        yPos += 7;
    }
    if (bookingSummary.child > 0) {
        const subtotal = bookingSummary.child * childFare;
        doc.text(`- Child Tickets: ${bookingSummary.child} x ₹${childFare.toFixed(2)} = ₹${subtotal.toFixed(2)}`, 25, yPos);
        yPos += 7;
    }
    if (bookingSummary.senior > 0) {
        const subtotal = bookingSummary.senior * seniorFare;
        doc.text(`- Senior Tickets: ${bookingSummary.senior} x ₹${seniorFare.toFixed(2)} = ₹${subtotal.toFixed(2)}`, 25, yPos);
        yPos += 7;
    }
    
    const passengerDetails = selectedSeats.map(seatId => seatDetails[seatId]);
    if (passengerDetails.length > 0) {
        yPos += 5;
        doc.setFont("helvetica", "bold");
        doc.text("Passenger Details:", 20, yPos);
        yPos += 7;
        doc.setFont("helvetica", "normal");
        
        passengerDetails.forEach((p, i) => {
            const seatId = selectedSeats[i];
            let detailText = `- Seat ${seatId} (${p.type.toUpperCase()}): ${p.fullName}`;
            if (p.type !== 'normal') {
                detailText += `, Aadhaar: ...${p.aadhaar.slice(-4)}`;
            }
            doc.text(detailText, 25, yPos);
            yPos += 7;
            if (yPos > 280) { doc.addPage(); yPos = 20; }
        });
    }

    yPos += 5;
    doc.setFont("helvetica", "bold");
    let fareText = `Total Fare: INR ${totalFare.toFixed(2)}`;
    if (mode === 'free') fareText = `Total Fare: FREE (Govt. Special Announcement)`;
    doc.text(fareText, 20, yPos);
    
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
        if (mode === 'free') {
            const res = await api.bookFreeSeats(
                scheduleId,
                selectedSeats,
                userOrigin || schedule.origin,
                userDestination || schedule.destination,
                freeBookingDetails.registrationNumber,
                freeBookingDetails.phone
            );
            bookingId = res.bookingId;
        } else {
            const seatsToBook: SeatBookingInfo[] = selectedSeats.map(seatId => {
                const details = seatDetails[seatId];
                const seatInfo: SeatBookingInfo = {
                    seatId: seatId,
                    type: details.type.toUpperCase() as 'NORMAL' | 'CHILD' | 'SENIOR',
                    fullName: details.fullName,
                };
                if (details.type === 'child' || details.type === 'senior') {
                    seatInfo.aadhaarNumber = details.aadhaar;
                }
                return seatInfo;
            });

            const res = await api.bookSeats(
                scheduleId, 
                seatsToBook,
                userOrigin || schedule.origin, 
                userDestination || schedule.destination
            );
            bookingId = res.bookingId;
        }
        setModalState({ isOpen: true, bookingId, bookingMode: mode });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An internal server error occurred in createBooking.";
      setError(message);
    } finally {
      setIsBooking(false);
    }
  };

  const handleDownloadTicket = async () => {
    if (modalState.bookingId) {
        await generatePdfReceipt(modalState.bookingId);
    }
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, bookingId: '', bookingMode: 'paid' });
    navigate('/');
  };

  const isConfirmButtonDisabled = useMemo(() => {
    if (isBooking || selectedSeats.length === 0) return true;
    if (mode === 'free') {
        return !freeBookingDetails.registrationNumber || !freeBookingDetails.phone;
    }
    // For paid mode, check if all required fields are filled
    for(const seatId of selectedSeats) {
        const details = seatDetails[seatId];
        if (!details || !details.fullName.trim()) { // All passengers need a name
            return true;
        }
        if ((details.type === 'child' || details.type === 'senior') && details.aadhaar.length !== 12) {
            return true;
        }
    }
    return false;
  }, [isBooking, selectedSeats, mode, freeBookingDetails, seatDetails]);


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
              disableSelection={selectedSeats.length >= MAX_SEATS}
            />
        </div>
        <div className="booking-page__summary-area">
          <Card className="booking-page__summary-card">
            <h2 className="booking-page__summary-title">Booking Summary</h2>
            
             <div className="booking-page__booking-type-toggle">
                <button onClick={() => handleModeChange('paid')} className={`booking-page__booking-type-btn ${mode === 'paid' ? 'booking-page__booking-type-btn--active-normal' : ''}`}><Users size={18}/> Paid Booking</button>
                {schedule.isFreeBookingEnabled && (
                    <button onClick={() => handleModeChange('free')} className={`booking-page__booking-type-btn ${mode === 'free' ? 'booking-page__booking-type-btn--active-free' : ''}`}><Gift size={18}/> Free Ticket</button>
                )}
            </div>

            {mode === 'paid' && (
                 <>
                    <div className="booking-page__summary-details">
                        <div className="booking-page__summary-row">
                            <span className="booking-page__summary-label">Selected Seats:</span>
                            <span className="booking-page__summary-value">{selectedSeats.length} / {MAX_SEATS}</span>
                        </div>
                    </div>
                    {selectedSeats.length > 0 && (
                        <div className="booking-page__seat-details-container">
                            {selectedSeats.map(seatId => (
                                <SeatDetailsEditor 
                                    key={seatId} 
                                    seatId={seatId} 
                                    details={seatDetails[seatId]}
                                    onDetailChange={handleSeatDetailChange}
                                    onRemove={handleSeatClick}
                                    isDiscountEnabled={schedule.isDiscountEnabled ?? false}
                                />
                            ))}
                        </div>
                    )}
                     <div className="booking-page__total-fare-breakdown">
                        {bookingSummary.normal > 0 && <span>{bookingSummary.normal} Normal x ₹{pricePerSeat.toFixed(2)}</span>}
                        {bookingSummary.child > 0 && <span>{bookingSummary.child} Child x ₹{(pricePerSeat * (1 - discounts.child/100)).toFixed(2)}</span>}
                        {bookingSummary.senior > 0 && <span>{bookingSummary.senior} Senior x ₹{(pricePerSeat * (1 - discounts.senior/100)).toFixed(2)}</span>}
                    </div>
                    <div className="booking-page__total-fare">
                        <span className="booking-page__total-fare-label">Total Fare:</span>
                        <span className="booking-page__total-fare-value">₹{totalFare.toFixed(2)}</span>
                    </div>
                </>
            )}

            {mode === 'free' && (
                <div className="booking-page__form-section">
                    <div className="booking-page__summary-row" style={{marginBottom: '1rem'}}>
                        <span className="booking-page__summary-label">Selected Seats:</span>
                        <span className="booking-page__summary-value">{selectedSeats.length} / {MAX_SEATS}</span>
                    </div>
                    <p className="booking-page__info-notice notice-free">Verify eligibility for a free ticket via special govt. announcement. Only one seat can be booked.</p>
                    <Input id="registrationNumber" label="Registration Number" value={freeBookingDetails.registrationNumber} onChange={handleFreeBookingFormChange} required />
                    <Input id="phone" label="Registered Phone Number" type="tel" value={freeBookingDetails.phone} onChange={handleFreeBookingFormChange} required />
                </div>
            )}

            {error && <p className="booking-page__error">{error}</p>}
            
            <Button 
              onClick={handleConfirmBooking} 
              disabled={isConfirmButtonDisabled}
              isLoading={isBooking}
              className="booking-page__confirm-btn"
            >
              {mode === 'free' ? <><Gift size={20} /> Verify & Book Free</> : <><Ticket size={20} /> Confirm Booking</>}
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
