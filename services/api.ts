import type { Schedule, User, BusLocation, UserBooking, RevenueAnalyticsData, ParsedSchedule, ParsedStop, SeatLayout } from '../types';

// This file now uses fetch() to communicate with a backend API.
// The backend is not part of this project, but these functions are wired
// to make calls to endpoints that a real backend would expose based on the provided schema.

const API_BASE_URL = 'https://a750fed00ffc.ngrok-free.app/api'; // Using ngrok URL for AI Studio compatibility

const NGROK_HEADERS = {
  'ngrok-skip-browser-warning': 'true',
};


/**
 * A helper function to handle fetch responses.
 * It checks for ok status and parses JSON, throwing an error for non-ok responses.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  if (!response.ok) {
    let errorMessage;
    try {
      // Try to parse a JSON error body for a more specific message
      const errorBody = await response.json();
      errorMessage = errorBody.message || 'An unknown API error occurred.';
    } catch {
      // Fallback if the error body isn't JSON
      errorMessage = `Request failed with status: ${response.status} ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  // Handle cases where a successful response might not have a body (e.g., 204 No Content)
  if (contentType && contentType.indexOf('application/json') !== -1) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return response.text() as Promise<T>;
}

/**
 * Custom fetch wrapper that adds ngrok-specific headers and handles responses.
 */
async function apiFetch<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
  const headers = {
    ...(init.headers || {}),
    ...NGROK_HEADERS,
  };

  const response = await fetch(input, { ...init, headers });
  return handleResponse<T>(response);
}


// Defines the data structure for registration, which includes a password
type RegistrationData = Omit<User, 'id' | 'role'> & { password: string };

export const api = {
    getDistricts: (): Promise<string[]> => {
        return apiFetch<string[]>(`${API_BASE_URL}/districts`);
    },

    login: (phone: string, password_val: string): Promise<User | null> => {
        return apiFetch<User | null>(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password: password_val }),
        });
    },

    register: (data: RegistrationData): Promise<User> => {
        return apiFetch<User>(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    getSchedulesByDistrict: (district: string): Promise<Schedule[]> => {
        return apiFetch<Schedule[]>(`${API_BASE_URL}/schedules/district/${encodeURIComponent(district)}`);
    },

    getSchedulesByRoute: (origin: string, destination: string): Promise<Schedule[]> => {
        const params = new URLSearchParams({ origin, destination });
        return apiFetch<Schedule[]>(`${API_BASE_URL}/schedules/route?${params.toString()}`);
    },

    getScheduleById: (id: string): Promise<Schedule | null> => {
        return apiFetch<Schedule | null>(`${API_BASE_URL}/schedules/${encodeURIComponent(id)}`);
    },

    getBookedSeatsForSchedule: (scheduleId: string): Promise<string[]> => {
        return apiFetch<string[]>(`${API_BASE_URL}/bookings/seats/${encodeURIComponent(scheduleId)}`);
    },

    trackBus: (busId: string): Promise<BusLocation | null> => {
        return apiFetch<BusLocation | null>(`${API_BASE_URL}/tracking/${encodeURIComponent(busId)}`);
    },

    bookSeats: (userId: string, scheduleId: string, seatIds: string[], origin: string, destination: string, farePerSeat: number): Promise<{ bookingId: string }> => {
        return apiFetch<{ bookingId: string }>(`${API_BASE_URL}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, scheduleId, seatIds, origin, destination, farePerSeat }),
        });
    },

    bookFreeSeats: (userId: string, scheduleId: string, seatIds: string[], origin: string, destination: string, registrationNumber: string, phone: string): Promise<{ bookingId: string }> => {
        return apiFetch<{ bookingId: string }>(`${API_BASE_URL}/bookings/free`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, scheduleId, seatIds, origin, destination, registrationNumber, phone }),
        });
    },

    getUserBookings: (userId: string): Promise<UserBooking[]> => {
        return apiFetch<UserBooking[]>(`${API_BASE_URL}/bookings/user/${encodeURIComponent(userId)}`);
    },
    
    // --- Admin Settings ---
    getSetting: (key: string): Promise<{ key: string, value: boolean }> => {
        return apiFetch<{ key: string, value: boolean }>(`${API_BASE_URL}/settings/${key}`);
    },

    updateSetting: (key: string, value: boolean): Promise<void> => {
        return apiFetch<void>(`${API_BASE_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        });
    },

    // --- Admin User Management ---
    getUsers: (): Promise<User[]> => {
        return apiFetch<User[]>(`${API_BASE_URL}/users`);
    },
    
    createSubAdmin: (data: Partial<User>): Promise<User> => {
        return apiFetch<User>(`${API_BASE_URL}/users/subadmin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    updateSubAdmin: (userId: string, data: Partial<User>): Promise<User> => {
        return apiFetch<User>(`${API_BASE_URL}/users/subadmin/${encodeURIComponent(userId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },

    deleteUser: (userId: string): Promise<void> => {
        return apiFetch<void>(`${API_BASE_URL}/users/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
        });
    },

    // --- Schedule Management ---
    getAllSchedules: (userId?: string): Promise<Schedule[]> => {
        let url = `${API_BASE_URL}/schedules`;
        if (userId) {
            url += `?userId=${encodeURIComponent(userId)}`;
        }
        return apiFetch<Schedule[]>(url);
    },
    
    updateSchedule: (scheduleId: string, data: { busName: string, seatLayout: SeatLayout, bookingEnabled: boolean, stops: ParsedStop[] }, userId: string): Promise<Schedule> => {
        return apiFetch<Schedule>(`${API_BASE_URL}/schedules/${encodeURIComponent(scheduleId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, userId }),
        });
    },
    
    batchUploadSchedules: (schedules: ParsedSchedule[], userId: string): Promise<{ message: string }> => {
        return apiFetch<{ message: string }>(`${API_BASE_URL}/schedules/batch-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedules, userId }),
        });
    },


    // --- Revenue Analytics ---
    getRevenueAnalytics: (userId?: string): Promise<RevenueAnalyticsData> => {
        let url = `${API_BASE_URL}/analytics/revenue`;
        if (userId) {
            url += `?userId=${encodeURIComponent(userId)}`;
        }
        return apiFetch<RevenueAnalyticsData>(url);
    },
};
