-- A farmer asks, an agrochemist advises: one account cannot hold both roles (issue #99). An administrator may
-- hold another role next to either of them, so a plain unique index on user_id would be too strict.

-- 1. Do not apply the rule silently over data that already breaks it: list the accounts and stop. (The index
-- below would also fail on such data, but without saying which accounts.)
DO $$
DECLARE
    offenders text;
BEGIN
    SELECT string_agg(user_id::text, ', ' ORDER BY user_id)
      INTO offenders
      FROM (SELECT user_id
              FROM user_roles
             WHERE role_code IN ('farmer', 'agrochemist')
             GROUP BY user_id
            HAVING count(*) > 1) both_roles;
    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION 'Accounts hold both farmer and agrochemist: %. Fix them by hand, then run the migration again.',
            offenders;
    END IF;
END
$$;

-- 2. At most one row of the two roles per user. A partial unique index is enforced at every isolation level
-- and for concurrent sessions without any locking; changing the only role of a user (UPDATE) stays allowed.
CREATE UNIQUE INDEX user_roles_one_of_farmer_agrochemist
    ON user_roles (user_id)
    WHERE role_code IN ('farmer', 'agrochemist');
