import { describe, expect, it } from "vitest";
import { parseSqlServerUrl } from "./connectionString";

describe("parseSqlServerUrl", () => {
  it("parses an Azure SQL Database connection string", () => {
    const config = parseSqlServerUrl(
      "sqlserver://myserver.database.windows.net:1433;database=mydb;user=myuser;password=mypass;encrypt=true;trustServerCertificate=false"
    );
    expect(config).toEqual({
      server: "myserver.database.windows.net",
      port: 1433,
      database: "mydb",
      user: "myuser",
      password: "mypass",
      options: { encrypt: true, trustServerCertificate: false },
    });
  });

  it("defaults port to 1433 when omitted", () => {
    const config = parseSqlServerUrl(
      "sqlserver://localhost;database=mydb;user=sa;password=pwd;trustServerCertificate=true"
    );
    expect(config.port).toBe(1433);
    expect(config.options?.trustServerCertificate).toBe(true);
  });

  it("defaults encrypt to true when omitted (Azure requires it)", () => {
    const config = parseSqlServerUrl("sqlserver://localhost:1433;database=mydb;user=sa;password=pwd");
    expect(config.options?.encrypt).toBe(true);
  });

  it("throws on a missing database", () => {
    expect(() => parseSqlServerUrl("sqlserver://localhost:1433;user=sa;password=pwd")).toThrow(/database/);
  });

  it("throws on a missing user", () => {
    expect(() => parseSqlServerUrl("sqlserver://localhost:1433;database=mydb;password=pwd")).toThrow(/user/);
  });

  it("throws on a missing password", () => {
    expect(() => parseSqlServerUrl("sqlserver://localhost:1433;database=mydb;user=sa")).toThrow(/password/);
  });
});
