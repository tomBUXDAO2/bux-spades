-- Safe migration to add missing columns without losing data
-- This script only adds columns if they don't exist

-- Add avatarUrl column to User table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'User' AND column_name = 'avatarUrl') THEN
        ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
        RAISE NOTICE 'Added avatarUrl column to User table';
    ELSE
        RAISE NOTICE 'avatarUrl column already exists in User table';
    END IF;
END $$;

-- Add createdById column to Game table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'Game' AND column_name = 'createdById') THEN
        ALTER TABLE "Game" ADD COLUMN "createdById" TEXT;
        RAISE NOTICE 'Added createdById column to Game table';
    ELSE
        RAISE NOTICE 'createdById column already exists in Game table';
    END IF;
END $$;

-- Check current structure
SELECT 'User table columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'User' 
ORDER BY ordinal_position;

SELECT 'Game table columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'Game' 
ORDER BY ordinal_position;
