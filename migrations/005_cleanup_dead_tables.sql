-- 005 – Drop the dead moderation tables from migration 002
-- These tables (content_reports, user_blocks, user_mutes, user_preferences,
-- moderation_flags) were created by 002_add_moderation.sql but are no longer
-- referenced by any route. The live tables are post_reports & user_moderation
-- (created by migration-moderation.sql).
-- Run this ONLY after confirming nothing in your frontend calls these tables.

DROP TABLE IF EXISTS content_reports;
DROP TABLE IF EXISTS user_blocks;
DROP TABLE IF EXISTS user_mutes;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS moderation_flags;
