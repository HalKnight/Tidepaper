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
var sidebar = require("../helpers/sidebar"),
  ArticleModel = require("../models").Article,
  CommentModel = require("../models").Comment,
  ArticleAttachmentModel = require("../models").ArticleAttachment,
  UserModel = require("../models/user"),
  Tools = require("../server/tools.js"),
  SettingsModel = require("../models/settings"),
  PropertiesReaderModule = require("properties-reader"),
  PropertiesReader = PropertiesReaderModule.default ||
    PropertiesReaderModule.propertiesReader ||
    PropertiesReaderModule,
  properties = PropertiesReader({ sourceFile: "./server/properties.file" }),
  lamaHeader = properties.get("main.lamaTitle"),
  lamaVersion = properties.get("main.version"),
  settingsID = properties.get("admin.settingsID"),
  lamaTwitter = properties.get("main.twitter"),
  lamaFacebook = properties.get("main.facebook"),
  async = require("async");

function isEmpty(value) {
  return (
    (typeof value == "string" && !value.trim()) ||
    typeof value == "undefined" ||
    value === null
  );
}

function attachArticleComments(articles) {
  if (!CommentModel || !articles.length) {
    return Promise.resolve(articles);
  }

  var articleIds = articles.map(function(article) {
    return article.articleID;
  });

  return CommentModel.find({
    article_id: {
      $in: articleIds
    }
  }).lean().exec().then(function(comments) {
    var commentsByArticle = {};
    (comments || []).forEach(function(comment) {
      if (!commentsByArticle[comment.article_id]) {
        commentsByArticle[comment.article_id] = [];
      }
      commentsByArticle[comment.article_id].push(comment);
    });

    articles.forEach(function(article) {
      article.comments = commentsByArticle[article.articleID] || [];
    });
    return articles;
  });
}

function attachArticleAttachments(articles) {
  if (!ArticleAttachmentModel || !articles.length) {
    return Promise.resolve(articles);
  }

  var articleIds = articles.map(function(article) {
    return article.articleID;
  });

  return ArticleAttachmentModel.find({
    articleID: {
      $in: articleIds
    }
  }).lean().exec().then(function(attachments) {
    var attachmentsByArticle = {};
    (attachments || []).forEach(function(attachment) {
      if (!attachmentsByArticle[attachment.articleID]) {
        attachmentsByArticle[attachment.articleID] = [];
      }
      attachmentsByArticle[attachment.articleID].push(attachment);
    });

    articles.forEach(function(article) {
      article.attachments = attachmentsByArticle[article.articleID] || [];
    });
    return articles;
  });
}

module.exports = {
  index: function(req, res) {
    var viewModel;
    if (req.isAuthenticated()) {
      viewModel = {
        articles: {},
        user: {},
        layout: "user",
        lama: {}
      };
    } else {
      viewModel = {
        articles: {},
        lama: {}
      };
    }

    var articleQuery = {
      $nor: [
        { private: true },
        { private: "true" }
      ]
    };
    return ArticleModel.find(
      articleQuery,
      {},
      {
        sort: {
          timestamp: -1
        }
      }
    ).lean().exec().then(function(articles) {
        if (!articles) {
          articles = [];
        }

        var userEmails = articles
          .filter(function(article) {
            return article && article.userID;
          })
          .map(function(article) {
            return String(article.userID).trim().toLowerCase();
          });

        var userNameMap = {};
        var populateUserNames = userEmails.length
          ? UserModel.find({
              "local.email": {
                $in: userEmails
              }
            }).lean().exec().then(function(users) {
              users = users || [];
              users.forEach(function(user) {
                if (user && user.local && user.local.email) {
                  userNameMap[String(user.local.email).trim().toLowerCase()] = user.local.name || user.local.email;
                }
              });
              return true;
            })
          : Promise.resolve(true);

        return populateUserNames.then(function() {
          articles.forEach(function(element) {
            if (element && element.timestamp) {
              element.timestamp =
                element.timestamp.getMonth() +
                1 +
                "/" +
                element.timestamp.getDate() +
                "/" +
                element.timestamp.getFullYear();
            }

            if (element && element.userID) {
              var key = String(element.userID).trim().toLowerCase();
              element.userName = userNameMap[key] || element.userName || element.userID;
            }
          });

          return articles;
        }).then(attachArticleComments).then(attachArticleAttachments);
      }).then(function(articles) {
        var finishHome = function() {
          viewModel.articles = articles;
          sidebar(viewModel, function(viewModel) {
            Tools.getSettings(viewModel, res, "home");
          });
        };

        if (!isEmpty(req.user)) {
          Tools.loadCurrentUser(req, function(err, user) {
            if (err) {
              console.error("Home user lookup failed:", err);
              return res.redirect("/home");
            }
            viewModel.user = user;
            finishHome();
          });
          return;
        }

        finishHome();
      }).catch(function(err) {
        console.error("Home article lookup failed:", err);
        return res.redirect("/home");
      });
  },

  userHome: function(req, res) {
    var viewModel;
    var userId = String(req.params.user_id || "").trim();

    if (!userId) {
      return res.redirect("/home");
    }

    if (req.isAuthenticated()) {
      viewModel = {
        articles: {},
        user: {},
        layout: "user",
        userHome: {
          email: userId
        },
        lama: {}
      };
    } else {
      viewModel = {
        articles: {},
        userHome: {
          email: userId
        },
        lama: {}
      };
    }

    return UserModel.findOne({
      "local.email": userId
    }).lean().exec().then(function(user) {
      if (user && user.local && user.local.name) {
        viewModel.userHome.name = user.local.name;
      }

      return ArticleModel.find(
        {
          userID: userId
        },
        {},
        {
          sort: {
            timestamp: -1
          }
        }
      ).lean().exec();
    }).then(function(articles) {
      if (!articles) {
        articles = [];
      }

      articles.forEach(function(element) {
        if (element && element.timestamp) {
          element.timestamp =
            element.timestamp.getMonth() +
            1 +
            "/" +
            element.timestamp.getDate() +
            "/" +
            element.timestamp.getFullYear();
        }
      });

      return attachArticleComments(articles).then(attachArticleAttachments);
    }).then(function(articles) {

      var finishUserHome = function() {
        viewModel.articles = articles;
        sidebar(viewModel, function(model) {
          Tools.getSettings(model, res, "home");
        });
      };

      if (!isEmpty(req.user)) {
        return new Promise(function(resolve, reject) {
          Tools.loadCurrentUser(req, function(err, user) {
            if (err) {
              console.error("User home user lookup failed:", err);
              return reject(new Error("User home user lookup failed"));
            }
            viewModel.user = user;
            finishUserHome();
            resolve();
          });
        });
      }

      finishUserHome();
    }).catch(function(err) {
      console.error("User home article lookup failed:", err);
      return res.redirect("/home");
    });
  },

  author: function(req, res) {
    var viewModel;
    if (req.isAuthenticated()) {
      viewModel = {
        article: {},
        user: {},
        layout: "user",
        lama: {}
      };
    } else {
      viewModel = {
        article: {},
        lama: {}
      };
    }

    ArticleModel.find(
      {
        userName: new RegExp(req.params.article_id, "i"),
        private: { $ne: true }
      },
      {},
      {
        sort: {
          timestamp: -1
        }
      }
    ).lean().exec().then(attachArticleComments).then(attachArticleAttachments).then(function(articles) {
        if (!articles) {
          articles = [];
        }

        var finishHome = function() {
          viewModel.articles = articles;
          sidebar(viewModel, function(viewModel) {
            Tools.getSettings(viewModel, res, "home");
          });
        };

        if (!isEmpty(req.user)) {
          Tools.loadCurrentUser(req, function(err, user) {
            if (err) {
              console.error("Author user lookup failed:", err);
              return res.redirect("/home");
            }
            viewModel.user = user;
            finishHome();
          });
          return;
        }

        finishHome();
      }).catch(function(err) {
        console.error("Author search failed:", err);
        return res.redirect("/home");
      });
  },

  date: function(req, res) {
    var from = req.query.from;
    var to = req.query.to;
    var datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(from || "") || !datePattern.test(to || "")) {
      return res.redirect("/home");
    }

    var startDate = new Date(from + "T00:00:00.000Z");
    var endDate = new Date(to + "T00:00:00.000Z");
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
      return res.redirect("/home");
    }

    var viewModel = req.isAuthenticated()
      ? { articles: {}, user: {}, layout: "user", lama: {} }
      : { articles: {}, lama: {} };

    ArticleModel.find(
      {
        timestamp: {
          $gte: startDate,
          $lt: endDate
        },
        private: { $ne: true }
      },
      {},
      { sort: { timestamp: -1 } },
    ).lean().exec().then(attachArticleComments).then(attachArticleAttachments).then(function(articles) {
        articles = articles || [];
        articles.forEach(function(article) {
          if (article && article.timestamp) {
            article.timestamp =
              article.timestamp.getMonth() +
              1 +
              "/" +
              article.timestamp.getDate() +
              "/" +
              article.timestamp.getFullYear();
          }
        });

        var finishSearch = function() {
          viewModel.articles = articles;
          sidebar(viewModel, function(model) {
            Tools.getSettings(model, res, "home");
          });
        };

        if (!isEmpty(req.user)) {
          Tools.loadCurrentUser(req, function(err, user) {
            if (err) {
              console.error("Date search user lookup failed:", err);
              return res.redirect("/home");
            }
            viewModel.user = user;
            finishSearch();
          });
          return;
        }

        finishSearch();
      }).catch(function(err) {
        console.error("Date search failed:", err);
        return res.redirect("/home");
      });
  }
};
