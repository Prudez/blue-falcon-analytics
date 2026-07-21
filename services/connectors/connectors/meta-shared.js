// connectors/meta-shared.js
// Error classification shared by the Facebook and Instagram connectors.
//
// The server fetchers throw plain Errors carrying `graphCode` (Meta's error
// code). The framework needs those sorted into its own taxonomy so the
// manager can alert correctly: an expired long-lived token is a human task
// (token-expired alert), a permissions problem is a credential task
// (auth-failed alert), and everything else propagates untouched so the run
// records the real message.
//
// Meta codes, from the Graph API error reference:
//   190          – access token invalid/expired -> manual re-auth
//   102          – session/API session expired  -> manual re-auth
//   10, 200–299  – permission errors            -> credentials misconfigured
//   4, 17, 32, 613 – rate/throttle codes; the fetchers surface these rarely
//     (they read res.ok), left to the generic path: the run fails with the
//     real message and the next scheduled run retries naturally.

const { AuthError, TokenExpiredError } = require('../core/errors');

function classifyMetaError(connectorName, err) {
  const code = err?.graphCode;
  if (code === 190 || code === 102) {
    return new TokenExpiredError(
      `${connectorName}: Meta token expired or invalidated (code ${code}). Manual re-auth required — regenerate the token and update .env.`,
      { connector: connectorName, cause: err.message }
    );
  }
  if (code === 10 || (code >= 200 && code <= 299)) {
    return new AuthError(
      `${connectorName}: Meta permission error (code ${code}): ${err.message}`,
      { connector: connectorName, cause: err.message }
    );
  }
  return err;
}

module.exports = { classifyMetaError };
