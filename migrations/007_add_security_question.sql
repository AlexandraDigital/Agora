-- Self-service password recovery. There's no email system in this app, so
-- a security question is the "forgot password" mechanism instead of an
-- emailed reset link.
--
-- Both columns are nullable: existing accounts won't have either set until
-- the user sets one from Settings (while still logged in) — until then,
-- "forgot password" has nothing to check against for that account.
ALTER TABLE users ADD COLUMN secQuestion TEXT;
ALTER TABLE users ADD COLUMN secAnswerHash TEXT;
