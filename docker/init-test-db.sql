-- Provisions the isolated test database alongside the dev database.
-- Vitest points at this one so a test run can truncate freely without
-- touching development data.
CREATE DATABASE move_test;
