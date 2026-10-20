-- Two brands: casa (ig, tt, fb; Lark linked) and temper. member reaches casa only, admin both,
-- gone is deactivated, stranger has no account (packages/server/src/test-helpers.ts).
insert into brandbase.brands (id, name, handle, linked, position) values
  ('casa', 'Casa Vostra', '@casavostra', '{ig,tt,fb}', 0),
  ('temper', 'Temper', '@temper', '{ig,tt,fb}', 1);
insert into brandbase.users (id, email, role, deactivated_at) values
  ('member', 'member@example.com', 'member', null),
  ('admin', 'admin@example.com', 'admin', null),
  ('gone', 'gone@example.com', 'member', now());
insert into brandbase.members (user_id, brand_id) values ('member', 'casa'), ('gone', 'casa');
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
