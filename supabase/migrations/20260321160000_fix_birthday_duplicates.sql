-- Remove duplicate birthdays: keep only the oldest entry per member_id
DELETE FROM public.birthdays
WHERE id NOT IN (
  SELECT DISTINCT ON (member_id) id
  FROM public.birthdays
  WHERE member_id IS NOT NULL
  ORDER BY member_id, created_at ASC
)
AND member_id IS NOT NULL;

-- Add unique constraint to prevent future duplicates
ALTER TABLE public.birthdays
  ADD CONSTRAINT birthdays_member_id_unique UNIQUE (member_id);
