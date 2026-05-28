/*
  Run on SERVER004 in SSMS as a SQL Server sysadmin.

  Before running:
    1. Replace <<STRONG_PASSWORD_HERE>> with the password you want to use.
    2. Confirm the target database is AdaAcc.
    3. Restart SQL Server after this script if Mixed Mode was previously off.

  This creates/enables a read-only SQL login for the AdaPOS sync agent.
*/

USE master;
GO

EXEC xp_instance_regwrite
  N'HKEY_LOCAL_MACHINE',
  N'Software\Microsoft\MSSQLServer\MSSQLServer',
  N'LoginMode',
  REG_DWORD,
  2;
GO

IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'readonly_pilot')
BEGIN
  CREATE LOGIN [readonly_pilot]
    WITH PASSWORD = N'<<STRONG_PASSWORD_HERE>>',
         CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF;
END
ELSE
BEGIN
  ALTER LOGIN [readonly_pilot]
    WITH PASSWORD = N'<<STRONG_PASSWORD_HERE>>',
         CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF;
  ALTER LOGIN [readonly_pilot] ENABLE;
END
GO

USE [AdaAcc];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'readonly_pilot')
BEGIN
  CREATE USER [readonly_pilot] FOR LOGIN [readonly_pilot];
END
ELSE
BEGIN
  ALTER USER [readonly_pilot] WITH LOGIN = [readonly_pilot];
END
GO

EXEC sp_addrolemember N'db_datareader', N'readonly_pilot';
GO

DECLARE @RequiredTables TABLE (table_name sysname);
INSERT INTO @RequiredTables (table_name)
VALUES
  (N'products'),
  (N'sales'),
  (N'branch_stock'),
  (N'transfers'),
  (N'transfer_lines'),
  (N'pending_receipts'),
  (N'approved_receipts');

DECLARE @schema sysname;
DECLARE @table sysname;
DECLARE @sql nvarchar(max);

DECLARE table_cursor CURSOR LOCAL FAST_FORWARD FOR
  SELECT s.name, t.name
  FROM sys.tables t
  JOIN sys.schemas s ON s.schema_id = t.schema_id
  JOIN @RequiredTables rt ON rt.table_name = t.name;

OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @schema, @table;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @sql = N'GRANT SELECT ON ' + QUOTENAME(@schema) + N'.' + QUOTENAME(@table) + N' TO [readonly_pilot];';
  EXEC sp_executesql @sql;
  PRINT N'Granted SELECT on ' + QUOTENAME(@schema) + N'.' + QUOTENAME(@table);
  FETCH NEXT FROM table_cursor INTO @schema, @table;
END
CLOSE table_cursor;
DEALLOCATE table_cursor;

SELECT rt.table_name AS required_table,
       CASE WHEN EXISTS (SELECT 1 FROM sys.tables t WHERE t.name = rt.table_name) THEN 'FOUND' ELSE 'MISSING' END AS status
FROM @RequiredTables rt
ORDER BY rt.table_name;
GO

PRINT 'Done. If Mixed Mode was newly enabled, restart SQL Server before testing from the branch laptop.';
GO

