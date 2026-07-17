// core/logger.js
// Minimal leveled logger with per-connector prefixes. No secrets in log lines, ever.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(name, level = 'info') {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const log = (lvl, msg, extra) => {
    if (LEVELS[lvl] < threshold) return;
    const ts = new Date().toISOString();
    const line = `${ts} [${lvl.toUpperCase()}] [${name}] ${msg}`;
    const fn = lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.log;
    if (extra !== undefined) fn(line, extra);
    else fn(line);
  };

  return {
    debug: (msg, extra) => log('debug', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    child: (childName) => createLogger(`${name}:${childName}`, level),
  };
}

module.exports = { createLogger };
