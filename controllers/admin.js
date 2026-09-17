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
var PropertiesReader = require("properties-reader");
var properties = PropertiesReader("./server/properties.file"),
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

      User.find({}, function(err, users) {
        if (err) {
          console.error("Admin user list lookup failed:", err);
          return res.redirect("/login");
        }
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
      }).lean();
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

    User.findOne({ "local.email": email }, function(err, user) {
      if (err) {
        console.error("Admin delete user lookup failed:", err);
        return res.redirect("/admin");
      }

      if (!user) {
        return res.redirect("/admin");
      }

      Article.find({ userID: email }, function(err, articles) {
        if (err) {
          console.error("Admin delete user article lookup failed:", err);
          return res.redirect("/admin");
        }

        var articleIds = articles.map(function(article) {
          return article.articleID;
        });

        var commentQuery = { email: email };
        if (deleteArticles) {
          commentQuery = {
            $or: [{ email: email }, { article_id: { $in: articleIds } }]
          };
        }

        Comment.deleteMany(commentQuery, function(err) {
            if (err) {
              console.error("Admin delete user comments failed:", err);
              return res.redirect("/admin");
            }

            var finishDelete = function() {
              User.deleteOne({ _id: user._id }, function(err) {
                if (err) {
                  console.error("Admin delete user failed:", err);
                }
                return res.redirect("/admin");
              });
            };

            if (!deleteArticles) {
              return finishDelete();
            }

            Article.deleteMany({ userID: email }, function(err) {
              if (err) {
                console.error("Admin delete user articles failed:", err);
                return res.redirect("/admin");
              }
              finishDelete();
            });
          });
      }).lean();
    }).lean();
  }
};
