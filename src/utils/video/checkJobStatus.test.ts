import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkJobStatus } from "./checkJobStatus";
import nock from "@/utils/test/nock";
import _nock from "nock";
import { logger } from "@/utils/logger";

// Mock logger
vi.mock("@/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockedLogger = vi.mocked(logger);

describe("checkJobStatus", () => {
  const serviceUrl = "https://test-video-service.com";
  const jobId = "test-job-123";

  beforeEach(() => {
    _nock.cleanAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _nock.cleanAll();
  });

  it("should successfully check job status", async () => {
    const mockJobStatus = {
      id: jobId,
      status: "completed" as const,
      progress: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: {
        recipe: {
          title: "Test Recipe",
          ingredients: [{ item: "test ingredient" }],
          instructions: [{ step: 1, description: "Test step" }],
        },
      },
    };

    const scope = nock(serviceUrl)
      .get(`/status/${jobId}`)
      .matchHeader("content-type", "application/json")
      .reply(200, mockJobStatus);

    const result = await checkJobStatus(serviceUrl, jobId);

    expect(result.success).toBe(true);
    expect(result.job).toEqual(mockJobStatus);
    expect(mockedLogger.info).toHaveBeenCalledWith(
      "Job status retrieved successfully",
      expect.objectContaining({
        jobId,
        status: "completed",
        progress: 100,
      })
    );
  });

  it("should handle 404 error with 'Job not found' message", async () => {
    const scope = nock(serviceUrl)
      .get(`/status/${jobId}`)
      .matchHeader("content-type", "application/json")
      .reply(404, { error: "Job not found" });

    const result = await checkJobStatus(serviceUrl, jobId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Job not found");
  });

  it("should handle other HTTP errors", async () => {
    const scope = nock(serviceUrl)
      .get(`/status/${jobId}`)
      .matchHeader("content-type", "application/json")
      .reply(500, { error: "Internal server error" });

    const result = await checkJobStatus(serviceUrl, jobId);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Service returned 500: ");
  });

  it("should handle network errors", async () => {
    const scope = nock(serviceUrl)
      .get(`/status/${jobId}`)
      .matchHeader("content-type", "application/json")
      .replyWithError("Network error");

    const result = await checkJobStatus(serviceUrl, jobId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
    expect(mockedLogger.error).toHaveBeenCalledWith(
      "Failed to check job status",
      expect.objectContaining({
        error: expect.stringContaining("Network error"),
        serviceUrl,
        jobId,
      })
    );
  });
});