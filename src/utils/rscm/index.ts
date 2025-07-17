// Main exports for the RSCM module
export { handleRSCMCommand } from "./handleRSCMCommand";

// Core components
export { RSCMClient } from "./client/RSCMClient";
export { AppointmentScheduler } from "./scheduler/AppointmentScheduler";
export { CommandHandler } from "./handlers/CommandHandler";
export { ResponseHandler } from "./handlers/ResponseHandler";

// Configuration and utilities
export { loadConfig } from "./config";
export { logger } from "./logger";

// Types and interfaces
export type {
  RSCMConfig,
  ServiceConfig,
  ConsultationSchedule,
  AppointmentResult,
  RSCMRequestPayload,
  RSCMApiResponse,
  RSCMCommandOptions,
  TelegramContext,
} from "./types";

export {
  RSCMError,
  RSCMErrorType,
} from "./types";

// Client types
export type {
  RSCMClientOptions,
  BatchFetchOptions,
  BatchFetchResult,
} from "./client/types";

// Scheduler types
export type {
  SchedulerConfig,
} from "./scheduler/AppointmentScheduler";

// Date utilities
export {
  generateDateRanges,
  toJakartaTime,
  formatDate,
  isMorningAppointment,
  timeToMinutes,
  compareTimeStrings,
  formatTimeRange,
} from "./dateUtils";

// Legacy exports for backward compatibility
export {
  fetchAppointments,
  findEarliestMorningAppointment,
  isValidService,
  getAvailableServices,
} from "./fetchers/fetchAppointments";

export {
  formatRSCMResponse,
  formatRSCMError,
  formatRSCMHelp,
} from "./formatRSCMResponse";