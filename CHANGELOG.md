# Changelog

All notable changes made during the Lama stabilization pass are recorded here.

## 3.0.0 - 2026-09-17

- Upgraded the application runtime and dependencies for modern Node.js and npm compatibility.
- Added the features and fixes documented in the 2.1.1 and 2.1.0 release sections.
- Updated the application release version to 3.0.0.
- Added local `[security]` properties for `cookieSecret` and `sessionSecret`, with environment variables taking precedence.

## 2.1.1 - 2026-09-17

- Updated the application release version to 2.1.1.
- Added an administrator Delete button beside each user's Edit button.
- Added protected user deletion with an option to keep or delete the user's articles; deleting articles also deletes their attached comments.
- User-authored comments are removed when the user account is deleted, while comments on retained articles remain.
- Added a Search by Date sidebar section with inclusive start and end date filters.
- Moved the MongoDB URI out of `lama.js` into an ignored local properties file, with `MONGODB_URI` environment-variable override support.
- Upgraded the application dependencies to current major releases and replaced the abandoned `bcrypt-nodejs` package with `bcrypt`.
- Updated the code for Express 5, Mongoose 9, Passport 0.7, Express Handlebars 9, and the current properties-reader API.
- Kept the profanity packages on their latest CommonJS-compatible releases because the newest `badwords-list` package is ESM-only.

## 2.1.0 - 2026-09-17

### Security

- Added session-backed CSRF tokens.
- Validated CSRF tokens on all `POST`, `PUT`, `PATCH`, and `DELETE` requests.
- Added CSRF hidden fields to server-rendered mutation forms.
- Added the CSRF token as an `X-CSRF-Token` header for AJAX requests.
- Changed logout from `GET /logout` to CSRF-protected `POST /logout`.
- Added authentication throttling: 10 login or signup attempts per 15-minute client-address window.
- Added periodic cleanup of expired authentication limiter entries.
- Restricted article edits and deletion to the article owner or an administrator.
- Restricted comment deletion to the comment author, article owner, or an administrator.
- Added exact identifier matching for article and user route lookups instead of interpreting route parameters as regular expressions.
- Removed stored password hashes from profile edit forms.
- Added lowercase, trim, and database-level uniqueness options to local user email addresses.
- Removed hardcoded cookie and session secrets from middleware configuration.
- Required `COOKIE_SECRET` and `SESSION_SECRET` in production.
- Disabled unnecessary session initialization and resaving with `saveUninitialized: false` and `resave: false`.
- Limited proxy trust configuration to production.

### Authentication and users

- Normalized email input across signup, login, profile editing, and administrator profile editing.
- Corrected duplicate-email checks during profile changes.
- Made initial administrator selection deterministic using an administrator count.
- Updated article ownership metadata when a user changes email or name.
- Added defensive authentication and administrator guards.
- Fixed logout handling for Passport 0.4's synchronous API while retaining compatibility with callback-based APIs.

### Runtime stability

- Replaced unsafe `throw err` statements inside asynchronous callbacks with logged errors and controlled redirects or responses.
- Fixed article creation error handling and redirect behavior.
- Fixed article and comment deletion behavior and switched to current Mongoose deletion methods.
- Fixed malformed author-search controller logic.
- Fixed settings update error handling.
- Added safer user lookup handling to profile, admin, settings, home, article, and new-article flows.
- Added `Tools.loadCurrentUser` to centralize current-user lookup.
- Ensured authenticated user lookups finish before rendering views, preventing pages from rendering with empty user data.
- Fixed asynchronous error handling in article, comment, article-list, sidebar, statistics, admin, settings, and profile flows.
- Added safe fallback redirects for failed settings and user lookups instead of allowing uncaught callback exceptions.
- Exported `Settings` and `User` from the central model index.
- Added clearer MongoDB connection and startup logging.
- Corrected `package.json` so `main` points to `lama.js`.

### Configuration and UI

- Added environment-based port and host configuration in `lama.js`.
- Added MongoDB connection timeout configuration.
- Corrected theme assignment in the settings helper.
- Added CSRF metadata to all layouts.
- Added logout form markup to the authenticated layout.

### Testing and maintenance

- Added Mocha to development dependencies and restored an executable `npm test` script.
- Added test bootstrap support in `tests/testhelper.js`.
- Added regression coverage for authenticated user data being loaded before profile rendering.
- Added direct syntax and module-load validation during stabilization.
- Declared `connect-mongo` as a dependency during deployment hardening, but did not wire it into the active session configuration because the package was unavailable during one validation pass. The application still uses the default in-memory session store.

## 2.0.1 - Existing project release

- Refactored edit-profile buttons into the upper-left profile area.
- Added the original Lama theme and settings behavior documented in the legacy README.

## Historical notes

The original project README described a local MongoDB setup and a hardcoded connection example. That guidance has been replaced because credentials must not be committed to source control. See the current README for configuration and deployment notes.
