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
var User = require("../models/user");
var Article = require("../models/article");
var Comment = require("../models/comment");
var Tools = require("../server/tools.js");
var sidebar = require("../helpers/sidebar");
var PropertiesReaderModule = require("properties-reader");
var PropertiesReader = PropertiesReaderModule.default ||
  PropertiesReaderModule.propertiesReader ||
  PropertiesReaderModule;
var properties = PropertiesReader({ sourceFile: "./server/properties.file" }),
  lamaHeader = properties.get("main.lamaTitle"),
  lamaVersion = properties.get("main.version"),
  lamaTwitter = properties.get("main.twitter"),
  lamaFacebook = properties.get("main.facebook"),
  UserModel = require("../models/user");

function isEmpty(value) {
  return (
    (typeof value == "string" && !value.trim()) ||
    typeof value == "undefined" ||
    value === null
  );
}

module.exports = {
  createUserForm: function(req, res) {
    var viewModel = {
      user: {},
      adminCreate: true,
      layout: "auth",
      stats: {
        stat: true
      },
      message: req.flash("error"),
      lama: {}
    };

    Tools.loadCurrentUser(req, function(err, user) {
      if (err) {
        console.error("Admin create user lookup failed:", err);
        return res.redirect("/admin");
      }
      viewModel.user = user;
      Tools.getSettings(viewModel, res, "signup");
    });
  },

  index: function(req, res) {
    var viewModel = { user: {}, lama: {} };
    if (req.isAuthenticated() && req.user.local.admin) {
      viewModel = {
        user: {},
        users: {},
        stats: {
          stat: true
        },
        layout: "user",
        lama: {}
      };

      User.find({}).lean().exec().then(function(users) {
        if (req.user.local.admin) {
          viewModel.users = users;
          if (!isEmpty(req.user)) {
            Tools.loadCurrentUser(req, function(err, user) {
              if (err) {
                console.error("Admin current user lookup failed:", err);
                return res.redirect("/login");
              }
              viewModel.user = user;
              Tools.getSettings(viewModel, res, "admin");
              return;
            });
            return;
          }
          Tools.getSettings(viewModel, res, "admin");
        } else {
          Tools.getSettings(viewModel, res, "home");
        }
      }).catch(function(err) {
        console.error("Admin user list lookup failed:", err);
        return res.redirect("/login");
      });
    } else {
      res.redirect("/login");
    }
  },

  removeUser: function(req, res) {
    var email = String(req.body.userEmail || "").trim().toLowerCase();
    var deleteArticles = req.body.deleteArticles === "delete";

    if (!email) {
      return res.status(400).send("User email is required.");
    }

    if (req.user.local.email === email) {
      return res.status(400).send("You cannot delete your own administrator account.");
    }

    User.findOne({ "local.email": email }).lean().exec().then(function(user) {
      if (!user) {
        return res.redirect("/admin");
      }

      return Article.find({ userID: email }).lean().exec().then(function(articles) {
        var articleIds = articles.map(function(article) {
          return article.articleID;
        });

        var commentQuery = { email: email };
        if (deleteArticles) {
          commentQuery = {
            $or: [{ email: email }, { article_id: { $in: articleIds } }]
          };
        }

        return Comment.deleteMany(commentQuery).then(function() {
          if (deleteArticles) {
            return Article.deleteMany({ userID: email });
          }
        }).then(function() {
          return User.deleteOne({ _id: user._id });
        }).then(function() {
          return res.redirect("/admin");
        });
      });
    }).catch(function(err) {
      console.error("Admin delete user failed:", err);
      return res.redirect("/admin");
    });
  }
};
