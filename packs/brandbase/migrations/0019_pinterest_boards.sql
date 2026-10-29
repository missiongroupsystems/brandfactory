-- A brand's moodboard reads several Pinterest boards: details.boards, a list of board ids, in
-- place of 0015's one details.board. Pinterest is connected while the list is not empty. The old
-- key still counts: between this migration and the promote, 1.10.0's account.board is live and
-- writes only that key. 1.11.0's account.board always removes it.
CREATE OR REPLACE FUNCTION brandbase.account_keys(platform text, details jsonb)
  RETURNS TABLE (key text, linked boolean)
  LANGUAGE sql STABLE
  AS 'SELECT x.key, x.linked FROM (VALUES
    (''pinterest'', ''pinterest'',
      coalesce(jsonb_array_length(details -> ''boards''), 0) > 0 OR details ->> ''board'' IS NOT NULL)
  ) AS x (platform, key, linked) WHERE x.platform = account_keys.platform';

-- The board picked before this version becomes the list's one board. The old key stays until the
-- next pick, so a server still on the old code reads that board until the core is deployed. The
-- connection keeps its status: one board before is one board now. The forced row rules hold the
-- table's owner too, so they are lifted for this statement and forced again (as in 0013 and 0015).
ALTER TABLE brandbase.accounts NO FORCE ROW LEVEL SECURITY;
UPDATE brandbase.accounts
  SET details = details || jsonb_build_object('boards', jsonb_build_array(details ->> 'board'))
  WHERE platform = 'pinterest' AND details ->> 'board' IS NOT NULL AND NOT details ? 'boards';
ALTER TABLE brandbase.accounts FORCE ROW LEVEL SECURITY;
