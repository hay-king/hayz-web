import { createApp } from './app.mjs';
import { createGoogleAuth } from './auth/google.mjs';
import { authConfigured, loadConfig, missingAuthEnv, redirectUri } from './config.mjs';
import { openDatabase } from './db/index.mjs';

const config = loadConfig();
const db = openDatabase(config.dataDir);
const server = createApp({
  config,
  db,
  google: createGoogleAuth(),
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`hayz-web listening on ${config.port}`);
  if (!authConfigured(config)) {
    console.warn(`auth disabled, missing: ${missingAuthEnv(config).join(', ')}`);
    return;
  }
  console.log(`oauth redirect uri: ${redirectUri(config)}`);
  if (!config.publicBaseUrl.startsWith('https://')) {
    console.warn('PUBLIC_BASE_URL is not https; session cookie Secure flag is off');
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
