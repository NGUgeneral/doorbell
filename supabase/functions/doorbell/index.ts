import { createClient } from "@supabase/supabase-js"
import postgres from "postgres"

const PIXEL_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

interface EdgeDeploymentContext {
  EdgeRuntime?: {
    waitUntil: (promise: Promise<unknown>) => void;
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
const sql = postgres(dbUrl);

Deno.serve(async (req: Request) => {
  const pixelResponse = new Response(PIXEL_BYTES, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
    },
  });

  try {
    const clientIp = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip");
    let countryCode = "XX";

    if (clientIp && clientIp !== "127.0.0.1" && clientIp !== "::1") {
      try {
        const result = await sql`
          SELECT country_code 
          FROM public.geoip_country_blocks 
          WHERE network >> ${clientIp}::inet 
          LIMIT 1
        `;

        if (result && result.length > 0) {
          countryCode = result[0].country_code.trim();
        }
      } catch (geoErr) {
        console.error("[GeoIP Exception]:", geoErr);
      }
    }

    const url = new URL(req.url);
    let pagePath = url.searchParams.get("path");
    const refererHeader = req.headers.get("referer") || "";

    if (!pagePath) {
      pagePath = refererHeader ? new URL(refererHeader).pathname : "Direct";
    }

    const userAgent = req.headers.get("user-agent") || "";
    const deviceType = /Mobi|Android|iPhone/i.test(userAgent) ? "Mobile" : "Desktop";
    const isBot = /bot|crawler|spider|copt|mediapartners/i.test(userAgent);
    
    let referrerHost = isBot ? "Bot" : "Direct";
    if (!isBot && refererHeader) {
      try {
        const parsedHost = new URL(refererHeader).hostname;
        referrerHost = (parsedHost === "iegor.dev" || parsedHost === "localhost") ? "Direct" : parsedHost;
      } catch {
        referrerHost = "Malformed";
      }
    }

    const saveAnalyticsTask = (async () => {
      await supabaseClient.from("doorbell_pageviews").insert([{
        page_path: pagePath,
        country_code: countryCode,
        device_type: deviceType,
        referrer_host: referrerHost,
        hit_date: new Date().toISOString(),
      }]);
    })();

    const environmentContext = globalThis as unknown as EdgeDeploymentContext;
    if (environmentContext.EdgeRuntime && typeof environmentContext.EdgeRuntime.waitUntil === "function") {
      environmentContext.EdgeRuntime.waitUntil(saveAnalyticsTask);
    } else {
      await saveAnalyticsTask;
    }

    return pixelResponse;

  } catch (err) {
    console.error("Tracker Ingestion Fault:", err);
    return pixelResponse;
  }
});