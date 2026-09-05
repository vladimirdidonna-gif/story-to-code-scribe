-- Rubrica docenti (per trovare un collega dalla sua email)
CREATE TABLE public.docenti_rubrica (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  nome text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX docenti_rubrica_email_idx ON public.docenti_rubrica (lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.docenti_rubrica TO authenticated;
GRANT ALL ON public.docenti_rubrica TO service_role;
ALTER TABLE public.docenti_rubrica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rubrica propria" ON public.docenti_rubrica FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Inviti / collegamenti tra docenti su una classe
CREATE TABLE public.condivisioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mittente_id uuid NOT NULL,
  mittente_email text NOT NULL,
  destinatario_email text NOT NULL,
  destinatario_id uuid,
  classe text NOT NULL,
  studenti jsonb NOT NULL DEFAULT '[]'::jsonb,
  stato text NOT NULL DEFAULT 'in_attesa',
  messaggio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX condivisioni_dest_idx ON public.condivisioni (lower(destinatario_email));
CREATE INDEX condivisioni_mitt_idx ON public.condivisioni (mittente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.condivisioni TO authenticated;
GRANT ALL ON public.condivisioni TO service_role;
ALTER TABLE public.condivisioni ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mia_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$ SELECT lower(email) FROM auth.users WHERE id = auth.uid() $$;

CREATE POLICY "condivisioni visibili ai due docenti" ON public.condivisioni FOR SELECT TO authenticated
  USING (mittente_id = auth.uid() OR destinatario_id = auth.uid() OR lower(destinatario_email) = public.mia_email());
CREATE POLICY "invita" ON public.condivisioni FOR INSERT TO authenticated
  WITH CHECK (mittente_id = auth.uid());
CREATE POLICY "aggiorna" ON public.condivisioni FOR UPDATE TO authenticated
  USING (mittente_id = auth.uid() OR destinatario_id = auth.uid() OR lower(destinatario_email) = public.mia_email())
  WITH CHECK (mittente_id = auth.uid() OR destinatario_id = auth.uid() OR lower(destinatario_email) = public.mia_email());
CREATE POLICY "elimina" ON public.condivisioni FOR DELETE TO authenticated
  USING (mittente_id = auth.uid() OR destinatario_id = auth.uid() OR lower(destinatario_email) = public.mia_email());

-- Dati di classe pubblicati da ogni docente per i colleghi collegati
CREATE TABLE public.condivisione_dati (
  owner_id uuid NOT NULL,
  owner_nome text,
  classe text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, classe)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.condivisione_dati TO authenticated;
GRANT ALL ON public.condivisione_dati TO service_role;
ALTER TABLE public.condivisione_dati ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ha_condivisione(_owner uuid, _classe text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.condivisioni c
    WHERE c.stato = 'attiva' AND c.classe = _classe
      AND ((c.mittente_id = _owner AND c.destinatario_id = auth.uid())
        OR (c.destinatario_id = _owner AND c.mittente_id = auth.uid()))
  )
$$;

CREATE POLICY "dati propri" ON public.condivisione_dati FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "dati dei colleghi collegati" ON public.condivisione_dati FOR SELECT TO authenticated
  USING (public.ha_condivisione(owner_id, classe));

ALTER PUBLICATION supabase_realtime ADD TABLE public.condivisioni;
ALTER PUBLICATION supabase_realtime ADD TABLE public.condivisione_dati;