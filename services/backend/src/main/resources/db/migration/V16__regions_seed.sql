-- The regions a person can pick at registration: the leading farming regions of Kazakhstan for the crops of the
-- app (wheat, potato, tomato, maize). Not all 17 regions: the list is a product decision, and another region is
-- added by a new migration (V17 or later). `code` is stable and lower case; the names are in ru, kk and en.
-- Idempotent: a region that is already there is left as it is.
INSERT INTO regions (code, names) VALUES
    ('akmola', '{"ru": "Акмолинская область", "kk": "Ақмола облысы", "en": "Akmola Region"}'),
    ('aktobe', '{"ru": "Актюбинская область", "kk": "Ақтөбе облысы", "en": "Aktobe Region"}'),
    ('almaty', '{"ru": "Алматинская область", "kk": "Алматы облысы", "en": "Almaty Region"}'),
    ('east_kazakhstan', '{"ru": "Восточно-Казахстанская область", "kk": "Шығыс Қазақстан облысы", "en": "East Kazakhstan Region"}'),
    ('zhambyl', '{"ru": "Жамбылская область", "kk": "Жамбыл облысы", "en": "Zhambyl Region"}'),
    ('karaganda', '{"ru": "Карагандинская область", "kk": "Қарағанды облысы", "en": "Karaganda Region"}'),
    ('kostanay', '{"ru": "Костанайская область", "kk": "Қостанай облысы", "en": "Kostanay Region"}'),
    ('pavlodar', '{"ru": "Павлодарская область", "kk": "Павлодар облысы", "en": "Pavlodar Region"}'),
    ('north_kazakhstan', '{"ru": "Северо-Казахстанская область", "kk": "Солтүстік Қазақстан облысы", "en": "North Kazakhstan Region"}'),
    ('turkistan', '{"ru": "Туркестанская область", "kk": "Түркістан облысы", "en": "Turkistan Region"}')
ON CONFLICT (code) DO NOTHING;
