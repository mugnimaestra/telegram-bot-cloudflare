import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  fetchAppointments,
  findEarliestMorningAppointment,
  isValidService,
  getAvailableServices
} from './fetchAppointments';
import { ConsultationSchedule, RSCMError, RSCMErrorType } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchAppointments', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch and parse appointments successfully', async () => {
    const mockResponse = {
      status: "200",
      data: [
        {
          actor: [{ display: "Dr. Test" }],
          consultationDay: {
            start: "08:00",
            end: "12:00",
            quota: "10"
          }
        }
      ]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const result = await fetchAppointments(
      "URJT Geriatri",
      new Date("2025-03-07")
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      doctorName: "Dr. Test",
      startTime: "08:00",
      endTime: "12:00",
      quota: 10,
      date: "2025-03-07"
    });
  });

  it('should handle invalid service', async () => {
    await expect(
      fetchAppointments("Invalid Service", new Date())
    ).rejects.toThrow(RSCMError);
  });

  it('should handle API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    await expect(
      fetchAppointments("URJT Geriatri", new Date())
    ).rejects.toThrow(RSCMError);
  });

  it('should return empty array for no appointments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "404", pesan: "No appointments" })
    });

    const result = await fetchAppointments(
      "URJT Geriatri",
      new Date()
    );

    expect(result).toEqual([]);
  });
});

describe('findEarliestMorningAppointment', () => {
  const schedules: ConsultationSchedule[] = [
    {
      doctorName: "Dr. Late",
      startTime: "13:00",
      endTime: "16:00",
      quota: 5,
      date: "2025-03-07"
    },
    {
      doctorName: "Dr. Early",
      startTime: "07:30",
      endTime: "11:30",
      quota: 8,
      date: "2025-03-07"
    },
    {
      doctorName: "Dr. Earlier",
      startTime: "07:30",
      endTime: "11:30",
      quota: 8,
      date: "2025-03-06"
    }
  ];

  it('should find earliest morning appointment', () => {
    const result = findEarliestMorningAppointment(schedules);
    expect(result).toBeDefined();
    expect(result?.doctorName).toBe("Dr. Earlier");
    expect(result?.date).toBe("2025-03-06");
  });

  it('should return undefined if no morning appointments', () => {
    const lateSchedules: ConsultationSchedule[] = [
      {
        doctorName: "Dr. Late",
        startTime: "13:00",
        endTime: "16:00",
        quota: 5,
        date: "2025-03-07"
      }
    ];

    const result = findEarliestMorningAppointment(lateSchedules);
    expect(result).toBeUndefined();
  });
});

describe('service validation', () => {
  it('should validate existing service', () => {
    expect(isValidService("URJT Geriatri")).toBe(true);
    expect(isValidService("Invalid Service")).toBe(false);
  });

  it('should list available services', () => {
    const services = getAvailableServices();
    expect(services).toContain("URJT Geriatri");
    expect(services).toContain("IPKT Jantung");
  });
});