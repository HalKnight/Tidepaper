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

module.exports = function(passport) {
  // =========================================================================
  // passport session setup ==================================================
  // =========================================================================

  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
    });
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
      function(req, email, password, done, name) {
        process.nextTick(function() {
          email = String(email || "").trim().toLowerCase();

          User.countDocuments(
            {
              "local.admin": true
            },
            function(err, adminCount) {
              if (err) return done(err);

              User.findOne(
                {
                  "local.email": email
                },
                function(err, user) {
                  if (err) return done(err);

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

                  try {
                    newUser.save(function(err) {
                      if (err) {
                        return done(err);
                      }
                      return done(null, newUser);
                    });
                  } catch (err) {
                    return done(err);
                  }
                }
              );
            }
          );
        });
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
      function(req, email, password, done, name) {
        process.nextTick(function() {
          email = String(email || "").trim().toLowerCase();
          var currentEmail = req.user && req.user.local ? String(req.user.local.email || "").trim().toLowerCase() : null;

          if (!currentEmail) {
            return done(null, false, {
              message: "Session expired."
            });
          }

          User.findOne(
            {
              "local.email": email
            },
            function(err, existingUser) {
              if (err) return done(err);
              if (existingUser && existingUser.local.email !== currentEmail) {
                return done(null, false, {
                  message: "That email is already taken."
                });
              }

              User.findOne(
                {
                  "local.email": currentEmail
                },
                function(err, user) {
                  if (err) return done(err);
                  if (!user) {
                    return done(null, false, {
                      message: "User not found."
                    });
                  }

                  var oldEmail = user.local.email;
                  var newName = req.body.name || user.local.name;
                  user.local.email = email;
                  user.local.name = newName;
                  if (password && password !== "") {
                    user.local.password = user.generateHash(password);
                  }

                  user.save(function(err) {
                    if (err) return done(err);

                    Article.updateMany(
                      {
                        userID: oldEmail
                      },
                      {
                        $set: {
                          userID: email,
                          userName: newName
                        }
                      },
                      function(err) {
                        if (err) return done(err);
                        return done(null, user);
                      }
                    );
                  });
                }
              );
            }
          );
        });
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
      function(req, email, password, done, name, admin) {
        process.nextTick(function() {
          email = String(email || "").trim().toLowerCase();
          var targetEmail = req.cookies && req.cookies.cookie_userEmail ? String(req.cookies.cookie_userEmail).trim().toLowerCase() : null;

          if (!targetEmail) {
            return done(null, false, {
              message: "No user selected."
            });
          }

          User.findOne(
            {
              "local.email": email
            },
            function(err, existingUser) {
              if (err) return done(err);
              if (existingUser && existingUser.local.email !== targetEmail) {
                return done(null, false, {
                  message: "That email is already taken."
                });
              }

              User.findOne(
                {
                  "local.email": targetEmail
                },
                function(err, user) {
                  if (err) return done(err);
                  if (!user) {
                    return done(null, false, {
                      message: "User not found."
                    });
                  }

                  var oldEmail = user.local.email;
                  var newName = req.body.name || user.local.name;
                  user.local.email = email;
                  user.local.name = newName;
                  if (password && password !== "") {
                    user.local.password = user.generateHash(password);
                  }
                  user.local.admin = req.body.admin === "on";

                  user.save(function(err) {
                    if (err) return done(err);

                    Article.updateMany(
                      {
                        userID: oldEmail
                      },
                      {
                        $set: {
                          userID: email,
                          userName: newName
                        }
                      },
                      function(err) {
                        if (err) return done(err);
                        return done(null, user);
                      }
                    );
                  });
                }
              );
            }
          );
        });
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
      function(req, email, password, done) {
        email = String(email || "").trim().toLowerCase();

        User.findOne(
          {
            "local.email": email
          },
          function(err, user) {
            if (err) return done(err);

            if (!user) {
              return done(null, false, {
                message: "No user found."
              });
            }
            if (!user.validPassword(password))
              return done(null, false, {
                message: "Oops! Wrong password."
              });
            return done(null, user);
          }
        );
      }
    )
  );
};
