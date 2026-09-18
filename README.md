# Tidepaper

Tidepaper is a server-rendered blog application built with Node.js, Express, MongoDB, Mongoose, Passport, and Handlebars.

Current version: **3.4.0**

## Features

- Public home page and article pages
- User signup, login, logout, and profile editing
- Direct messages between registered users with an authenticated inbox
- Recipient search by name or email when composing messages
- Optional message attachments up to 5 MB for common document, image, and text formats
- Article images and downloadable files, with inline image rendering
- Local NSFWJS image moderation by default, with cloud provider choices in Settings
- Separate unread Inbox and Read messages views
- Message deletion and explicit Mark as read actions
- Unread message count alerts in the authenticated navigation
- Per-user X and Facebook profile links with site defaults for guests
- First registered user is assigned administrator access
- Article creation, editing, likes, comments, and deletion
- Inline comments beneath articles with per-article expand and collapse controls
- Compact article actions for Like, Comments, and View
- Private articles visible only to their author and administrators
- Comment moderation by comment owner, article owner, or administrator
- Administrator dashboard, user management, and admin-created accounts
- Site header, default X/Facebook links, theme, and signup settings
- Popular articles, recent comments, and site statistics
- Collapsible sidebar with reliable default visibility
- Improved article readability across dark themes
- Server-rendered Handlebars layouts and partials
- CSRF protection for state-changing requests
- Login and signup attempt throttling
- Release-versioned CSS and JavaScript assets to avoid stale deployment caches

## Requirements

- Node.js `22.22.2` or newer. The latest Express Handlebars release requires Node.js 22.22.2 or newer.
- npm
- MongoDB, either local or hosted

## Installation

```powershell
git clone https://github.com/HalKnight/Lama.git
Set-Location Lama
npm install
```

Start the application with:

```powershell
npm start
```

By default, the server listens on `127.0.0.1:8080`. Open `http://127.0.0.1:8080/` in a browser.

To use another port or host in PowerShell:

```powershell
$env:PORT=8081
$env:HOST="127.0.0.1"
npm start
```

If port `8080` is already occupied, either stop the process using it or select another port with `PORT`.

## Configuration

### Environment variables

| Variable | Used by | Description |
| --- | --- | --- |
| `PORT` | `lama.js` | HTTP port. Defaults to `8080`. |
| `HOST` | `lama.js` | Bind address. Defaults to `127.0.0.1`. |
| `NODE_ENV` | `server/configure.js` | Use `production` for production cookie and proxy behavior. |
| `SESSION_SECRET` | `server/configure.js` | Session signing secret. Required in production. |
| `COOKIE_SECRET` | `server/configure.js` | Cookie signing secret. Falls back to `SESSION_SECRET`; required in production. |
| `MONGODB_URI` | `lama.js` | MongoDB connection URI. Overrides the local properties file. |
| `AWS_REGION` | image moderation | AWS Rekognition region when AWS moderation is selected. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | image moderation | AWS credentials for Rekognition moderation. |
| `GOOGLE_APPLICATION_CREDENTIALS` | image moderation | Google service-account JSON path for Vision SafeSearch. |
| `AZURE_CONTENT_SAFETY_ENDPOINT` | image moderation | Azure Content Safety endpoint. |
| `AZURE_CONTENT_SAFETY_KEY` | image moderation | Azure Content Safety subscription key. |

In production, set secrets before starting the server:

```powershell
$env:NODE_ENV="production"
$env:SESSION_SECRET="replace-with-a-long-random-value"
$env:COOKIE_SECRET="replace-with-another-long-random-value"
$env:PORT=8080
npm start
```

The application rejects production startup when either required secret is missing. Local development uses development fallback secrets so the app can boot without additional configuration.

### Database connection

For local development, create `server/properties.local.file`. This file is ignored by Git and must contain:

```properties
[database]
mongoUri = mongodb://127.0.0.1:27017/lama

[security]
cookieSecret = replace-with-a-long-random-cookie-secret
sessionSecret = replace-with-a-long-random-session-secret
```

For hosted or production databases, prefer environment variables. In local development, the security values may be stored in the ignored properties file. Environment variables always take precedence:

```powershell
$env:MONGODB_URI="mongodb://user:password@host:27017/lama"
npm start
```

Do not commit database credentials, session secrets, or cookie secrets. Rotate any credentials that were previously committed to source control.

### Site settings

Default site settings are stored in [server/properties.file](server/properties.file):

- `main.version`: footer/version text
- `main.lamaTitle`: site header, defaulting to Tidepaper
- `main.twitter`: X profile URL
- `main.facebook`: Facebook link
- `main.theme`: default Bootswatch theme
- `admin.settingsID`: identifier for the settings document

Administrators can override the header, theme, and whether new users may register from `/settings`. Site-default X and Facebook URLs remain in `server/properties.file`. Available themes are Readable, Slate, Flatly, United, Cyborg, and Solar.

Image moderation defaults to local NSFWJS using the portable JavaScript TensorFlow backend and does not require an API fee. Settings also exposes AWS Rekognition, Google Cloud Vision SafeSearch, and Azure AI Content Safety choices. Configure the matching environment variables before selecting a cloud mode. Non-image article/message files are restricted by type and size but are not content-moderated.

Users can override the default X and Facebook footer links from `/editProfile`. Values must use `http://` or `https://`; blank values restore the site defaults from `server/properties.file`.

## Application structure

| Directory/file | Responsibility |
| --- | --- |
| [lama.js](lama.js) | Application entry point, MongoDB connection, and HTTP listener |
| [server/configure.js](server/configure.js) | Express middleware, sessions, Handlebars, CSRF validation, and route registration |
| [server/routes.js](server/routes.js) | Route definitions, authentication guards, logout, and login throttling |
| [config/passport.js](config/passport.js) | Passport local signup, login, profile edit, serialization, and admin edit strategies |
| [controllers](controllers) | Request handlers for articles, home, admin, settings, profiles, and new articles |
| [helpers](helpers) | Sidebar, article, comment, and statistics helpers |
| [models](models) | Mongoose models for users, articles, comments, images, and settings |
| [views](views) | Handlebars pages, layouts, and partials |
| [public](public) | CSS, JavaScript, fonts, and editor assets |
| [tests](tests) | Regression-test support and route render-order coverage |

## Routes

### Public routes

- `GET /` redirects to `/home`.
- `GET /home` displays recent articles.
- `GET /home/:article_id/searchbyauthor` searches articles by author name.
- `GET /home/searchbydate?from=YYYY-MM-DD&to=YYYY-MM-DD` searches articles in an inclusive date range.
- `GET /articles/:article_id` displays an article.
- `GET /login` displays the login form.
- `GET /signup` displays signup when registration is enabled.

### Authenticated routes

- `POST /articles` creates or updates an article.
- `POST /articles/:article_id/like` increments an article like count.
- `POST /articles/:article_id/comment` creates a comment.
- `DELETE /articles/:article_id` deletes an article for its owner or an administrator.
- `DELETE /articles/:article_id/commentdelete` deletes a comment for its author, the article owner, or an administrator.
- `GET /profile` displays the current profile.
- `GET /editProfile` and `POST /editProfile` edit the current profile.
- `GET /messages` displays the authenticated user's unread inbox.
- `GET /messages/read` displays the authenticated user's non-deleted read messages.
- `POST /messages/:message_id/read` marks an owned message as read without opening it.
- `POST /messages/:message_id/delete` deletes an owned message.
- `GET /messages/compose` displays the new-message form.
- `POST /messages` sends a message to another registered user.
- `GET /messages/:message_id/attachment` downloads an attachment from an owned message.
- `GET /messages/:message_id` displays and marks an owned message as read.
- `GET /newArticle` displays the article editor.
- `GET /newArticle/:article_id` edits an existing article.
- `GET /users/:user_id` displays that user's articles, including their private articles when viewed as the author.
- `POST /logout` logs the user out. Logout is POST-only and CSRF-protected.

### Administrator routes

- `GET /admin` displays the user administration page.
- `GET /admin/users/new` displays the administrator-only user creation form, even when public signup is disabled.
- `POST /admin/users/create` creates a user through the administrator-only flow.
- `POST /admin/users/delete` deletes a selected user. The administrator chooses whether to keep or delete that user's articles; deleting articles also deletes their attached comments.
- `GET /settings` displays site settings.
- `POST /settings` updates site settings.
- `GET /editProfileAdmin/:user_id` edits another user.
- `POST /editProfileAdmin` saves an administrator edit.

## Authentication and authorization

- Passport stores the user ID in the session and reloads the user from MongoDB on later requests.
- Email addresses are normalized to lowercase and trimmed.
- User email uniqueness is enforced by the Mongoose schema. Existing duplicate records must be cleaned before MongoDB can create the unique index.
- The first user with administrator access becomes the initial administrator.
- Profile and administrator profile updates propagate changed email ownership to the user's articles.
- Article update and deletion queries are restricted to the article owner unless the requester is an administrator.
- Private articles are excluded from public feeds and searches; direct access is limited to the author or an administrator.
- Comment deletion checks the comment author, article owner, and administrator roles.
- Administrator user deletion cannot target the currently logged-in administrator account and defaults to keeping the user's articles.

## CSRF protection

`server/configure.js` creates a session-backed CSRF token and exposes it to Handlebars as `csrfToken`.

- All `POST`, `PUT`, `PATCH`, and `DELETE` requests require `_csrf` in the body or `X-CSRF-Token` in the header.
- Server-rendered forms include hidden `_csrf` fields.
- `public/js/scripts.js` sends the token with AJAX requests.
- Missing or invalid tokens return HTTP `403`.

## Session and rate-limit behavior

Sessions use MongoDB-backed persistence through `connect-mongo`, which is suitable for production deployments using the configured MongoDB connection.

Login and signup attempts are limited to 10 attempts per 15-minute window per client address. Expired limiter entries are periodically removed. The limiter is process-local, so a shared store is required for consistent limits across multiple instances.

## Testing and validation

The package test script is:

```powershell
npm test
```

The project uses Mocha, Chai, Sinon, and Proxyquire. Useful direct checks are:

```powershell
node --check server/routes.js
node --check controllers/article.js
node --check server/configure.js
node -e "require('./server/routes'); console.log('routes load ok')"
```

The test suite and route-render regression coverage verify that authenticated user data is loaded before pages are rendered. Full browser workflows and live MongoDB behavior still require an available MongoDB instance and should be tested separately.

## Operational notes

- Do not run two Tidepaper instances on the same host and port.
- Restart the server after changing JavaScript, environment variables, or `server/properties.file`.
- Use HTTPS in production because sessions and CSRF tokens rely on secure cookie settings there.
- The declared `connect-mongo` dependency is not currently wired into `server/configure.js`; installing a package alone does not change the active session store.
- `bad-words` and `badwords-list` remain on their latest CommonJS-compatible releases because the newest `badwords-list` release is ESM-only and cannot be loaded by this CommonJS application without a larger module-system migration.

## License

Tidepaper is distributed under the MIT License. See the license text included in the source files.

See [CHANGELOG.md](CHANGELOG.md) for the stabilization and bug-fix history.
