
import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import type { UserBooking, Schedule } from '../types';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { Download, QrCode, Calendar, IndianRupee, Star, Armchair, Baby, Accessibility, Users } from 'lucide-react';

const BookingDetailCard: React.FC<{ booking: UserBooking }> = ({ booking }) => {
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [discounts, setDiscounts] = useState<{child: number, senior: number}>({child: 40, senior: 50});
    const { user } = useAuth();

    const getQrPayload = () => {
        if (!user || !schedule || !schedule.fullRouteStops || !discounts) return null;

        const formatTime = (timeStr?: string | null) => timeStr ? timeStr.substring(0, 5) : 'N/A';

        const originStop = schedule.fullRouteStops.find(s => s.name === booking.origin);
        const destStop = schedule.fullRouteStops.find(s => s.name === booking.destination);
        const departureTime = formatTime(originStop?.departure);
        const arrivalTime = formatTime(destStop?.arrival);
        
        const segmentFare = (destStop?.fare || 0) - (originStop?.fare || 0);
        const childFare = segmentFare * (1 - (discounts.child / 100));
        const seniorFare = segmentFare * (1 - (discounts.senior / 100));

        const seniorSeatsCount = booking.passengerDetails?.filter(p => p.type === 'SENIOR').length || 0;
        const childSeatsCount = booking.passengerDetails?.filter(p => p.type === 'CHILD').length || 0;
        const normalSeatsCount = (booking.seatIds?.length || 0) - seniorSeatsCount - childSeatsCount;

        // Mask Aadhaar for QR code
        const discountedPassengers = booking.passengerDetails?.map(p => ({
            ...p,
            aadhaarNumber: `...${p.aadhaarNumber.slice(-4)}`
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
            discountedPassengers: discountedPassengers || [],
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

    const getBookingTag = () => {
        if (booking.isFreeTicket) {
            return <span className="booking-detail-card__tag tag-free"><Star size={12}/> FREE TICKET</span>;
        }
        switch (booking.discountType) {
            case 'CHILD':
                return <span className="booking-detail-card__tag tag-child"><Baby size={12}/> CHILD DISCOUNT</span>;
            case 'SENIOR':
                return <span className="booking-detail-card__tag tag-senior"><Accessibility size={12}/> SENIOR DISCOUNT</span>;
            case 'MIXED':
                return <span className="booking-detail-card__tag tag-mixed"><Users size={12}/> MIXED DISCOUNT</span>;
            default:
                return null;
        }
    };


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

            const originStop = schedule.fullRouteStops.find(s => s.name === booking.origin);
            const destStop = schedule.fullRouteStops.find(s => s.name === booking.destination);
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

            // Ticket breakdown
            doc.setFont("helvetica", "bold");
            doc.text("Ticket Summary:", 20, yPos);
            yPos += 7;
            doc.setFont("helvetica", "normal");

            const seniorSeatsCount = booking.passengerDetails?.filter(p => p.type === 'SENIOR').length || 0;
            const childSeatsCount = booking.passengerDetails?.filter(p => p.type === 'CHILD').length || 0;
            const normalSeats = (booking.seatIds?.length || 0) - seniorSeatsCount - childSeatsCount;

            const segmentFare = (destStop?.fare || 0) - (originStop?.fare || 0);
            const childFare = segmentFare * (1 - (discounts.child / 100));
            const seniorFare = segmentFare * (1 - (discounts.senior / 100));

            if (normalSeats > 0) {
                const subtotal = normalSeats * segmentFare;
                doc.text(`- Normal Tickets: ${normalSeats} x ₹${segmentFare.toFixed(2)} = ₹${subtotal.toFixed(2)}`, 25, yPos);
                yPos += 7;
            }
            if (childSeatsCount > 0) {
                const subtotal = childSeatsCount * childFare;
                doc.text(`- Child Tickets: ${childSeatsCount} x ₹${childFare.toFixed(2)} = ₹${subtotal.toFixed(2)}`, 25, yPos);
                yPos += 7;
            }
            if (seniorSeatsCount > 0) {
                const subtotal = seniorSeatsCount * seniorFare;
                doc.text(`- Senior Tickets: ${seniorSeatsCount} x ₹${seniorFare.toFixed(2)} = ₹${subtotal.toFixed(2)}`, 25, yPos);
                yPos += 7;
            }
            if (yPos > 280) { doc.addPage(); yPos = 20; }
            
            // Passenger Details
            if (booking.passengerDetails && booking.passengerDetails.length > 0) {
                yPos += 5;
                doc.setFont("helvetica", "bold");
                doc.text("Discounted Passenger Details:", 20, yPos);
                yPos += 7;
                doc.setFont("helvetica", "normal");
                
                booking.passengerDetails.forEach(p => {
                    doc.text(`- Seat ${p.seatId} (${p.type}): ${p.fullName}, Aadhaar: ...${p.aadhaarNumber.slice(-4)}`, 25, yPos);
                    yPos += 7;
                    if (yPos > 280) { doc.addPage(); yPos = 20; }
                });
            }

            yPos += 5;
            doc.setFont("helvetica", "bold");
            let fareText = `Total Fare: INR ${Number(booking.fare || 0).toFixed(2)}`;
            if (booking.isFreeTicket) {
                fareText = `Total Fare: FREE (Govt. Special Announcement)`;
            }
            doc.text(fareText, 20, yPos);
            
            doc.save(`GovernmentBus-Ticket-${booking.id}.pdf`);
        } catch (err) {
            console.error("Failed to generate PDF", err);
        } finally {
            setIsDownloading(false);
        }
    };

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
        </Card>
    );
};


export const UserDashboardPage: React.FC = () => {
    const [bookings, setBookings] = useState<UserBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();

    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const fetchBookings = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const userBookings = await api.getUserBookings(user.id);
                setBookings(userBookings);
            } catch (err) {
                setError("Failed to load your bookings. Please try again later.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchBookings();
    }, [user]);

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
                    <BookingDetailCard key={booking.id} booking={booking} />
                ))}
            </div>
        </div>
    );
};
