-- Backfill the current hardcoded endless challenge rules into the database.
-- Enum values:
-- competitions.type = 2 => ENDLESS
-- competitions.sub_type = 1 => BOSS_CHALLENGE
-- challenges.type = 0 => REGULAR

INSERT INTO `challenges` (`competition_id`, `type`, `start_level`, `challenge`, `created_at`, `updated_at`)
SELECT
  c.id,
  0,
  1,
  JSON_OBJECT(
    'single', 8000,
    'team', JSON_ARRAY(8000, 1)
  ),
  NOW(),
  NOW()
FROM `competitions` c
LEFT JOIN `challenges` ch
  ON ch.competition_id = c.id
WHERE c.type = 2
  AND c.sub_type <> 1
  AND ch.id IS NULL;

-- Backfill the current HP-based boss challenge rules.
INSERT INTO `challenges` (`competition_id`, `type`, `start_level`, `end_level`, `levels`, `challenge`, `created_at`, `updated_at`)
SELECT
  c.id,
  1,
  rules.start_level,
  rules.end_level,
  rules.levels,
  JSON_OBJECT(
    'instantKill', rules.instant_kill,
    'minHitPoints', rules.min_hit_points,
    'maxHitPoints', rules.max_hit_points
  ),
  NOW(),
  NOW()
FROM `competitions` c
JOIN (
  SELECT 1 AS sort_order, 1 AS start_level, 9 AS end_level, CAST(NULL AS JSON) AS levels, 2400 AS instant_kill, 70 AS min_hit_points, 110 AS max_hit_points
  UNION ALL
  SELECT 2, NULL, NULL, JSON_ARRAY(10), 2200, 160, 240
  UNION ALL
  SELECT 3, 11, 19, CAST(NULL AS JSON), 2300, 90, 130
  UNION ALL
  SELECT 4, NULL, NULL, JSON_ARRAY(20), 2200, 220, 320
  UNION ALL
  SELECT 5, 21, 29, CAST(NULL AS JSON), 2300, 110, 160
  UNION ALL
  SELECT 6, NULL, NULL, JSON_ARRAY(30), 2200, 260, 380
  UNION ALL
  SELECT 7, 31, 39, CAST(NULL AS JSON), 2300, 130, 190
  UNION ALL
  SELECT 8, NULL, NULL, JSON_ARRAY(40), 2100, 320, 450
  UNION ALL
  SELECT 9, 41, 49, CAST(NULL AS JSON), 2200, 150, 210
  UNION ALL
  SELECT 10, NULL, NULL, JSON_ARRAY(50), 2100, 380, 540
  UNION ALL
  SELECT 11, 51, 59, CAST(NULL AS JSON), 2200, 170, 230
  UNION ALL
  SELECT 12, NULL, NULL, JSON_ARRAY(60), 2100, 450, 630
  UNION ALL
  SELECT 13, 61, 69, CAST(NULL AS JSON), 2200, 190, 250
  UNION ALL
  SELECT 14, NULL, NULL, JSON_ARRAY(70), 2000, 540, 760
  UNION ALL
  SELECT 15, 71, 79, CAST(NULL AS JSON), 2100, 210, 280
  UNION ALL
  SELECT 16, NULL, NULL, JSON_ARRAY(80), 2000, 650, 900
  UNION ALL
  SELECT 17, 81, 89, CAST(NULL AS JSON), 2100, 230, 310
  UNION ALL
  SELECT 18, NULL, NULL, JSON_ARRAY(90), 1900, 780, 1080
  UNION ALL
  SELECT 19, 91, 99, CAST(NULL AS JSON), 2100, 250, 340
  UNION ALL
  SELECT 20, NULL, NULL, JSON_ARRAY(100), 1900, 900, 1250
) rules
WHERE c.type = 2
  AND c.sub_type = 1
  AND NOT EXISTS (
    SELECT 1
    FROM `challenges` ch
    WHERE ch.competition_id = c.id
  )
ORDER BY c.id, rules.sort_order;
