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
  fs = require("fs"),
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
  MongoStoreModule = require("connect-mongo"),
  passport = require("passport"),
  LocalStrategy = require("passport-local"),
  flash = require("connect-flash"),
  PropertiesReaderModule = require("properties-reader"),
  PropertiesReader = PropertiesReaderModule.default ||
    PropertiesReaderModule.propertiesReader ||
    PropertiesReaderModule;

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
        avatarUrl: function(email) {
          // Guard against an empty segment (e.g. anonymous comments with no email),
          // which would not match the /users/avatar/:email route.
          return "/users/avatar/" + encodeURIComponent(String(email || "").trim() || "guest");
        },
        themeFontUrl: function(theme) {
          var fontsByTheme = {
            cyborg: "https://fonts.googleapis.com/css?family=Roboto:400,700",
            flatly: "https://fonts.googleapis.com/css?family=Lato:400,700,400italic",
            readable: "https://fonts.googleapis.com/css?family=Raleway:400,700",
            solar: "https://fonts.googleapis.com/css?family=Source+Sans+Pro:300,400,700",
            united: "https://fonts.googleapis.com/css?family=Ubuntu:400,700"
          };
          return fontsByTheme[theme] || "";
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

  app.use("/public/", express.static(path.join(__dirname, "../public"), {
    // Bundled assets are versioned with a "?v=" query string on release, so they
    // can be cached for a long time; admin-replaceable uploads are not versioned
    // and could go stale in place, so they keep a much shorter cache lifetime.
    maxAge: "1y",
    immutable: true,
    setHeaders: function(res, filePath) {
      if (/[\\/]upload[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    }
  }));

  var isProduction = app.get("env") === "production";
  var localPropertiesPath = path.join(__dirname, "properties.local.file");
  var localProperties = fs.existsSync(localPropertiesPath)
    ? PropertiesReader({ sourceFile: localPropertiesPath })
    : null;
  var cookieSecret =
    process.env.COOKIE_SECRET ||
    (localProperties && localProperties.get("security.cookieSecret"));
  var sessionSecret =
    process.env.SESSION_SECRET ||
    (localProperties && localProperties.get("security.sessionSecret"));
  var mongoUri =
    process.env.MONGODB_URI ||
    (localProperties && localProperties.get("database.mongoUri"));

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  if (isProduction && (!cookieSecret || !sessionSecret)) {
    throw new Error("COOKIE_SECRET and SESSION_SECRET are required in production.");
  }

  app.use(cookieParser(cookieSecret || "local-development-cookie-secret"));

  var MongoStore = MongoStoreModule.MongoStore || MongoStoreModule.default || MongoStoreModule;
  var sessionStore = MongoStore && typeof MongoStore.create === "function"
    ? MongoStore.create({
        mongoUrl: mongoUri,
        collectionName: "sessions",
        ttl: 14 * 24 * 60 * 60,
        autoRemove: "native",
        stringify: false
      })
    : new MongoStore({
        mongoUrl: mongoUri,
        collectionName: "sessions",
        ttl: 14 * 24 * 60 * 60,
        autoRemove: "native",
        stringify: false
      });

  app.use(
    session({
      store: sessionStore,
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

    var isMultipartUpload = String(req.get("content-type") || "").indexOf("multipart/form-data") === 0;
    var isMessageUpload = req.method === "POST" && req.path === "/messages";
    var isArticleCreate = req.method === "POST" && req.path === "/articles";
    var isArticleUpload = req.method === "POST" && /\/articles\/[^/]+\/attachments$/.test(req.path);
    var isSettingsUpload = req.method === "POST" && req.path === "/settings";
    var isProfileUpload = req.method === "POST" && req.path === "/editProfile";
    if (isMultipartUpload && (isMessageUpload || isArticleCreate || isArticleUpload || isSettingsUpload || isProfileUpload)) {
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

  app.use(function(err, req, res, next) {
    console.error("Unhandled request error:", err);
    next(err);
  });

  if ("development" === app.get("env")) {
    app.use(errorHandler());
  }

  return app;
};
