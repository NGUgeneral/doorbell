-- supabase service table configuration
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