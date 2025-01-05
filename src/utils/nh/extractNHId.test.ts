import { describe, it, expect } from "vitest";
import { extractNHId } from "./extractNHId";

describe("extractNHId", () => {
  it.each`
    input                                    | expected
    ${"https://nhentai.net/g/547949/"}       | ${"547949"}
    ${"https://nhentai.net/g/547949"}        | ${"547949"}
    ${"#547949"}                             | ${"547949"}
    ${"547949"}                              | ${"547949"}
    ${""}                                    | ${null}
    ${"https://nhentai.net/invalid/547949/"} | ${null}
    ${"abc123"}                              | ${null}
    ${"https://nhentai.net/g/547949?page=1"} | ${"547949"}
  `('extractNHId("$input") -> $expected', ({ input, expected }) => {
    expect(extractNHId(input)).toBe(expected);
  });
});
