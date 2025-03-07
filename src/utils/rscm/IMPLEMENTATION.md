# RSCM Appointment Checker Implementation Plan

## Overview

Migrate Python-based RSCM appointment checker to TypeScript and integrate with the Telegram bot.

## Structure

```
src/utils/rscm/
├── index.ts                    # Main export file
├── handleRSCMCommand.ts        # Command handler
├── handleRSCMCommand.test.ts   # Command handler tests
├── types.ts                    # Type definitions
├── formatRSCMResponse.ts       # Response formatting
├── formatRSCMResponse.test.ts  # Formatting tests
├── dateUtils.ts               # Date manipulation utilities
├── dateUtils.test.ts          # Date utilities tests
├── fetchers/
│   ├── fetchAppointments.ts   # API interaction
│   ├── fetchAppointments.test.ts
│   └── __mocks__/
│       └── fetchAppointments.ts
```

## Implementation Steps

### 1. Core Types (types.ts)

- Define interfaces for configuration
- Define types for API requests/responses
- Define types for appointment data structures

### 2. Date Utilities (dateUtils.ts)

- Generate date ranges (next 2 weeks)
- Handle timezone conversions (UTC+7)
- Filter weekend dates
- Sort and find earliest morning appointments

### 3. API Integration (fetchers/fetchAppointments.ts)

- Implement HTTP POST requests to RSCM API
- Handle response parsing
- Implement error handling
- Set up mocks for testing

### 4. Response Formatting (formatRSCMResponse.ts)

- Format appointment data for Telegram messages
- Implement MarkdownV2 escaping
- Handle empty/error cases
- Include earliest morning appointment highlight

### 5. Command Handler (handleRSCMCommand.ts)

- Parse command arguments
- Validate input parameters
- Call fetcher functions
- Format and send responses

### 6. Tests

- Unit tests for each module
- Integration tests for command handler
- Mock API responses
- Test date handling edge cases

## Key Improvements

### Enhanced Output Format

```
🏥 RSCM Appointment Checker
Service: [Service Name]
Date: YYYY-MM-DD

📋 Available Appointments:
👨‍⚕️ Dr. [Name]
🕒 08:00 - 12:00
👥 Quota: X

⭐ Earliest Morning Appointment:
📅 Date: YYYY-MM-DD
👨‍⚕️ Dr. [Name]
🕒 07:30 - 11:30
```

### Early Morning Detection

- Track appointments starting between 07:30-09:00
- Sort by date and time
- Highlight earliest available slot

### Error Handling

- Network errors
- API response errors
- Invalid command format
- Service availability

## Bot Integration

The module will be integrated as a new command handler:

```typescript
// Example usage
/rscm [service_name]
```

Response will be formatted in MarkdownV2 and include emoji indicators for better readability.
