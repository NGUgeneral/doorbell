import { createClient } from "@supabase/supabase-js"
import { Reader, type CountryResponse } from "maxmind"
import { Buffer } from "node:buffer"

interface FlatCountryResponse {
  country_code?: string;
}

interface EdgeDeploymentContext {
  EdgeRuntime?: {
    waitUntil: (promise: Promise<unknown>) => void;
  };
}

type GeoLookupResponse = CountryResponse & FlatCountryResponse;

const PIXEL_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

let readerPromise: Promise<Reader<GeoLookupResponse>> | null = null;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String(err.message);
  if (typeof err === "string") return err;
  return "An unknown error occurred";
}

function getReader() {
  if (readerPromise) return readerPromise;

  readerPromise = (async () => {
    const { data, error } = await supabaseClient.storage
      .from("assets")
      .download("user-country.mmdb");

    if (error) throw error;

    const arrayBuffer = await data.arrayBuffer();
    return new Reader<GeoLookupResponse>(Buffer.from(new Uint8Array(arrayBuffer)));
  })();

  return readerPromise;
}

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
        const reader = await getReader();
        const geoData = reader.get(clientIp); 
        
        if (geoData) {
          if ("country_code" in geoData && geoData.country_code) {
            countryCode = geoData.country_code;
          } else if ("country" in geoData && geoData.country?.iso_code) {
            countryCode = geoData.country.iso_code;
          }
        }
      } catch (geoErr: unknown) {
        console.error("[GeoIP] Resolution failed:", getErrorMessage(geoErr));
      }
    }

    const url = new URL(req.url);
    let pagePath = url.searchParams.get("path");
    const refererHeader = req.headers.get("referer") || "";

    if (!pagePath) {
      if (refererHeader) {
        try {
          pagePath = new URL(refererHeader).pathname;
        } catch {
          pagePath = "Malformed-Referer";
        }
      } else {
        pagePath = "Direct";
      }
    }

    const userAgent = req.headers.get("user-agent") || "";
    const deviceType = /Mobi|Android|iPhone/i.test(userAgent) ? "Mobile" : "Desktop";
    const isBot = /bot|crawler|spider|copt|mediapartners/i.test(userAgent);
    
    let referrerHost = "Bot";
    if (!isBot && pagePath !== "unknown") {
      referrerHost = "Direct";
      if (refererHeader) {
        try {
          const parsedHost = new URL(refererHeader).hostname;
          referrerHost = (parsedHost === "iegor.dev" || parsedHost === "localhost") ? "Direct" : parsedHost;
        } catch {
          referrerHost = "Malformed";
        }
      }
    }

    const saveAnalyticsTask = (async () => {
      const { error: dbError } = await supabaseClient
        .from("doorbell_pageviews")
        .insert([{
          page_path: pagePath,
          country_code: countryCode,
          device_type: deviceType,
          referrer_host: referrerHost,
          hit_date: new Date().toISOString(),
        }]);

      if (dbError) {
        console.error("DB Write Error:", dbError.message);
      }
    })();

    const environmentContext = globalThis as unknown as EdgeDeploymentContext;

    if (environmentContext.EdgeRuntime && typeof environmentContext.EdgeRuntime.waitUntil === "function") {
      environmentContext.EdgeRuntime.waitUntil(saveAnalyticsTask);
    } else {
      await saveAnalyticsTask;
    }

    return pixelResponse;

  } catch (err: unknown) {
    console.error("Doorbell Ingestion Error:", getErrorMessage(err));
    return pixelResponse;
  }
});