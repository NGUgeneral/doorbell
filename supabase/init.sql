-- supabase pgsql doorbell_oageviews table
CREATE TABLE public.doorbell_pageviews (
    id BIGSERIAL PRIMARY KEY,
    page_path TEXT NOT NULL,
    referrer_host TEXT NOT NULL,
    country_code TEXT NOT NULL,
    device_type TEXT NOT NULL,
    hit_date TIMESTAMP NOT NULL
);

ALTER TABLE public.doorbell_pageviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role inserts" 
ON public.doorbell_pageviews 
FOR INSERT 
TO service_role 
WITH CHECK (true);

-- supabase pgsql geoip_country_blocks table

create table public.geoip_country_blocks (
  network cidr not null,
  country_code char(2) not null
);

-- Explicitly pass the inet_ops modifier directly to the column definition
create index geoip_country_blocks_network_idx on public.geoip_country_blocks using gist (network inet_ops);

-- Expose it to your service role key (Edge Functions bypass row-level checks by default, but let's be explicitly secure)
alter table public.geoip_country_blocks enable row level security;
