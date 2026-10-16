export function buildSqlServerConfig(config) {
  return {
    server: config.sqlServerHost,
    user: config.sqlServerUser,
    password: config.sqlServerPassword,
    database: config.sqlServerDatabase,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      ...(config.sqlServerInstanceName
        ? { instanceName: config.sqlServerInstanceName }
        : {}),
    },
    ...(config.sqlServerInstanceName ? {} : { port: config.sqlServerPort }),
  };
}
