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
