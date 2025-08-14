import type { User, Schedule, BusLocation, SeatBookingInfo, UserBooking, PassCard, ParsedBeneficiary, SeatLayout, ParsedStop, ParsedSchedule, RevenueAnalyticsData } from '@/types';

const API_BASE_URL = 'https://government-bus.onrender.com/api';
// Add default headers for ngrok or other proxies if required
const NGROK_HEADERS: Record<string, string> = {
    'ngrok-skip-browser-warning': '1',
};
function getAuthToken(): string | null {
    const storedSession = localStorage.getItem('session');
    if (!storedSession) return null;

    try {
        const session = JSON.parse(storedSession);

        if (session?.token && session.expiry > Date.now()) {
            return session.token;
        }
    } catch {
        // ignore JSON parse errors
    }
    return null;
}
/**
 * Handle API responses consistently.
 * Throws an error if the response is not ok.
 */

async function handleResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    if (!response.ok) {
        let errorMessage: string;
        try {
            const errorBody = await response.json();
            errorMessage = errorBody.message || `Unknown API error (status ${response.status})`;






        } catch {
            errorMessage = `Request failed with status: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }


    if (contentType?.includes('application/json')) {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }

    return response.text() as unknown as T;
}
/**
 * Wrapper for fetch that adds headers and handles responses.
 */

async function apiFetch<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> || {}),
        ...NGROK_HEADERS,
        ...(token ? { 'X-Auth-Token': token } : {}),
    };

    const response = await fetch(input, { ...init, headers });
    return handleResponse<T>(response);
}
type RegistrationData = Omit<User, 'id' | 'role'> & { password: string; };

export const api = {
    // --- General ---
    getDistricts: (): Promise<string[]> => apiFetch(`${API_BASE_URL}/districts`),

    login: (phone: string, password_val: string): Promise<{ token: string; user: User; } | null> => apiFetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: password_val }),
    }),


    sendOtp: (phone: string): Promise<{ message: string; otp: string; }> => apiFetch(`${API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
    }),


    verifyOtp: (phone: string, otp: string): Promise<{ token: string; user: User; } | null> => apiFetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
    }),

    register: (data: RegistrationData): Promise<User> => apiFetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),

    getSchedulesByDistrict: (district: string): Promise<Schedule[]> => apiFetch(`${API_BASE_URL}/schedules/district/${encodeURIComponent(district)}`),




    getSchedulesByRoute: (origin: string, destination: string): Promise<Schedule[]> => {
        const params = new URLSearchParams({ origin, destination });
        return apiFetch(`${API_BASE_URL}/schedules/route?${params.toString()}`);
    },

    getScheduleById: (id: string): Promise<Schedule | null> => apiFetch(`${API_BASE_URL}/schedules/${encodeURIComponent(id)}`),

    getBookedSeatsForSchedule: (scheduleId: string): Promise<string[]> => apiFetch(`${API_BASE_URL}/bookings/seats/${encodeURIComponent(scheduleId)}`),

    trackBus: (busId: string): Promise<BusLocation | null> => apiFetch(`${API_BASE_URL}/tracking/${encodeURIComponent(busId)}`),

    bookSeats: (
        scheduleId: string,
        seats: SeatBookingInfo[],
        origin: string,
        destination: string
    ): Promise<{ bookingId: string; }> => apiFetch(`${API_BASE_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId, seats, origin, destination }),
    }),


    bookFreeSeats: (
        scheduleId: string,
        seatIds: string[],
        origin: string,
        destination: string,
        registrationNumber: string,
        phone: string
    ): Promise<{ bookingId: string; }> => apiFetch(`${API_BASE_URL}/bookings/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId, seatIds, origin, destination, registrationNumber, phone }),
    }),

    getUserBookings: (userId: string): Promise<UserBooking[]> => apiFetch(`${API_BASE_URL}/bookings/user/${encodeURIComponent(userId)}`),

    getPassCardForUser: (userId: string): Promise<PassCard | null> => apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/pass-card`),

    // --- Admin ---
    getSetting: (key: string): Promise<{ key: string; value: string; }> => apiFetch(`${API_BASE_URL}/settings/${key}`),

    updateSetting: (key: string, value: boolean | number | string): Promise<void> => apiFetch(`${API_BASE_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: String(value) }),
    }),


    getDiscountedDistricts: (): Promise<string[]> => apiFetch(`${API_BASE_URL}/discounts/districts`),

    updateDiscountedDistricts: (districts: string[]): Promise<void> => apiFetch(`${API_BASE_URL}/discounts/districts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ districts }),
    }),


    getUsers: (): Promise<User[]> => apiFetch(`${API_BASE_URL}/users`),

    bulkCreateBeneficiaries: (beneficiaries: ParsedBeneficiary[]): Promise<{ message: string; created: number; updated: number; skipped: number; }> => apiFetch(`${API_BASE_URL}/users/bulk-beneficiaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaries }),
    }),

    createSubAdmin: (data: Partial<User>): Promise<User> => apiFetch(`${API_BASE_URL}/users/subadmin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),

    adminUpdateUser: (userId: string, data: Partial<User>): Promise<User> => apiFetch(`${API_BASE_URL}/users/admin/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),

    updateSubAdmin: (userId: string, data: Partial<User>): Promise<User> => apiFetch(`${API_BASE_URL}/users/subadmin/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),

    deleteUser: (userId: string): Promise<void> => apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
    }),

    updateUserProfile: (userId: string, data: Partial<User>): Promise<User> => apiFetch(`${API_BASE_URL}/users/profile/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),


    getAllSchedules: (): Promise<Schedule[]> => apiFetch(`${API_BASE_URL}/schedules`),

    updateSchedule: (scheduleId: string, data: { busName: string; seatLayout: SeatLayout; bookingEnabled: boolean; stops: ParsedStop[]; }): Promise<Schedule> => apiFetch(`${API_BASE_URL}/schedules/${encodeURIComponent(scheduleId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),

    batchUploadSchedules: (schedules: ParsedSchedule[]): Promise<{ message: string; }> => apiFetch(`${API_BASE_URL}/schedules/batch-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules }),
    }),


    getRevenueAnalytics: (): Promise<RevenueAnalyticsData> => apiFetch(`${API_BASE_URL}/analytics/revenue`),
};
