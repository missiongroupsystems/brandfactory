-- brandbase 1.14.0: each brand's own collaborators, per platform, which a post's Collaborators
-- offers. An object of lists by platform ("ig", "tt", "fb"): handles ("@name") on Instagram and
-- TikTok, Page names on Facebook, in the order they were added, each once whatever its case. Every member of the
-- brand's company adds and drops them (brand.collaborator_add, brand.collaborator_drop), under the
-- brand's update rule. Each statement can run again: the column and the grant stay as they are,
-- and the seed fills only a brand with no collaborators yet.
ALTER TABLE brandbase.brands ADD COLUMN IF NOT EXISTS collaborators jsonb NOT NULL DEFAULT '{}';
GRANT UPDATE (collaborators) ON brandbase.brands TO pack_runtime;

-- The brands imported from their own accounts (import/accounts.json) start with the accounts they
-- were seen working with (Instagram Collab posts, the group and its chefs, creators who featured
-- them), most recent or most seen first. A brand not on this database is skipped. The forced row
-- rules hold the table's owner too, so they are lifted for this statement and forced again.
ALTER TABLE brandbase.brands NO FORCE ROW LEVEL SECURITY;
UPDATE brandbase.brands b SET collaborators = s.collaborators
  FROM (VALUES
    ('casa-vostra', '{"ig": ["@thisismissiongroup", "@casanostrasg", "@lifestyleasiasg", "@labottegasg", "@petra.singapore", "@sgnomster", "@365days2play", "@sgcafehopping"], "tt": ["@sarxh.lim", "@oooduties", "@raea.jpg", "@its_emmagracex"], "fb": ["Burpple", "8DAYSSG"]}'::jsonb),
    ('chin-mee-chin', '{"ig": ["@woodsinthebooks", "@beechenghiangsg", "@cafequenino", "@hungrygowhere", "@nex.singapore", "@singapore.foodie", "@blocpaper"], "tt": ["@eatbooksg", "@8dayseat", "@deeniseglitz", "@abcfoodies", "@esyfilms"], "fb": ["Bee Cheng Hiang", "BYKidO"]}'::jsonb),
    ('temper', '{"ig": ["@joshua_raaj", "@sklo_sg", "@whatisdieting", "@mackabuang", "@roberto_duran_ms", "@mondriansingapore", "@eshton", "@groovetop", "@taylahelaine"], "tt": ["@eshtonc", "@annivrse", "@sippin_n_munchin", "@oooduties"]}'::jsonb),
    ('petra', '{"ig": ["@chef_anasss", "@middleclasssg", "@dawidchef", "@casanostrasg", "@thisismissiongroup", "@yourtrustfunddaughter", "@brandcellar", "@urbanlistsingapore"], "tt": ["@onericeplease"], "fb": ["MiddleClassSG", "greatnewplaces", "HungryGoWhere", "LifestyleAsiaSingapore"]}'::jsonb),
    ('firebird', '{"ig": ["@makotosuetomi", "@thisismissiongroup", "@middleclasssg", "@mondriansingapore", "@aplussingapore", "@singaporefoodbutler", "@portfoliomagsg"], "tt": ["@eshtonc", "@aplussingapore"], "fb": ["exploregowhere", "sgfoodonfoot"]}'::jsonb),
    ('willow', '{"ig": ["@nictkc", "@thisismissiongroup", "@entierfrenchdining", "@akar_kl", "@aidanlowyx", "@hk_datfoodlife", "@han_lg"], "fb": ["Entier French Dining", "TatlerDiningSG"]}'::jsonb)
  ) AS s (id, collaborators)
  WHERE b.id = s.id AND b.collaborators = '{}';
ALTER TABLE brandbase.brands FORCE ROW LEVEL SECURITY;
