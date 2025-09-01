

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import type { UserBooking, Schedule, PassengerDetail } from '../types';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { Download, QrCode, Calendar, IndianRupee, Star, Armchair, XCircle, AlertCircle } from 'lucide-react';

const BookingDetailCard: React.FC<{ booking: UserBooking, isCancellationEnabled: boolean, onBookingUpdate: () => void }> = ({ booking, isCancellationEnabled, onBookingUpdate }) => {
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [discounts, setDiscounts] = useState<{child: number, senior: number}>({child: 40, senior: 50});
    const { user } = useAuth();
    const [canCancel, setCanCancel] = useState(false);
    const [seatsToCancel, setSeatsToCancel] = useState<Set<string>>(new Set());
    const [cancelError, setCancelError] = useState<string | null>(null);

    const cancellablePassengers = useMemo(() => {
        return booking.passengerDetails?.filter(p => p.status !== 'CANCELLED') || [];
    }, [booking.passengerDetails]);

    const getQrPayload = () => {
        if (!user || !schedule || !schedule.fullRouteStops || !discounts) return null;

        const formatTime = (timeStr?: string | null) => timeStr ? timeStr.substring(0, 5) : 'N/A';

        const originStop = schedule.fullRouteStops.find(s => s.name.trim().toLowerCase() === booking.origin.trim().toLowerCase());
        const destStop = schedule.fullRouteStops.find(s => s.name.trim().toLowerCase() === booking.destination.trim().toLowerCase());
        const departureTime = formatTime(originStop?.departure);
        const arrivalTime = formatTime(destStop?.arrival);
        
        const segmentFare = (destStop?.fare || 0) - (originStop?.fare || 0);
        const childFare = segmentFare * (1 - (discounts.child / 100));
        const seniorFare = segmentFare * (1 - (discounts.senior / 100));

        const seniorSeatsCount = booking.passengerDetails?.filter(p => p.type === 'SENIOR' && p.status !== 'CANCELLED').length || 0;
        const childSeatsCount = booking.passengerDetails?.filter(p => p.type === 'CHILD' && p.status !== 'CANCELLED').length || 0;
        const normalSeatsCount = (booking.seatIds?.length || 0) - seniorSeatsCount - childSeatsCount;

        // Mask Aadhaar for QR code
        const activePassengers = booking.passengerDetails?.filter(p => p.status !== 'CANCELLED').map(p => ({
            ...p,
            aadhaarNumber: p.aadhaarNumber ? `...${p.aadhaarNumber.slice(-4)}` : undefined,
        }));
        
        return {
            bookingId: booking.id,
            passengerName: user.fullName,
            busName: schedule.busName,
            scheduleId: booking.scheduleId,
            route: {
                origin: booking.origin,
                destination: booking.destination,
            },
            timings: {
                departure: `Departure from ${booking.origin}: ${departureTime}`,
                arrival: `Arrival at ${booking.destination}: ${arrivalTime}`,
            },
            seats: booking.seatIds || [],
            fare: {
                total: Number(booking.fare || 0).toFixed(2),
                summary: {
                    normal: { count: normalSeatsCount, price: segmentFare.toFixed(2) },
                    child: { count: childSeatsCount, price: childFare.toFixed(2) },
                    senior: { count: seniorSeatsCount, price: seniorFare.toFixed(2) }
                }
            },
            bookingType: booking.isFreeTicket ? 'free' : (booking.discountType?.toLowerCase() || 'normal'),
            bookingDate: booking.bookingDate,
            passengers: activePassengers,
        };
    };

    useEffect(() => {
        const fetchDetails = async () => {
            if (!booking.scheduleId) return;
            try {
                const scheduleData = await api.getScheduleById(booking.scheduleId);
                setSchedule(scheduleData);
                
                if (booking.discountType !== 'NONE' && scheduleData?.isDiscountEnabled) {
                    const [childRes, seniorRes] = await Promise.all([
                        api.getSetting('childDiscountPercentage'),
                        api.getSetting('seniorDiscountPercentage')
                    ]);
                    setDiscounts({
                        child: Number(childRes.value || 40),
                        senior: Number(seniorRes.value || 50)
                    });
                }
            } catch (error) {
                console.error(`Failed to fetch schedule details for booking ${booking.id}:`, error);
            }
        };
        fetchDetails();
    }, [booking.id, booking.scheduleId, booking.discountType]);

    useEffect(() => {
        if (schedule && booking.status !== 'CANCELLED') {
            const originStop = schedule.fullRouteStops?.find(s => s.name.trim().toLowerCase() === booking.origin.trim().toLowerCase());
            if (originStop && originStop.departure) {
                const [hours, minutes] = originStop.departure.split(':');
                const bookingDateTime = new Date(booking.bookingDate);
                let departureDateTime = new Date(booking.bookingDate);
                departureDateTime.setHours(Number(hours), Number(minutes), 0, 0);

                if (departureDateTime < bookingDateTime) {
                    departureDateTime.setDate(departureDateTime.getDate() + 1);
                }

                const oneHourBeforeDeparture = new Date(departureDateTime.getTime() - 60 * 60 * 1000);
                setCanCancel(new Date() < oneHourBeforeDeparture);
            }
        }
    }, [schedule, booking]);


    const getBookingTag = () => {
        if (booking.isFreeTicket) {
            return <span className="booking-detail-card__tag tag-free"><Star size={12}/> FREE TICKET</span>;
        }
        switch (booking.status) {
            case 'CANCELLED':
                return <span className="booking-detail-card__status-tag tag-cancelled">CANCELLED</span>;
            case 'PARTIALLY_CANCELLED':
                 return <span className="booking-detail-card__status-tag tag-partial">PARTIALLY CANCELLED</span>;
            default:
                return null;
        }
    };

    const handleSeatToCancelToggle = (seatId: string) => {
        const newSet = new Set(seatsToCancel);
        if (newSet.has(seatId)) {
            newSet.delete(seatId);
        } else {
            newSet.add(seatId);
        }
        setSeatsToCancel(newSet);
    };
    
    const handleConfirmCancellation = async () => {
        if (seatsToCancel.size === 0) {
            setCancelError("Please select at least one seat to cancel.");
            return;
        }
        setIsCancelling(true);
        setCancelError(null);
        try {
            await api.cancelBooking(booking.id, Array.from(seatsToCancel));
            setIsCancelModalOpen(false);
            onBookingUpdate();
        } catch (err) {
            setCancelError(err instanceof Error ? err.message : "Failed to cancel tickets.");
        } finally {
            setIsCancelling(false);
        }
    }


    const generateQrCode = async () => {
        const payload = getQrPayload();
        if (!payload) return;

        try {
            const url = await QRCode.toDataURL(JSON.stringify(payload), { errorCorrectionLevel: 'H', width: 256 });
            setQrCodeDataUrl(url);
            setIsQrModalOpen(true);
        } catch (err) {
            console.error("Failed to generate QR code", err);
        }
    };

    const generatePdfReceipt = async () => {
        if (!user || !schedule || !schedule.fullRouteStops || !discounts) return;
        setIsDownloading(true);
        
        try {
            const doc = new jsPDF();
            const formatTime = (timeStr?: string | null) => timeStr ? timeStr.substring(0, 5) : 'N/A';

            const originStop = schedule.fullRouteStops.find(s => s.name.trim().toLowerCase() === booking.origin.trim().toLowerCase());
            const destStop = schedule.fullRouteStops.find(s => s.name.trim().toLowerCase() === booking.destination.trim().toLowerCase());
            const departureTime = formatTime(originStop?.departure);
            const arrivalTime = formatTime(destStop?.arrival);
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.text("Government Bus - E-Ticket", 20, 20);
            
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.text(`Passenger: ${user.fullName}`, 20, 35);
            doc.text(`Route: ${booking.origin} to ${booking.destination}`, 20, 45);
            doc.text(`Bus: ${schedule.busName} (${schedule.id})`, 20, 55);
            doc.text(`Booking Date: ${new Date(booking.bookingDate).toLocaleString()}`, 20, 65);
            doc.text(`Departure from ${booking.origin}: ${departureTime}`, 20, 75);
            doc.text(`Arrival at ${booking.destination}: ${arrivalTime}`, 20, 82);
            doc.text(`Seats: ${(booking.seatIds || []).join(', ')}`, 20, 92);

            const payload = getQrPayload();
            if (!payload) {
                setIsDownloading(false);
                return;
            }

            const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(payload), { errorCorrectionLevel: 'H' });
            
            doc.addImage(qrCodeDataURL, 'PNG', 140, 30, 50, 50);
            doc.setFontSize(8);
            doc.text("Scan for Verification", 147, 85);

            let yPos = 100;

            doc.setFont("helvetica", "bold");
            doc.text("Ticket Summary:", 20, yPos);
            yPos += 7;
            doc.setFont("helvetica", "normal");

            const activePassengerDetails = booking.passengerDetails?.filter(p => p.status !== 'CANCELLED') || [];
            const seniorSeatsCount = activePassengerDetails.filter(p => p.type === 'SENIOR').length;
            const childSeatsCount = activePassengerDetails.filter(p => p.type === 'CHILD').length;
            const normalSeats = activePassengerDetails.length - seniorSeatsCount - childSeatsCount;
            
            const segmentFare = (destStop?.fare || 0) - (originStop?.fare || 0);
            const childFare = segmentFare * (1 - (discounts.child / 100));
            const seniorFare = segmentFare * (1 - (discounts.senior / 100));
            
            if (normalSeats > 0) doc.text(`- Normal Tickets: ${normalSeats} x ₹${segmentFare.toFixed(2)} = ₹${(normalSeats * segmentFare).toFixed(2)}`, 25, yPos); yPos += 7;
            if (childSeatsCount > 0) doc.text(`- Child Tickets: ${childSeatsCount} x ₹${childFare.toFixed(2)} = ₹${(childSeatsCount * childFare).toFixed(2)}`, 25, yPos); yPos += 7;
            if (seniorSeatsCount > 0) doc.text(`- Senior Tickets: ${seniorSeatsCount} x ₹${seniorFare.toFixed(2)} = ₹${(seniorSeatsCount * seniorFare).toFixed(2)}`, 25, yPos); yPos += 7;

            yPos += 5;
            doc.setFont("helvetica", "bold");
            let fareText = `Total Fare: INR ${Number(booking.fare || 0).toFixed(2)}`;
            if (booking.isFreeTicket) fareText = `Total Fare: FREE`;
            doc.text(fareText, 20, yPos);
            
            doc.save(`GovernmentBus-Ticket-${booking.id}.pdf`);
        } catch (err) {
            console.error("Failed to generate PDF", err);
        } finally {
            setIsDownloading(false);
        }
    };
    
    const refundAmount = useMemo(() => {
        return cancellablePassengers
            .filter(p => seatsToCancel.has(p.seatId))
            .reduce((sum, p) => sum + p.fare, 0);
    }, [seatsToCancel, cancellablePassengers]);

    return (
        <Card className="booking-detail-card">
            <div className="booking-detail-card__container">
                <div className="booking-detail-card__info">
                    <div className="booking-detail-card__header">
                        <h3 className="booking-detail-card__route">{booking.origin} to {booking.destination}</h3>
                        {getBookingTag()}
                    </div>
                    <p className="booking-detail-card__bus-name">{schedule ? schedule.busName : 'Loading bus details...'}</p>
                    
                    <div className="booking-detail-card__meta">
                        <div className="booking-detail-card__meta-item" title="Booking Date"><Calendar size={16} /><span>{new Date(booking.bookingDate).toLocaleDateString()}</span></div>
                        <div className="booking-detail-card__meta-item" title="Total Fare"><IndianRupee size={16} /><span>{Number(booking.fare || 0).toFixed(2)}</span></div>
                        <div className="booking-detail-card__meta-item booking-detail-card__meta-item--full" title="Booked Seats"><Armchair size={16} /><span>{(booking.seatIds || []).join(', ')}</span></div>
                    </div>
                </div>

                <div className="booking-detail-card__actions">
                    {isCancellationEnabled && canCancel && booking.status !== 'CANCELLED' && (
                         <Button onClick={() => setIsCancelModalOpen(true)} variant="danger" className="booking-detail-card__btn">
                            <div className="btn__loader"><XCircle size={18} /> Cancel</div>
                        </Button>
                    )}
                    <Button onClick={generateQrCode} variant="secondary" className="booking-detail-card__btn" disabled={!schedule}>
                        <div className="btn__loader"><QrCode size={18} /> Show QR</div>
                    </Button>
                    <Button onClick={generatePdfReceipt} isLoading={isDownloading} disabled={!schedule || !discounts} className="booking-detail-card__btn">
                         <div className="btn__loader"><Download size={18} /> Download</div>
                    </Button>
                </div>
            </div>
            <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="Your Ticket QR Code">
                <div className="booking-detail-card__qr-modal-content">
                    <p className="booking-detail-card__qr-modal-text">Present this QR code for verification.</p>
                    {qrCodeDataUrl && <img src={qrCodeDataUrl} alt="Booking QR Code" className="booking-detail-card__qr-modal-image" />}
                </div>
            </Modal>
            <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Cancel Seats">
                <div className="cancellation-modal__content">
                    <p>Select the seats you wish to cancel. This action is irreversible.</p>
                    <div className="cancellation-modal__list">
                        {cancellablePassengers.map(p => (
                            <label key={p.seatId} className="cancellation-modal__item">
                                <input type="checkbox" className="cancellation-modal__checkbox" checked={seatsToCancel.has(p.seatId)} onChange={() => handleSeatToCancelToggle(p.seatId)}/>
                                <div>
                                    Seat <strong>{p.seatId}</strong> ({p.fullName}) - ₹{p.fare.toFixed(2)}
                                </div>
                            </label>
                        ))}
                    </div>
                     <div className="cancellation-modal__summary">
                        <strong>Refund Amount: ₹{refundAmount.toFixed(2)}</strong>
                    </div>
                    {cancelError && <p className="auth-form__error">{cancelError}</p>}
                    <div className="booking-page__modal-actions" style={{marginTop: '1rem'}}>
                         <Button onClick={() => setIsCancelModalOpen(false)} variant="secondary">Back</Button>
                         <Button onClick={handleConfirmCancellation} variant="danger" isLoading={isCancelling} disabled={seatsToCancel.size === 0}>Confirm Cancellation</Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};


export const UserDashboardPage: React.FC = () => {
    const [bookings, setBookings] = useState<UserBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCancellationEnabled, setIsCancellationEnabled] = useState(false);
    const { user } = useAuth();

    const fetchBookingsAndSettings = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const [userBookings, cancellationSetting] = await Promise.all([
                api.getUserBookings(user.id),
                api.getSetting('isCancellationEnabled')
            ]);
            setBookings(userBookings);
            setIsCancellationEnabled(cancellationSetting.value === 'true');
        } catch (err) {
            setError("Failed to load your bookings. Please try again later.");
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchBookingsAndSettings();
    }, [fetchBookingsAndSettings]);

    return (
        <div className="container dashboard-page">
            <h1 className="dashboard-page__title">My Bookings</h1>
            <p className="dashboard-page__subtitle">View and manage your past and upcoming trips.</p>

            <div className="dashboard-page__bookings-list">
                {isLoading && (
                    <div className="home-page__loader">
                        <div className="home-page__spinner"></div>
                    </div>
                )}
                {error && <Card><p className="home-page__error">{error}</p></Card>}
                {!isLoading && !error && bookings.length === 0 && (
                    <Card><p className="text-center">You have no bookings yet. Time to plan a trip!</p></Card>
                )}
                {bookings.map(booking => (
                    <BookingDetailCard 
                        key={booking.id} 
                        booking={booking}
                        isCancellationEnabled={isCancellationEnabled}
                        onBookingUpdate={fetchBookingsAndSettings}
                    />
                ))}
            </div>
        </div>
    );
};