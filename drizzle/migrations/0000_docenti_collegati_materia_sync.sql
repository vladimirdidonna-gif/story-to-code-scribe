ALTER TABLE public.condivisioni ADD COLUMN IF NOT EXISTS materia text;
ALTER TABLE public.condivisioni ADD COLUMN IF NOT EXISTS sync_attiva boolean NOT NULL DEFAULT false;
UPDATE public.condivisioni SET sync_attiva = true WHERE stato = 'attiva';

CREATE OR REPLACE FUNCTION public.cerca_docente(_email text)
RETURNS TABLE(user_id uuid, nome text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.user_id, r.nome, r.email
  FROM public.docenti_rubrica r
  WHERE lower(r.email) = lower(trim(_email))
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.cerca_docente(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ha_condivisione(_owner uuid, _classe text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.condivisioni c
    WHERE c.stato = 'attiva'
      AND c.sync_attiva = true
      AND c.classe = _classe
      AND (c.mittente_id = auth.uid() OR c.destinatario_id = auth.uid())
      AND (c.mittente_id = _owner OR c.destinatario_id = _owner)
  )
$$;