import { vi } from 'vitest';
import { 
  ConsultationSchedule, 
  RSCMError, 
  RSCMErrorType 
} from '../../types';

const MOCK_SCHEDULES: Record<string, ConsultationSchedule[]> = {
  "URJT Geriatri": [
    {
      doctorName: "Dr. Mock Geriatri",
      startTime: "08:00",
      endTime: "12:00",
      quota: 10,
      date: "2025-03-07"
    },
    {
      doctorName: "Dr. Mock Geriatri 2",
      startTime: "13:00",
      endTime: "16:00",
      quota: 5,
      date: "2025-03-07"
    }
  ],
  "IPKT Jantung": [
    {
      doctorName: "Dr. Mock Kardiolog",
      startTime: "07:30",
      endTime: "11:30",
      quota: 8,
      date: "2025-03-07"
    }
  ]
};

// Export with both original and mock names for compatibility
export const fetchAppointments = vi.fn(async (
  service: string,
  date: Date
): Promise<ConsultationSchedule[]> => {
  if (!(service in MOCK_SCHEDULES)) {
    throw new RSCMError(
      RSCMErrorType.INVALID_SERVICE,
      `Invalid service: ${service}`
    );
  }

  return MOCK_SCHEDULES[service];
});

export const isValidService = vi.fn((service: string): boolean => {
  return service in MOCK_SCHEDULES;
});

export const getAvailableServices = vi.fn((): string[] => {
  return Object.keys(MOCK_SCHEDULES);
});

// Also export mock-prefixed versions for explicit mock usage
export const mockFetchAppointments = fetchAppointments;
export const mockIsValidService = isValidService;
export const mockGetAvailableServices = getAvailableServices;

// Re-export the findEarliestMorningAppointment function as-is since it's pure logic
export { findEarliestMorningAppointment } from '../fetchAppointments';