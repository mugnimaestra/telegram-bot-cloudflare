import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetcher } from "./fetcher";
import nock from "@/utils/test/nock";
import _nock from "nock";

describe("fetcher", () => {
  const baseUrl = "https://api.example.com";
  const endpoint = "/test-endpoint";

  beforeEach(() => {
    _nock.cleanAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _nock.cleanAll();
  });

  it("should successfully fetch data", async () => {
    const mockResponse = { data: "test data" };
    const scope = nock(baseUrl)
      .get(endpoint)
      .matchHeader("content-type", "application/json")
      .reply(200, mockResponse);

    const result = await fetcher<{ data: string }>({
      method: "GET",
      url: endpoint,
      baseUrl,
    });

    expect(result).toEqual(mockResponse);
  });

  it("should handle 404 error with 'Job not found' message", async () => {
    const scope = nock(baseUrl)
      .get(endpoint)
      .matchHeader("content-type", "application/json")
      .reply(404, { error: "Not found" });

    await expect(
      fetcher({
        method: "GET",
        url: endpoint,
        baseUrl,
      })
    ).rejects.toThrow("Job not found");
  });

  it("should handle other HTTP errors", async () => {
    const scope = nock(baseUrl)
      .get(endpoint)
      .matchHeader("content-type", "application/json")
      .reply(500, { error: "Internal server error" });

    await expect(
      fetcher({
        method: "GET",
        url: endpoint,
        baseUrl,
      })
    ).rejects.toThrow("HTTP error! status: 500");
  });

  it("should handle POST requests with body", async () => {
    const mockRequestBody = { key: "value" };
    const mockResponse = { success: true };
    
    const scope = nock(baseUrl)
      .post(endpoint, mockRequestBody)
      .matchHeader("content-type", "application/json")
      .reply(200, mockResponse);

    const result = await fetcher<{ success: boolean }>({
      method: "POST",
      url: endpoint,
      baseUrl,
      body: mockRequestBody,
    });

    expect(result).toEqual(mockResponse);
  });

  it("should handle custom headers", async () => {
    const mockResponse = { data: "test data" };
    const customHeaders = { "Authorization": "Bearer token" };
    
    const scope = nock(baseUrl)
      .get(endpoint)
      .matchHeader("content-type", "application/json")
      .reply(200, mockResponse);

    const result = await fetcher<{ data: string }>({
      method: "GET",
      url: endpoint,
      baseUrl,
      headers: customHeaders,
    });

    expect(result).toEqual(mockResponse);
  });

  it("should handle network errors", async () => {
    const scope = nock(baseUrl)
      .get(endpoint)
      .matchHeader("content-type", "application/json")
      .replyWithError("Network error");

    await expect(
      fetcher({
        method: "GET",
        url: endpoint,
        baseUrl,
      })
    ).rejects.toThrow("Network error");
  });
});