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

var LocalStrategy = require("passport-local").Strategy;
var passport = require("passport");
var User = require("../models/user");
var Article = require("../models/article");

function socialUrl(value) {
  var url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

module.exports = function(passport) {
  // =========================================================================
  // passport session setup ==================================================
  // =========================================================================

  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(async function(id, done) {
    try {
      done(null, await User.findById(id));
    } catch (err) {
      done(err);
    }
  });

  // =========================================================================
  // LOCAL SIGNUP ============================================================
  // =========================================================================

  passport.use(
    "local-signup",
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
        passReqToCallback: true
      },
      async function(req, email, password, done, name) {
        try {
          email = String(email || "").trim().toLowerCase();

          var adminCount = await User.countDocuments({ "local.admin": true });
          var user = await User.findOne({ "local.email": email });
          if (user) {
            return done(null, false, {
              message: "That email is already taken."
            });
          }

          var newUser = new User();
          newUser.local.email = email;
          newUser.local.password = newUser.generateHash(password);
          newUser.local.name = req.body.name;
          newUser.local.admin = adminCount === 0;
          newUser.markModified("local");
          await newUser.save();
          return done(null, newUser);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // =========================================================================
  // LOCAL EDIT ============================================================
  // =========================================================================

  passport.use(
    "local-edit",
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
        passReqToCallback: true
      },
      async function(req, email, password, done, name) {
        try {
          email = String(email || "").trim().toLowerCase();
          var currentEmail = req.user && req.user.local ? String(req.user.local.email || "").trim().toLowerCase() : null;

          if (!currentEmail) {
            return done(null, false, {
              message: "Session expired."
            });
          }

          var existingUser = await User.findOne({ "local.email": email });
          if (existingUser && existingUser.local.email !== currentEmail) {
            return done(null, false, {
              message: "That email is already taken."
            });
          }

          var user = await User.findOne({ "local.email": currentEmail });
          if (!user) {
            return done(null, false, { message: "User not found." });
          }

          var oldEmail = user.local.email;
          var newName = req.body.name || user.local.name;
          user.local.email = email;
          user.local.name = newName;
          user.local.xUrl = socialUrl(req.body.xUrl);
          user.local.facebookUrl = socialUrl(req.body.facebookUrl);
          if (req.body.useDefaultAvatar === "on") {
            user.local.avatarData = undefined;
            user.local.avatarContentType = undefined;
          } else if (req.file) {
            user.local.avatarData = req.file.buffer;
            user.local.avatarContentType = req.file.mimetype;
          }
          var newPassword = req.body.newPassword;
          if (newPassword && newPassword !== "") {
            user.local.password = user.generateHash(newPassword);
          }

          await user.save();
          await Article.updateMany(
            { userID: oldEmail },
            { $set: { userID: email, userName: newName } }
          );
          return done(null, user);
        } catch (err) {
          console.error("Local profile update failed:", err);
          return done(err);
        }
      }
    )
  );

  // =========================================================================
  // LOCAL EDIT_ADMIN ============================================================
  // =========================================================================

  passport.use(
    "local-edit-admin",
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
        passReqToCallback: true
      },
      async function(req, email, password, done, name, admin) {
        try {
          email = String(email || "").trim().toLowerCase();
          var targetEmail = req.cookies && req.cookies.cookie_userEmail ? String(req.cookies.cookie_userEmail).trim().toLowerCase() : null;

          if (!targetEmail) {
            return done(null, false, {
              message: "No user selected."
            });
          }

          var existingUser = await User.findOne({ "local.email": email });
          if (existingUser && existingUser.local.email !== targetEmail) {
            return done(null, false, {
              message: "That email is already taken."
            });
          }

          var user = await User.findOne({ "local.email": targetEmail });
          if (!user) {
            return done(null, false, { message: "User not found." });
          }

          var oldEmail = user.local.email;
          var newName = req.body.name || user.local.name;
          user.local.email = email;
          user.local.name = newName;
          var newAdminPassword = req.body.newPassword;
          if (newAdminPassword && newAdminPassword !== "") {
            user.local.password = user.generateHash(newAdminPassword);
          }
          user.local.admin = req.body.admin === "on";

          await user.save();
          await Article.updateMany(
            { userID: oldEmail },
            { $set: { userID: email, userName: newName } }
          );
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // =========================================================================
  // LOCAL LOGIN =============================================================
  // =========================================================================

  passport.use(
    "local-login",
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
        passReqToCallback: true
      },
      async function(req, email, password, done) {
        email = String(email || "").trim().toLowerCase();

        try {
          var user = await User.findOne({ "local.email": email });
          if (!user) {
            return done(null, false, { message: "No user found." });
          }
          if (!user.validPassword(password)) {
            return done(null, false, { message: "Oops! Wrong password." });
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
};
