

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
    password?: string | null;
    assignedDistricts?: string[];
    govtExamRegistrationNumber?: string;
    isFreeTicketEligible?: boolean;
}

export interface PassCard {
  id: number;
  userId: string;
  passCardNumber: string;
  userImage: string;
  fatherName: string;
  origin: string;
  destination: string;
  expiryDate: string;
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
    departureTime: string;
    arrivalTime: string;
    via: string[];
    seatLayout: SeatLayout;
    bookingEnabled: boolean;
    isFreeBookingEnabled?: boolean;
    isDiscountEnabled?: boolean;
    fare: number;
    userOrigin?: string;
    userDestination?: string;
    fullRoute?: string;
    fullRouteStops?: RouteStop[];
}

export interface PassengerDetail {
    seatId: string;
    fullName: string;
    aadhaarNumber: string;
    type: 'CHILD' | 'SENIOR' | 'NORMAL';
    fare: number;
    status?: 'BOOKED' | 'CANCELLED';
}

export interface SeatBookingInfo {
    seatId: string;
    type: 'NORMAL' | 'CHILD' | 'SENIOR';
    fullName: string;
    aadhaarNumber?: string;
}

export interface UserBooking {
    id: string;
    scheduleId: string;
    fare: number;
    originalFare?: number;
    status?: 'CONFIRMED' | 'PARTIALLY_CANCELLED' | 'CANCELLED';
    isFreeTicket: boolean;
    govtExamRegistrationNumber?: string;
    bookingDate: string;
    origin: string;
    destination: string;
    discountType: 'NONE' | 'CHILD' | 'SENIOR' | 'MIXED';
    passengerDetails?: PassengerDetail[];
    seatIds?: string[];
}

export interface BusLocation {
    busId: string;
    lastUpdated: string;
    currentStopIndex: number;
    isAtStop: boolean;
    routeStops: {
        name: string;
        arrival: string | null;
        departure: string | null;
    }[];
}

export interface ParsedStop {
    stopName: string;
    arrivalTime: string | null;
    departureTime: string;
    fareFromOrigin: number;
    stopOrder?: number;
}
export interface ParsedSchedule {
    id: string;
    busName: string;
    seatLayout: SeatLayout;
    bookingEnabled: boolean;
    stops: ParsedStop[];
}

export interface ParsedBeneficiary {
    govtExamRegistrationNumber: string;
    phone: string;
    fullName: string;
    email?: string;
    dob?: string;
    password?: string;
}

// --- Revenue Analytics Types ---
export interface RevenueByCategory {
  type: 'NORMAL' | 'CHILD' | 'SENIOR';
  bookedTickets: number;
  cancelledTickets: number;
  grossRevenue: number;
  refundedRevenue: number;
  netRevenue: number;
}

interface DetailedMetrics {
    bookedNormalRevenue: number;
    bookedChildRevenue: number;
    bookedSeniorRevenue: number;
    cancelledNormalRevenue: number;
    cancelledChildRevenue: number;
    cancelledSeniorRevenue: number;
    bookedNormalTickets: number;
    bookedChildTickets: number;
    bookedSeniorTickets: number;
    cancelledNormalTickets: number;
    cancelledChildTickets: number;
    cancelledSeniorTickets: number;
}

export interface DetailedDistrictAnalytics extends DetailedMetrics {
    district: string;
}

export interface DetailedRouteAnalytics extends DetailedMetrics {
    route: string;
}

export interface RevenueSummary {
    netRevenue: number;
    grossRevenue: number;
    refundedRevenue: number;
    bookedTickets: number;
    cancelledTickets: number;
}

export interface RevenueAnalyticsData {
    summary: RevenueSummary;
    byCategory: RevenueByCategory[];
    byDistrict: DetailedDistrictAnalytics[];
    byRoute: DetailedRouteAnalytics[];
}