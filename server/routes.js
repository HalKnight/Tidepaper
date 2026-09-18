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
    fileSize: 5 * 1024 * 1024
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
    files: 5
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

function isEmpty(value) {
  return (
    (typeof value == "string" && !value.trim()) ||
    typeof value == "undefined" ||
    value === null
  );
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
  app.get("/home", home.index);
  app.get("/home/:article_id/searchbyauthor", home.author);
  app.get("/home/searchbydate", home.date);
  app.get("/admin", isLoggedIn, admin.index);
  app.get("/admin/users/new", isLoggedIn, isAdmin, admin.createUserForm);
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
  app.post("/articles", isLoggedIn, articleUpload.array("attachments", 5), validateArticleCsrf, article.create);
  app.post("/articles/:article_id/attachments", isLoggedIn, articleUpload.array("attachments", 5), validateArticleCsrf, article.uploadAttachment);
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

  app.post("/settings", isLoggedIn, isAdmin, settings.edit);
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
    passport.authenticate("local-edit", {
      successRedirect: "/profile",
      failureRedirect: "/editProfile",
      badRequestMessage: "Missing username or password.",
      failureFlash: true
    })
  );

  app.post(
    "/editProfileAdmin",
    isAdmin,
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
