/*
MIT License

Copyright (c) [2017] [Hal Knight]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var Settings = require("../models/settings");
var UserModel = require("../models/user");
var MessageModel = require("../models/message");
var css = [
  {
    css: "/public/css/readable.css?v=3.6.2"
  }
];
var PropertiesReaderModule = require("properties-reader");
var PropertiesReader = PropertiesReaderModule.default ||
  PropertiesReaderModule.propertiesReader ||
  PropertiesReaderModule;
var properties = PropertiesReader({ sourceFile: "./server/properties.file" }),
  lamaHeader = properties.get("main.lamaTitle"),
  lamaVersion = properties.get("main.version"),
  settingsID = properties.get("admin.settingsID"),
  lamaTwitter = properties.get("main.twitter"),
  lamaFacebook = properties.get("main.facebook"),
  lamaTheme = properties.get("main.theme");

function normalizeTidepaperUrl(value) {
  var url = String(value || "").trim();
  return /^(https?:\/\/|\/)/i.test(url) ? url : "/home";
}

// Settings change rarely, so cache the document briefly instead of querying on
// every page render; settings.js calls invalidateSettingsCache() after a save.
var SETTINGS_CACHE_TTL_MS = 30 * 1000;
var settingsCache = null;

function fetchSettings() {
  var now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) {
    return Promise.resolve(settingsCache.value);
  }
  return Settings.findOne({ settings_id: settingsID }).lean().exec().then(function(settings) {
    settingsCache = { value: settings, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
    return settings;
  });
}

// Unread counts tolerate a short staleness window; mutation points below
// (send/markRead/remove) invalidate the affected recipient's entry.
var UNREAD_CACHE_TTL_MS = 10 * 1000;
var unreadCountCache = new Map();

function fetchUnreadCount(email) {
  var now = Date.now();
  var cached = unreadCountCache.get(email);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  return MessageModel.countDocuments({
    recipientEmail: email,
    read: false
  }).then(function(count) {
    unreadCountCache.set(email, { value: count, expiresAt: Date.now() + UNREAD_CACHE_TTL_MS });
    return count;
  }).catch(function(err) {
    console.error("Unread message count failed:", err);
    return 0;
  });
}

// Generic short-lived cache for other pagination `countDocuments()` calls
// (e.g. message inbox/read totals, admin user totals) so "Page X of Y" totals
// don't require a fresh full-collection count on every page request.
var COUNT_CACHE_TTL_MS = 15 * 1000;
var countCache = new Map();

function cachedCount(key, queryFn) {
  var now = Date.now();
  var cached = countCache.get(key);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }
  return queryFn().then(function(count) {
    countCache.set(key, { value: count, expiresAt: Date.now() + COUNT_CACHE_TTL_MS });
    return count;
  });
}

module.exports = {
  loadCurrentUser: function(req, callback) {
    if (!req || !req.user || !req.user.local || !req.user.local.email) {
      return callback(null, {});
    }

    // Passport's deserializeUser already loaded this exact document for this
    // request, so reuse it instead of issuing a duplicate lookup by email.
    if (typeof req.user.toObject === "function") {
      return callback(null, req.user.toObject());
    }

    UserModel.findOne({
      "local.email": req.user.local.email
    }).lean().exec()
      .then(function(user) {
        callback(null, user || {});
      })
      .catch(callback);
  },

  cachedCount: cachedCount,

  invalidateCount: function(key) {
    countCache.delete(key);
  },

  invalidateSettingsCache: function() {
    settingsCache = null;
  },

  invalidateUnreadCount: function(email) {
    if (email) {
      var normalizedEmail = String(email).trim().toLowerCase();
      unreadCountCache.delete(normalizedEmail);
      countCache.delete("messages:unread:" + normalizedEmail);
      countCache.delete("messages:read:" + normalizedEmail);
    }
  },

  getSettings: function(viewModel, res, page, editSettings) {
    viewModel.lama.header = lamaHeader;
    viewModel.lama.version = lamaVersion;
    viewModel.lama.twitter = lamaTwitter;
    viewModel.lama.facebook = lamaFacebook;
    if (viewModel.user && viewModel.user.local) {
      viewModel.lama.twitter = viewModel.user.local.xUrl || lamaTwitter;
      viewModel.lama.facebook = viewModel.user.local.facebookUrl || lamaFacebook;
    }
    viewModel.styleSheet = css;
    viewModel.theme = lamaTheme;
    viewModel.tidepaperUrl = "/home";
    viewModel.lama.tidepaperUrl = "/home";
    viewModel.lama.tidepaperIconUrl = "";

    var unreadMessagesPromise = viewModel.user && viewModel.user.local && viewModel.user.local.email
      ? fetchUnreadCount(String(viewModel.user.local.email).trim().toLowerCase())
      : Promise.resolve(0);

    Promise.all([
      // Settings edits need the freshest document, so bypass the cache for that page.
      editSettings
        ? Settings.findOne({ settings_id: settingsID }).lean().exec()
        : fetchSettings(),
      unreadMessagesPromise
    ])
      .then(function(results) {
        var settings = results[0];
        viewModel.unreadMessages = results[1] || 0;
        if (settings) {
          var savedHeader = typeof settings.header === "string"
            ? settings.header.trim()
            : null;
          viewModel.lama.header = savedHeader !== null && savedHeader.toLowerCase() !== "lama"
            ? savedHeader
            : savedHeader === "lama"
              ? lamaHeader
              : lamaHeader;
          if (viewModel.user && viewModel.user.local) {
            viewModel.lama.twitter = viewModel.user.local.xUrl || lamaTwitter;
            viewModel.lama.facebook = viewModel.user.local.facebookUrl || lamaFacebook;
          }
          viewModel.theme = settings.theme || lamaTheme;
          viewModel.tidepaperUrl = normalizeTidepaperUrl(settings.tidepaperUrl);
          viewModel.lama.tidepaperUrl = viewModel.tidepaperUrl;
          viewModel.lama.tidepaperIconUrl = settings.tidepaperIconData
            ? "/tidepaper-icon"
            : String(settings.tidepaperIconUrl || "").trim();

          css = [
            {
              css: "/public/css/" + settings.theme + ".css?v=3.6.2"
            }
          ];

          viewModel.styleSheet = css;
          if (editSettings) {
            viewModel.settings = settings;
            if (savedHeader !== null && savedHeader.toLowerCase() === "lama") {
              viewModel.settings.header = lamaHeader;
            }
          }
          res.render(page, viewModel);
        } else {
          if (editSettings) {
            var newSettings = new Settings();
            newSettings.header = lamaHeader;
            newSettings.twitter = lamaTwitter;
            newSettings.facebook = lamaFacebook;
            newSettings.theme = lamaTheme;
            newSettings.tidepaperUrl = "/home";
            newSettings.tidepaperIconUrl = "";
            newSettings.moderationProvider = "local";
            newSettings.newUsers = true;
            viewModel.settings = newSettings;
          }
          res.render(page, viewModel);
        }
      })
      .catch(function(err) {
        console.error("Settings lookup failed:", err);
        res.status(500).send("Unable to load settings.");
      });
  }
};
