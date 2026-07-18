import { assertEquals } from "std/assert";
import { spy, stub } from "std/testing/mock";
import { resolvePayloadMetrics, resolveCountryCode, saveAnalyticsRow, supabaseClient, sql } from "./index.ts";

Deno.test({
  name: "Teardown - Close active DB sockets",
  fn: async () => {
    await sql.end();
  },
  sanitizeResources: false,
});

// ==========================================
// 1. METRIC RESOLUTION TESTS (Unit)
// ==========================================

Deno.test("Payload Metrics - Resolves mobile user agents cleanly", () => {
  const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15";
  const { deviceType, referrerHost } = resolvePayloadMetrics(mobileUA, "https://github.com");
  
  assertEquals(deviceType, "Mobile");
  assertEquals(referrerHost, "github.com");
});

Deno.test("Payload Metrics - Identifies crawlers as Bot type", () => {
  const botUA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const { referrerHost } = resolvePayloadMetrics(botUA, "https://github.com");
  
  assertEquals(referrerHost, "Bot");
});

Deno.test("Payload Metrics - Strips domain to Direct for local/self referrers", () => {
  const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const { deviceType, referrerHost } = resolvePayloadMetrics(desktopUA, "https://iegor.dev/projects");
  
  assertEquals(deviceType, "Desktop");
  assertEquals(referrerHost, "Direct");
});

// ==========================================
// 2. DATABASE READ / GEOIP LOOKUP TESTS (Integration)
// ==========================================

Deno.test("Database Read - Successfully resolves mocked IP network block matching", async () => {
  const mockRows = [{ country_code: "NL " }];
  Object.defineProperty(mockRows, "count", { value: 1 });

  // 1. Extract the prototype signature of the pending query object
  const queryProto = Object.getPrototypeOf(sql`SELECT 1`);

  // 2. Use the inferred Parameters type to strongly bind the execution callback arguments
  const thenStub = stub(queryProto, "then", (
    ...args: Parameters<typeof queryProto.then>
  ) => {
    const [onfulfilled, onrejected] = args;
    return Promise.resolve(mockRows).then(
      onfulfilled as Parameters<Promise<typeof mockRows>["then"]>[0],
      onrejected as Parameters<Promise<typeof mockRows>["then"]>[1],
    );
  });

  try {
    const country = await resolveCountryCode("77.248.169.211");
    assertEquals(country, "NL");
  } finally {
    thenStub.restore();
  }
});

// ==========================================
// 3. SHAPE & INSERTION VALIDATION TESTS (Integration)
// ==========================================

Deno.test("Database Write - Shape validation structures rows cleanly without errors", async () => {
  const testPayload = {
    page_path: "/test-automation-route",
    country_code: "TS",
    device_type: "Desktop",
    referrer_host: "AutomatedTestSuite"
  };

  // 1. Create a properly typed spy for the insert operation
  const insertSpy = spy((_payloads: unknown[]) => {
    return Promise.resolve({
      error: null,
      status: 201,
      statusText: "Created",
      data: null,
      count: null,
    });
  });

  // 2. Cast the mock return object
  const clientStub = stub(supabaseClient, "from", (table: string) => {
    assertEquals(table, "doorbell_pageviews");
    return { 
      insert: insertSpy 
    } as unknown as ReturnType<typeof supabaseClient.from>;
  });

  try {
    const { error, status } = await saveAnalyticsRow(testPayload);
    
    assertEquals(error, null);
    assertEquals(status, 201);
    
    // 3. Inspect execution arguments via the typed insertSpy reference
    const executedPayloads = insertSpy.calls[0].args[0] as Record<string, unknown>[];
    assertEquals(executedPayloads[0].page_path, "/test-automation-route");
    assertEquals(executedPayloads[0].country_code, "TS");
    assertEquals(executedPayloads[0].device_type, "Desktop");
    assertEquals(executedPayloads[0].referrer_host, "AutomatedTestSuite");
  } finally {
    clientStub.restore();
  }
});