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
var home = require("../controllers/home"),
  article = require("../controllers/article"),
  newArticle = require("../controllers/newArticle"),
  admin = require("../controllers/admin"),
  editProfile = require("../controllers/editProfile"),
  settings = require("../controllers/settings"),
  messages = require("../controllers/messages"),
  passport = require("passport"),
  fs = require("fs"),
  path = require("path"),
  User = require("../models/user"),
  Settings = require("../models/settings"),
  md5 = require("MD5"),
  UserModel = require("../models/user"),
  flash = require("connect-flash");
var multer = require("multer");
var Tools = require("../server/tools.js");
var Moderation = require("../helpers/moderation");
var storage = require("node-persist");
var PropertiesReaderModule = require("properties-reader");
var PropertiesReader = PropertiesReaderModule.default ||
  PropertiesReaderModule.propertiesReader ||
  PropertiesReaderModule;
var properties = PropertiesReader({ sourceFile: "./server/properties.file" }),
  settingsID = properties.get("admin.settingsID"),
  lamaHeader = properties.get("main.lamaTitle"),
  lamaVersion = properties.get("main.version"),
  lamaTwitter = properties.get("main.twitter"),
  lamaFacebook = properties.get("main.facebook");
var authenticationAttempts = new Map();
var authenticationWindowMs = 15 * 60 * 1000;
var authenticationLimit = 10;
var lastAuthenticationCleanup = 0;
var messageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 10,
    parts: 12
  },
  fileFilter: function(req, file, callback) {
    var allowedTypes = [
      "application/pdf",
      "text/plain",
      "image/gif",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    callback(null, allowedTypes.indexOf(file.mimetype) !== -1);
  }
});
var articleUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
    fields: 10,
    parts: 20
  },
  fileFilter: function(req, file, callback) {
    var allowedTypes = [
      "application/pdf",
      "text/plain",
      "image/gif",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    callback(null, allowedTypes.indexOf(file.mimetype) !== -1);
  }
});
var settingsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
  fileFilter: function(req, file, callback) {
    callback(null, ["image/gif", "image/jpeg", "image/png"].indexOf(file.mimetype) !== -1);
  }
});
var profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
  fileFilter: function(req, file, callback) {
    callback(null, ["image/gif", "image/jpeg", "image/png"].indexOf(file.mimetype) !== -1);
  }
});
// Multer only enforces a per-file size cap, so five attachments could still total
// up to 25 MB in memory for one request; cap the combined size explicitly too.
var ARTICLE_UPLOAD_TOTAL_BYTES = 15 * 1024 * 1024;
function enforceArticleUploadTotalSize(req, res, next) {
  var files = req.files || [];
  var totalSize = files.reduce(function(sum, file) {
    return sum + (file.size || 0);
  }, 0);
  if (totalSize > ARTICLE_UPLOAD_TOTAL_BYTES) {
    req.flash("error", "Attachments in a single request must total 15 MB or less.");
    var fallback = req.params && req.params.article_id
      ? "/articles/" + req.params.article_id
      : "/newArticle";
    return res.redirect(fallback);
  }
  next();
}
function uploadMessageAttachment(req, res, next) {
  messageUpload.single("attachment")(req, res, function(err) {
    if (err) {
      req.flash("error", err.code === "LIMIT_FILE_SIZE"
        ? "Attachments must be 5 MB or smaller."
        : "That attachment type is not supported.");
      return res.redirect("/messages/compose");
    }
    next();
  });
}
function validateMessageCsrf(req, res, next) {
  if (!req.body || req.body._csrf !== req.session.csrfToken) {
    return res.status(403).send("Invalid CSRF token.");
  }
  next();
}
function validateArticleCsrf(req, res, next) {
  if (!req.body || req.body._csrf !== req.session.csrfToken) {
    return res.status(403).send("Invalid CSRF token.");
  }
  next();
}
function uploadSettingsIcon(req, res, next) {
  settingsUpload.single("tidepaperIconFile")(req, res, function(err) {
    if (err) {
      req.flash("error", err.code === "LIMIT_FILE_SIZE"
        ? "The icon must be 2 MB or smaller."
        : "Only PNG, JPG, and GIF icons are supported.");
      return res.redirect("/settings");
    }
    next();
  });
}
function validateSettingsCsrf(req, res, next) {
  if (!req.body || req.body._csrf !== req.session.csrfToken) {
    return res.status(403).send("Invalid CSRF token.");
  }
  next();
}
function validateProfileCsrf(req, res, next) {
  if (!req.body || req.body._csrf !== req.session.csrfToken) {
    return res.status(403).send("Invalid CSRF token.");
  }
  next();
}
function uploadProfileAvatar(req, res, next) {
  profileUpload.single("avatarFile")(req, res, function(err) {
    if (err) {
      req.flash("error", err.code === "LIMIT_FILE_SIZE"
        ? "Profile icons must be 2 MB or smaller."
        : "Only PNG, JPG, and GIF profile icons are supported.");
      return res.redirect("/editProfile");
    }
    var check = req.file
      ? Moderation.checkImage(req.file.buffer, undefined, req.file.mimetype)
      : Promise.resolve();
    check.then(function() {
      next();
    }).catch(function() {
      req.flash("error", "That profile icon did not pass image safety checks.");
      return res.redirect("/editProfile");
    });
  });
}

function isEmpty(value) {
  return (
    (typeof value == "string" && !value.trim()) ||
    typeof value == "undefined" ||
    value === null
  );
}

// passport-local rejects requests with an empty password field before the verify
// callback runs, so stash the real (possibly blank) value and pad the field it reads.
function preserveOptionalPassword(req, res, next) {
  if (!req.body) req.body = {};
  req.body.newPassword = req.body.password || "";
  if (!req.body.password) {
    req.body.password = "unchanged";
  }
  next();
}
  function limitAuthenticationAttempts(req, res, next) {
    var now = Date.now();
    var address = req.ip || req.connection.remoteAddress || "unknown";
    var attempt = authenticationAttempts.get(address);

    if (now - lastAuthenticationCleanup >= authenticationWindowMs) {
      authenticationAttempts.forEach(function(value, key) {
        if (now - value.startedAt >= authenticationWindowMs) {
          authenticationAttempts.delete(key);
        }
      });
      lastAuthenticationCleanup = now;
    }

    if (!attempt || now - attempt.startedAt >= authenticationWindowMs) {
      authenticationAttempts.set(address, {
        startedAt: now,
        count: 1
      });
      return next();
    }

    if (attempt.count >= authenticationLimit) {
      return res.status(429).send("Too many authentication attempts. Try again later.");
    }

    attempt.count += 1;
    next();
  }

module.exports.initialize = async function(app, passport) {
  await storage.init();
    limitAuthenticationAttempts,

  app.get("/", function(req, res) {
    res.redirect("/home");
  });
  app.get("/tidepaper-link", function(req, res) {
    Settings.findOne({ settings_id: settingsID }).lean().exec()
      .then(function(settings) {
        var target = String(settings && settings.tidepaperUrl || "/home").trim();
        if (!/^(https?:\/\/|\/)/i.test(target)) {
          target = "/home";
        }
        return res.redirect(target);
      })
      .catch(function(err) {
        console.error("Tidepaper icon link lookup failed:", err);
        return res.redirect("/home");
      });
  });
  app.get("/tidepaper-icon", settings.icon);
  app.get("/home", home.index);
  app.get("/home/:article_id/searchbyauthor", home.author);
  app.get("/home/searchbydate", home.date);
  app.get("/admin", isLoggedIn, admin.index);
  app.get("/admin/users/new", isLoggedIn, isAdmin, admin.createUserForm);
  app.get("/admin/metrics", isLoggedIn, isAdmin, admin.metrics);
  app.get("/users/avatar/:email", function(req, res) {
    var email = String(req.params.email || "").trim().toLowerCase();
    var fallback = function() {
      return res.redirect("https://www.gravatar.com/avatar/" + md5(email) + "?d=monsterid&s=45");
    };
    User.findOne({ "local.email": email }).lean().exec().then(function(user) {
      if (!user || !user.local || !user.local.avatarData) {
        return fallback();
      }
      var storedData = user.local.avatarData;
      var data = Buffer.isBuffer(storedData)
        ? storedData
        : Buffer.from(storedData.data || storedData.buffer || storedData);
      if (!data.length) {
        return fallback();
      }
      res.type(["image/png", "image/jpeg", "image/gif"].indexOf(user.local.avatarContentType) !== -1
        ? user.local.avatarContentType
        : "image/png");
      return res.send(data);
    }).catch(function() {
      return fallback();
    });
  });
  app.get("/users/:user_id", home.userHome);
  app.get("/my-posts", isLoggedIn, function(req, res) {
    var email = req.user && req.user.local && req.user.local.email;
    if (!email) {
      return res.redirect("/profile");
    }
    return res.redirect("/users/" + encodeURIComponent(email));
  });
  app.post("/admin/users/delete", isLoggedIn, isAdmin, admin.removeUser);
  app.get("/settings", isLoggedIn, isAdmin, settings.index);
  app.get("/newArticle", isLoggedIn, newArticle.index);
  app.get("/newArticle/:article_id", isLoggedIn, newArticle.edit);
  app.get("/articles/:article_id", article.index);
  app.get("/articles/:article_id/attachments/:attachment_id", article.attachment);
  app.post("/articles/:article_id/attachments/:attachment_id/delete", isLoggedIn, validateArticleCsrf, article.removeAttachment);
  app.post("/articles", isLoggedIn, articleUpload.array("attachments", 5), enforceArticleUploadTotalSize, validateArticleCsrf, article.create);
  app.post("/articles/:article_id/attachments", isLoggedIn, articleUpload.array("attachments", 5), enforceArticleUploadTotalSize, validateArticleCsrf, article.uploadAttachment);
  app.post("/articles/:article_id/like", article.like);
  app.post("/articles/:article_id/comment", article.comment);
  app.delete("/articles/:article_id", isLoggedIn, article.remove);
  app.delete(
    "/articles/:article_id/commentdelete",
    isLoggedIn,
    article.removeComment
  );
  app.get("/login", function(req, res) {
    var viewModel;
    viewModel = {
      layout: "auth",
      message: req.flash("error"),
      noSignup: false,
      lama: {}
    };
    Settings.findOne({
      settings_id: settingsID
    }).exec().then(function(settings) {
        if (settings) {
          if (!settings.newUsers) {
            viewModel.noSignup = true;
          }
        }
        Tools.getSettings(viewModel, res, "login");
      }).catch(function(err) {
        console.error("Login settings lookup failed:", err);
        return res.redirect("/login");
      });
  });
  app.get("/signup", isSignup, function(req, res) {
    var viewModel;
    viewModel = {
      message: req.flash("error"),
      layout: "auth",
      lama: {}
    };
    Tools.getSettings(viewModel, res, "signup");
  });
  app.get("/editProfile", isLoggedIn, function(req, res) {
    var viewModel;
    viewModel = {
      user: {},
      layout: "user",
      stats: {
        stat: true
      },
      message: req.flash("error"),
      lama: {}
    };

    if (!isEmpty(req.user)) {
      Tools.loadCurrentUser(req, function(err, user) {
        if (err) {
          console.error("Edit profile user lookup failed:", err);
          return res.redirect("/login");
        }
        viewModel.user = user;
        Tools.getSettings(viewModel, res, "editProfile");
      });
      return;
    }

    Tools.getSettings(viewModel, res, "editProfile");
  });
  app.get("/profile", isLoggedIn, function(req, res) {
    var viewModel;
    viewModel = {
      user: {},
      layout: "user",
      stats: {
        stat: true
      },
      lama: {}
    };

    if (!isEmpty(req.user)) {
      Tools.loadCurrentUser(req, function(err, user) {
        if (err) {
          console.error("Profile user lookup failed:", err);
          return res.redirect("/login");
        }
        viewModel.user = user;
        Tools.getSettings(viewModel, res, "profile");
      });
      return;
    }

    Tools.getSettings(viewModel, res, "profile");
  });
  app.get("/messages", isLoggedIn, messages.index);
  app.get("/messages/compose", isLoggedIn, messages.compose);
  app.get("/messages/read", isLoggedIn, messages.readMessages);
  app.get("/messages/:message_id/attachment", isLoggedIn, messages.attachment);
  app.get("/messages/:message_id", isLoggedIn, messages.read);
  app.post("/logout", function(req, res) {
    if (req.logout) {
      if (req.logout.length > 0) {
        req.logout(function(err) {
          if (err) {
            console.error("Logout error:", err);
          }
          res.redirect("/");
        });
      } else {
        req.logout();
        res.redirect("/");
      }
      return;
    }

    res.redirect("/");
  });

  app.get("/editProfileAdmin/:user_id", isAdmin, async function(req, res) {
    var viewModel;
    var userId = req.params.user_id;
    var cookieOptions = {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production"
    };

    res.clearCookie("cookie_userEmail");
    res.cookie("cookie_userEmail", userId, cookieOptions);
    await storage.setItem("edituser", "/editProfileAdmin/" + userId);
    if (req.isAuthenticated() && req.user.local.admin) {
      viewModel = {
        user: {},
        userAdmin: {},
        message: req.flash("error"),
        stats: {
          stat: true
        },
        admin: {
          edit: true
        },
        layout: "user",
        lama: {}
      };
      User.findOne({
        "local.email": req.params.user_id
      }).lean().exec().then(function(user) {
          if (!user) {
            return res.redirect("/admin");
          }

          if (!isEmpty(req.user)) {
            Tools.loadCurrentUser(req, function(err, reqUser) {
              if (err) {
                console.error("Admin current user lookup failed:", err);
                return res.redirect("/admin");
              }
              viewModel.user = reqUser;
              viewModel.userAdmin = user;
              Tools.getSettings(viewModel, res, "editProfileAdmin");
            });
            return;
          }

          viewModel.userAdmin = user;
          Tools.getSettings(viewModel, res, "editProfileAdmin");
        }).catch(function(err) {
          console.error("Admin edit user lookup failed:", err);
          return res.redirect("/admin");
        });
    } else {
      res.redirect("/login");
    }
  });

  app.post("/settings", isLoggedIn, isAdmin, uploadSettingsIcon, validateSettingsCsrf, settings.edit);
  app.post("/messages", isLoggedIn, uploadMessageAttachment, validateMessageCsrf, messages.send);
  app.post("/messages/:message_id/read", isLoggedIn, messages.markRead);
  app.post("/messages/:message_id/delete", isLoggedIn, messages.remove);

  app.post(
    "/signup",
    passport.authenticate("local-signup", {
      successRedirect: "/home",
      failureRedirect: "/signup",
      badRequestMessage: "Missing username or password.",
      failureFlash: true
    })
  );

  app.post(
    "/admin/users/create",
    isLoggedIn,
    isAdmin,
    passport.authenticate("local-signup", {
      session: false,
      successRedirect: "/admin",
      failureRedirect: "/admin/users/new",
      badRequestMessage: "Missing username or password.",
      failureFlash: true
    })
  );

  app.post(
    "/editProfile",
    isLoggedIn,
    uploadProfileAvatar,
    validateProfileCsrf,
    preserveOptionalPassword,
    function(req, res, next) {
      passport.authenticate("local-edit", function(err, user, info) {
        if (err) {
          console.error("Edit profile authentication failed:", err);
          req.flash("error", "Profile update failed. Please try again.");
          return res.redirect("/editProfile");
        }
        if (!user) {
          if (info && info.message) {
            req.flash("error", info.message);
          }
          return res.redirect("/editProfile");
        }
        return req.logIn(user, function(loginError) {
          if (loginError) {
            console.error("Updated profile login failed:", loginError);
            return res.redirect("/editProfile");
          }
          return res.redirect("/profile");
        });
      })(req, res, next);
    }
  );

  app.post(
    "/editProfileAdmin",
    isAdmin,
    preserveOptionalPassword,
    passport.authenticate("local-edit-admin", {
      successRedirect: "/admin",
      failureRedirect: (await storage.getItem("edituser")) || "/admin",
      badRequestMessage: "Missing username or password.",
      failureFlash: true
    })
  );

  app.post(
    "/login",
    limitAuthenticationAttempts,
    passport.authenticate("local-login", {
      successRedirect: "/home",
      failureRedirect: "/login",
      badRequestMessage: "Missing username or password.",
      failureFlash: true
    })
  );

  function isLoggedIn(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();

    res.redirect("/login");
  }

  function isAdmin(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.local && req.user.local.admin) {
      return next();
    }

    res.redirect("/login");
  }

  function isSignup(req, res, next) {
    Settings.findOne({
      settings_id: settingsID
    }).exec().then(function(settings) {
        if (settings) {
          if (settings.newUsers) {
            return next();
          } else {
            res.redirect("/login");
          }
        } else {
          return next();
        }
      }).catch(function(err) {
        console.error("Signup settings lookup failed:", err);
        return res.redirect("/login");
      });
  }
};
