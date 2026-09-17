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
var path = require("path"),
  crypto = require("crypto"),
  routes = require("./routes"),
  exphbs = require("express-handlebars"),
  express = require("express"),
  bodyParser = require("body-parser"),
  cookieParser = require("cookie-parser"),
  morgan = require("morgan"),
  methodOverride = require("method-override"),
  errorHandler = require("errorhandler"),
  moment = require("moment"),
  session = require("express-session"),
  passport = require("passport"),
  LocalStrategy = require("passport-local"),
  flash = require("connect-flash");

module.exports = function(app) {
  app.engine(
    "handlebars",
    exphbs.create({
      defaultLayout: "main",
      layoutsDir: app.get("views") + "/layouts",
      partialsDir: [app.get("views") + "/partials"],
      helpers: {
        timeago: function(timestamp) {
          return moment(timestamp)
            .startOf("minute")
            .fromNow();
        },
        eq: function(value1, value2) {
          if (value1 == value2) {
            return true;
          } else {
            return false;
          }
        },
        allowProtoMethodsByDefault: true,
        allowProtoPropertiesByDefault: true,
        allowedProtoMethods: true
      }
    }).engine
  );

  app.set("view engine", "handlebars");

  app.use(morgan("dev"));
  app.use(
    bodyParser.urlencoded({
      extended: false
    })
  );
  app.use(bodyParser.json());
  app.use(methodOverride());

  app.use("/public/", express.static(path.join(__dirname, "../public")));

  var isProduction = app.get("env") === "production";
  var cookieSecret = process.env.COOKIE_SECRET || process.env.SESSION_SECRET;
  var sessionSecret = process.env.SESSION_SECRET;

  if (isProduction && (!cookieSecret || !sessionSecret)) {
    throw new Error("COOKIE_SECRET and SESSION_SECRET are required in production.");
  }

  app.use(cookieParser(cookieSecret || "local-development-cookie-secret"));

  app.use(
    session({
      secret: sessionSecret || "local-development-session-secret",
      saveUninitialized: false,
      resave: false,
      cookie: {
        path: "/",
        httpOnly: true,
        secure: isProduction,
        maxAge: null,
        sameSite: isProduction ? "none" : "lax"
      }
    })
  );
  if (isProduction) {
    app.set("trust proxy", 1);
  }
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(flash());
  app.use(function(req, res, next) {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
  });
  app.use(function(req, res, next) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return next();
    }

    var submittedToken = req.body && req.body._csrf || req.get("x-csrf-token");
    var expectedToken = req.session && req.session.csrfToken;
    if (!submittedToken || !expectedToken || submittedToken !== expectedToken) {
      return res.status(403).send("Invalid CSRF token.");
    }
    next();
  });
  app.use(function(req, res, next) {
    res.locals.success_messages = req.flash("success_messages");
    res.locals.error_messages = req.flash("error_messages");
    next();
  });

  routes.initialize(app, passport);

  if ("development" === app.get("env")) {
    app.use(errorHandler());
  }

  return app;
};
