-- Two companies: casa (ig, tt, fb; Lark linked) and osteria in company A, temper in company B.
-- member and owner are in A; both is a member of A and an admin of B; b-owner owns B; gone is A's
-- but deactivated; loner has an account (an admin by users.role, which reaches nothing now) and no
-- company; stranger has no account.
insert into brandbase.organizations (id, name) values ('co-a', 'Company A'), ('co-b', 'Company B');
insert into brandbase.brands (id, name, handle, linked, position, org_id) values
  ('casa', 'Casa Vostra', '@casavostra', '{ig,tt,fb}', 0, 'co-a'),
  ('temper', 'Temper', '@temper', '{ig,tt,fb}', 1, 'co-b'),
  ('osteria', 'Osteria', '@osteria', '{ig}', 2, 'co-a');
insert into brandbase.users (id, email, role, deactivated_at) values
  ('member', 'member@example.com', 'member', null),
  ('owner', 'owner@example.com', 'member', null),
  ('both', 'both@example.com', 'member', null),
  ('gone', 'gone@example.com', 'member', now()),
  ('loner', 'loner@example.com', 'admin', null),
  ('b-owner', 'b-owner@example.com', 'member', null);
insert into brandbase.org_members (user_id, org_id, role) values
  ('member', 'co-a', 'member'), ('owner', 'co-a', 'owner'), ('both', 'co-a', 'member'),
  ('both', 'co-b', 'admin'), ('gone', 'co-a', 'member'), ('b-owner', 'co-b', 'owner');
insert into brandbase.connections (brand_id, key, status) values ('casa', 'lark', 'connected');
-- Moodboards: casa's boards in an order their ids do not sort in, a shelf and a pin on each; one
-- shelf post for temper.
insert into brandbase.moodboard_boards (id, brand_id, name, pin_count, covers, position) values
  ('casa-b-late', 'casa', 'Late', 9, '["/pins/l.jpg"]', 0),
  ('casa-b-early', 'casa', 'Early', 3, '[]', 1),
  ('temper-b', 'temper', 'Steak', 1, '[]', 0);
insert into brandbase.moodboard_posts (id, brand_id, board_id, platform, account, image, borrow, ratio, seed, position) values
  ('casa-s2', 'casa', null, 'tt', '@two', '/s2.jpg', 'The pour', null, '{"format": "reel", "hook": "Pour it slow"}', 1),
  ('casa-s1', 'casa', null, 'ig', '@one', '/s1.jpg', 'The steam', null, '{"format": "carousel", "hook": "Steam rising"}', 0),
  ('casa-p-early', 'casa', 'casa-b-early', 'pinterest', 'Early', '/pe.jpg', 'Flour', 1.25, '{"format": "reel", "hook": "Flour"}', 0),
  ('casa-p-late', 'casa', 'casa-b-late', 'pinterest', 'Late', '/pl.jpg', 'Candles', 1.5, '{"format": "story", "hook": "Candles"}', 0),
  ('temper-s1', 'temper', null, 'ig', '@steak', '/t1.jpg', 'The sear', null, '{"format": "reel", "hook": "Sear"}', 0),
  ('temper-p1', 'temper', 'temper-b', 'pinterest', 'Steak', '/tp.jpg', 'Smoke', 1, '{"format": "reel", "hook": "Smoke"}', 0);
