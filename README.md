# doorbell v1.0

A cloud-native, server-side analytics aggregator built to track your traffic metrics for $0/month entirely within serverless edge runtimes. It operates as a true zero-JS integration on the client side using a simple 1x1 tracking pixel, processing visitor subnets and device layouts entirely in volatile edge memory. By instantly dropping all identifying data, it delivers strictly anonymous, GDPR-compliant heatmaps—meaning your users get total privacy and you get to delete that annoying cookie consent popup.

---

## Development & Local Setup

### Prerequisites
* Deno CLI installed locally
* A Supabase project database connection string

### Running the Test Suite
The testing pipeline utilizes an advanced Deno testing flow to mock the database. Because the `npm:postgres` driver creates a unique callable function proxy for tagged template literals, standard object stubs cannot intercept queries directly. The workaround extracts the internal execution prototype framework from a dummy expression (`Object.getPrototypeOf(sql`SELECT 1`)`) and stubs its underlying `.then` promise resolution method to inject mock data type-safely without utilizing `any`.

To run the tests locally with network isolation and environment mocks, execute the following command in your terminal:

```bash
$env:SUPABASE_URL="http://localhost"; $env:SUPABASE_SERVICE_ROLE_KEY="mock"; $env:SUPABASE_DB_URL="postgresql://mock"; deno test --allow-env --allow-net --no-lock test_index.ts
```

---

## CI/CD & Deployment Strategy

The project utilizes a fully automated continuous integration deployment loop managed via GitHub Actions (`deploy.yml`). The delivery pipeline runs a sequential fail-fast test verification step before authorizing any production deployment.

### The Weekly GeoIP Matrix Sync
Because worldwide subnets change regularly, the repository contains a scheduled workflow that fires a cron task every Wednesday at Midnight UTC:

1. **Upstream Data Ingestion:** Fetches the updated public domain IPv4/IPv6 network data sheets directly from upstream geographic database providers.
2. **Text-Stream Parsing:** Uses Unix streaming utilities (`split` and `awk`) to portion the massive 394k+ dataset matrix into independent, atomic 50,000-line transactional insert statements.
3. **Database Hydration:** Streams chunks sequentially through a direct database connection string, safely clearing platform API gateway payload thresholds (`413 Payload Too Large`).

---

## Technical Architecture Reference

```text
+-------------------------------------------------------------------+
|                              USER                                 |
|-------------------------------------------------------------------|
|                                                                   |
|   [ Client Browser ] (Visitor on your portfolio)                  |
|               |                                                   |
|               | 1. GET request for 1x1 image                      |
|               |    (Headers: x-real-ip, user-agent, referer)      |
|               |                                                   |
+---------------|---------------------------------------------------+
                v
+===================================================================+
|                        SUPABASE PLATFORM                          |
|===================================================================|
|                                                                   |
|  +-------------------------------------------------------------+  |
|  |             Supabase Edge Function ('doorbell')             |  |
|  |-------------------------------------------------------------|  |
|  |  2. Parse path & device type, check for bots.               |  |
|  |  3. Connect directly via 'postgres' driver pooler URL.      |  |
|  |                                                             |  |
|  |  4. Execute GeoIP Query (sql`SELECT...`)                    |  |
|  |        |                                                    |  |
|  |        | (Fast read via GiST index)                         |  |
|  |        v                                                    |  |
|  |  [ Database Read ] ===> Resolves "NL", "US", or "XX"        |  |
|  |        |                                                    |  |
|  |        +===========#= Split Execution Paths ===========+    |  |
|  |                    |                                   |    |  |
|  | (Sync Core Thread) |                (Async Background) |    |  |
|  |                    v                                   |    |  |
|  |          +-------------------+                         v    |  |
|  |          | 5. Return 1x1 PNG |         +-----------------+  |  |
|  |          |    immediately to |         | 6. EdgeRuntime. |  |  |
|  |          |    Client Browser |         |    waitUntil()  |  |  |
|  |          +-------------------+         +--------|--------+  |  |
|  |                                                 |           |  |
|  |                                                 v           |  |
|  |                                        +-----------------+  |  |
|  |                                        | 7. INSERT log   |  |  |
|  |                                        |    row payload  |  |  |
|  |                                        +--------|--------+  |  |
|  +-------------------|-----------------------------|-----------+  |
|                      |                             |              |
|                      |          (Background write) |              |
|                      v                             v              |
|  +-------------------------------------------------------------+  |
|  |                Supabase PostgreSQL Database                 |  |
|  |-------------------------------------------------------------|  |
|  |  [Table: geoip_country_blocks]   [Table: doorbell_pageviews]|  |
|  |  - network (cidr)                - page_path                |  |
|  |  - country_code (bpchar)         - country_code             |  |
|  |                                  - device_type              |  |
|  |                                  - referrer_host            |  |
|  |                                  - hit_date                 |  |
|  +-------------------------------------------------------------+  |
|                      ^                                            |
+======================|============================================+
                       |
                       | 8. TRUNCATE table
                       | 9. Bulk INSERT chunked SQL files
                       |
+-------------------------------------------------------------------+
|               GitHub Actions CI/CD (Deploy + Weekly Cron)         |
|-------------------------------------------------------------------|
|  - cURL: sapics/ip-location-db (IPv4+IPv6 CIDR format)            |
|  - split/awk: Slice 394k rows into 50k-line chunks                |
|  - supabase CLI: Push raw SQL statements to bypass 413 limits     |
+-------------------------------------------------------------------+
```

### Platform Portability Notes
While currently configured to run seamlessly out-of-the-box on the Supabase ecosystem (leveraging system-injected variables like `SUPABASE_DB_URL`), the application layer is entirely decoupled. Because it is written in pure Deno/TypeScript adhering strictly to Web-standard APIs (`fetch`, `Request`, `Response`, `EdgeRuntime`), it can be migrated swiftly onto alternative V8 edge runtime clouds such as Cloudflare Workers or Vercel Edge with minor driver adjustments.