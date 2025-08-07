

export enum UserRole {
    USER = 'USER',
    ADMIN = 'ADMIN',
    SUB_ADMIN = 'SUB_ADMIN',
}

export interface User {
    id: string;
    fullName: string;
    phone: string;
    email?: string;
    role: UserRole;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    dob?: string;
    password?: string | null; // Allow password to be null for OTP users
    assignedDistricts?: string[];
    govtExamRegistrationNumber?: string;
    isFreeTicketEligible?: boolean;
}

export interface PassCard {
  id: number;
  userId: string;
  passCardNumber: string;
  userImage: string; // base64 string
  fatherName: string;
  origin: string;
  destination: string;
  expiryDate: string; // ISO date string
  fullName: string;
  dob: string;
}

export type SeatLayout = '2x2' | '2x3' | '2x1';

export interface RouteStop {
    name: string;
    order: number;
    arrival: string | null;
    departure: string;
    fare: number;
}

export interface Schedule {
    id: string;
    origin?: string;
    destination?: string;
    busName: string;
    departureTime: string; // "HH:mm" format
    arrivalTime: string; // "HH:mm" format
    via: string[];
    seatLayout: SeatLayout;
    bookingEnabled: boolean;
    isFreeBookingEnabled?: boolean;
    isDiscountEnabled?: boolean; // New field for discounts
    fare: number;
    userOrigin?: string; // For search results on segments
    userDestination?: string; // For search results on segments
    fullRoute?: string;
    fullRouteStops?: RouteStop[]; // Detailed stops for editing
}

export interface Booking {
    id: string;
    userId: string;
    scheduleId: string;
    fare: number;
    bookingDate: string; // ISO string
    seats: BookedSeat[];
    origin: string; // The user's boarding point
    destination: string; // The user's deboarding point
    discountType: 'NONE' | 'CHILD' | 'SENIOR';
    aadhaarNumber: string | null;
}

export interface UserBooking {
    id: string;
    scheduleId: string;
    fare: number;
    isFreeTicket: boolean;
    govtExamRegistrationNumber: string | null;
    bookingDate: string; // ISO string
    origin: string;
    destination: string;
    seatIds: string[];
    discountType: 'NONE' | 'CHILD' | 'SENIOR';
    aadhaarNumber: string | null;
}

export interface BookedSeat {
    id: number;
    bookingId: string;
    seatId: string; // e.g., 'A1', 'C3'
}

export interface BusLocation {
    busId: string;
    lat: number;
    lng: number;
    lastUpdated: string; // ISO string
    route: { lat: number, lng: number }[];
}

// --- Revenue Analytics Types ---
export interface RevenueSummary {
    totalRevenue: number;
    totalPaidBookings: number;
    totalFreeTickets: number;
    totalBookings: number;
}
export interface DistrictRevenue {
    district: string;
    revenue: number;
    paidBookings: number;
    freeTickets: number;
    totalBookings: number;
}
export interface RouteRevenue {
    scheduleId: string;
    busName: string;
    origin: string;
    destination: string;
    revenue: number;
    totalBookings: number;
}

export interface RevenueAnalyticsData {
    summary: RevenueSummary;
    byDistrict: DistrictRevenue[];
    byRoute?: RouteRevenue[];
}

// --- Schedule Upload Types ---
export interface ParsedStop {
  stopName: string;
  arrivalTime: string | null;
  departureTime: string;
  fareFromOrigin: number;
  stopOrder?: number;
}

export interface ParsedSchedule {
  id?: string;
  busName: string;
  seatLayout: SeatLayout;
  bookingEnabled: boolean;
  stops: ParsedStop[];
}

// --- Beneficiary Upload Types ---
export interface ParsedBeneficiary {
    govtExamRegistrationNumber: string;
    phone: string;
    fullName: string;
    email?: string;
    dob?: string;
}