CREATE TABLE public.ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw TEXT NOT NULL,
  efficiency TEXT NOT NULL,
  friction_killer TEXT NOT NULL,
  unit_economics TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.ideas TO service_role;

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: all access goes through passcode-gated server functions using service_role.
CREATE INDEX ideas_created_at_idx ON public.ideas (created_at DESC);