import { describe, expect, it, vi } from "vitest";
import { isTransientSqlError, retryOnTransientSqlError } from "./azureSqlRetry";

describe("isTransientSqlError", () => {
  it("recognizes a known Azure SQL transient error number", () => {
    expect(isTransientSqlError({ number: 40613 })).toBe(true);
  });

  it("recognizes a transient number nested in originalError.info (tedious shape)", () => {
    expect(isTransientSqlError({ originalError: { info: { number: 4060 } } })).toBe(true);
  });

  it("recognizes a transient connection error code", () => {
    expect(isTransientSqlError({ code: "ETIMEDOUT" })).toBe(true);
  });

  it("does not flag an unrelated error", () => {
    expect(isTransientSqlError({ number: 2627 })).toBe(false); // e.g. unique constraint violation
    expect(isTransientSqlError(new Error("boom"))).toBe(false);
  });
});

describe("retryOnTransientSqlError", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryOnTransientSqlError(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors and eventually succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ number: 40613 })
      .mockRejectedValueOnce({ number: 40613 })
      .mockResolvedValue("ok");

    await expect(retryOnTransientSqlError(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-transient error", async () => {
    const fn = vi.fn().mockRejectedValue({ number: 2627 });
    await expect(retryOnTransientSqlError(fn, { baseDelayMs: 1 })).rejects.toEqual({ number: 2627 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured number of attempts", async () => {
    const fn = vi.fn().mockRejectedValue({ number: 40613 });
    await expect(retryOnTransientSqlError(fn, { attempts: 2, baseDelayMs: 1 })).rejects.toEqual({
      number: 40613,
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
