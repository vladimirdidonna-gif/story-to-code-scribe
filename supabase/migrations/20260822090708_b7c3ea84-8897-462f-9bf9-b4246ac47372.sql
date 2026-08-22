CREATE TABLE public.registro_dati (
  user_id UUID NOT NULL,
  k TEXT NOT NULL,
  v TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, k)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registro_dati TO authenticated;
GRANT ALL ON public.registro_dati TO service_role;
ALTER TABLE public.registro_dati ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Utenti gestiscono i propri dati" ON public.registro_dati FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.registro_condiviso (
  k TEXT NOT NULL PRIMARY KEY,
  v TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registro_condiviso TO authenticated;
GRANT ALL ON public.registro_condiviso TO service_role;
ALTER TABLE public.registro_condiviso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesso condiviso per utenti autenticati" ON public.registro_condiviso FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.registro_dati REPLICA IDENTITY FULL;
ALTER TABLE public.registro_condiviso REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.registro_dati;
ALTER PUBLICATION supabase_realtime ADD TABLE public.registro_condiviso;