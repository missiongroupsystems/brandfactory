-- brandbase 1.14.0: each brand's own locations, which a post's Location offers. A list of labels
-- ("Casa Vostra, JEM") in the order they were added, each once whatever its case. Every member of
-- the brand's company adds and drops them (brand.location_add, brand.location_drop), under the
-- brand's update rule. Each statement can run again: the column and the grant stay as they are,
-- and the seed fills only a brand with no locations yet.
ALTER TABLE brandbase.brands ADD COLUMN IF NOT EXISTS locations text[] NOT NULL DEFAULT '{}';
GRANT UPDATE (locations) ON brandbase.brands TO pack_runtime;

-- The brands imported from their own accounts (import/accounts.json) start with the venues they
-- are known to have. A brand not on this database is skipped. The forced row rules hold the
-- table's owner too, so they are lifted for this statement and forced again (as in 0019).
ALTER TABLE brandbase.brands NO FORCE ROW LEVEL SECURITY;
UPDATE brandbase.brands b SET locations = s.locations
  FROM (VALUES
    ('casa-vostra', ARRAY['Casa Vostra, Raffles City', 'Casa Vostra, JEM', 'Casa Vostra, Tampines Mall']),
    ('chin-mee-chin', ARRAY['Chin Mee Chin, Katong', 'Chin Mee Chin, NEX']),
    ('temper', ARRAY['Temper, Duxton']),
    ('petra', ARRAY['Petra, Dempsey Hill']),
    ('firebird', ARRAY['Firebird, Duxton']),
    ('willow', ARRAY['Willow, Hongkong Street'])
  ) AS s (id, locations)
  WHERE b.id = s.id AND b.locations = '{}';
ALTER TABLE brandbase.brands FORCE ROW LEVEL SECURITY;
