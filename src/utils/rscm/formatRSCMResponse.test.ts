import { describe, it, expect } from 'vitest';
import { 
  formatRSCMResponse, 
  formatRSCMError,
  formatRSCMHelp 
} from './formatRSCMResponse';
import { AppointmentResult, ConsultationSchedule, RSCMError } from './types';

describe('formatRSCMResponse', () => {
  const mockSchedule: ConsultationSchedule = {
    doctorName: "Dr. Test",
    startTime: "08:00",
    endTime: "12:00",
    quota: 10,
    date: "2025-03-07"
  };

  const mockEarlySchedule: ConsultationSchedule = {
    doctorName: "Dr. Early",
    startTime: "07:30",
    endTime: "11:30",
    quota: 8,
    date: "2025-03-06"
  };

  it('should format response with available appointments', () => {
    const result: AppointmentResult = {
      schedules: [mockSchedule],
      earliestMorning: mockEarlySchedule,
      service: "URJT Geriatri",
      date: "2025-03-07"
    };

    const formatted = formatRSCMResponse(result);

    // Check header
    expect(formatted).toContain('🏥 *RSCM Appointment Checker*');
    expect(formatted).toContain('Service: URJT Geriatri');
    
    // Check appointments
    expect(formatted).toContain('📋 *Available Appointments:*');
    expect(formatted).toContain('👨‍⚕️ *Dr\\. Test*');
    expect(formatted).toContain('🕒 08:00 \\- 12:00');
    expect(formatted).toContain('👥 Quota: 10');

    // Check earliest morning
    expect(formatted).toContain('⭐ *Earliest Morning Appointment:*');
    expect(formatted).toContain('👨‍⚕️ *Dr\\. Early*');
    expect(formatted).toContain('🕒 07:30 \\- 11:30');
  });

  it('should handle no available appointments', () => {
    const result: AppointmentResult = {
      schedules: [],
      service: "URJT Geriatri",
      date: "2025-03-07"
    };

    const formatted = formatRSCMResponse(result);
    expect(formatted).toContain('❌ No appointments available for this date\\.');
  });

  it('should escape special characters in service names and dates', () => {
    const result: AppointmentResult = {
      schedules: [mockSchedule],
      service: "Test.Service-Name",
      date: "2025-03-07"
    };

    const formatted = formatRSCMResponse(result);
    expect(formatted).toContain('Service: Test\\.Service\\-Name');
  });
});

describe('formatRSCMError', () => {
  it('should format error message', () => {
    const error = new RSCMError('API_ERROR' as any, 'Test error message');
    const formatted = formatRSCMError(error);

    expect(formatted).toContain('❌ *Error checking appointments*');
    expect(formatted).toContain('Message: Test error message');
    expect(formatted).toContain('_Please try again later');
  });

  it('should escape special characters in error message', () => {
    const error = new Error('Error.with_special-chars');
    const formatted = formatRSCMError(error);
    expect(formatted).toContain('Error\\.with\\_special\\-chars');
  });
});

describe('formatRSCMHelp', () => {
  it('should format help message with available services', () => {
    const services = ['URJT Geriatri', 'IPKT Jantung'];
    const formatted = formatRSCMHelp(services);

    expect(formatted).toContain('🏥 *RSCM Appointment Checker Help*');
    expect(formatted).toContain('• URJT Geriatri');
    expect(formatted).toContain('• IPKT Jantung');
    expect(formatted).toContain('`/rscm <service_name>`');
  });

  it('should escape special characters in service names', () => {
    const services = ['Test.Service', 'Another-Service'];
    const formatted = formatRSCMHelp(services);
    expect(formatted).toContain('• Test\\.Service');
    expect(formatted).toContain('• Another\\-Service');
  });
});