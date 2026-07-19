# doorbell 

Cloud-native, open-source, anonymous pageview analytics engine that runs entirely server-side inside the Supabase ecosystem for exactly $0 per month.

Core Features:
- True Zero-JS Integration: On the client side, registration is entirely handled by a standard, non-blocking 1x1 transparent `<img>` tag in your HTML footer. It fails silently without touching your UI application thread.
- Strict Privacy-First (GDPR-Exempt): By design, the engine immediately drops visitor IP addresses, user-agent details, and session fingerprint hashes. It logs only flat, strictly anonymous vectors (`page_path`, `referrer_host`, `country_code`, `device_type`, `hit_date`).
No cookie popups required.
- Sub-Millisecond Execution: Built on Supabase Edge Functions (Deno). Utilizing `EdgeRuntime.waitUntil()`, the function decouples execution paths - returning the pixel immediately to the browser while logging the payload asynchronously in the background.
- Zero Infrastructure Overhead: Deploys completely within the Supabase free tier limits. It uses system-reserved variables out of the box, requiring zero external security tokens, credentials, or third-party API dependencies.

Whether you are running a minimalist developer portfolio, a static documentation hub, or a lightweight landing page, `doorbell` gives you directional heatmaps without the bloat.
