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
var fs = require("fs"),
  path = require("path"),
  sidebar = require("../helpers/sidebar"),
  Models = require("../models"),
  UserModel = require("../models/user"),
  md5 = require("MD5");
var Tools = require("../server/tools.js");
var PropertiesReaderModule = require("properties-reader");
var PropertiesReader = PropertiesReaderModule.default ||
  PropertiesReaderModule.propertiesReader ||
  PropertiesReaderModule;
var properties = PropertiesReader({ sourceFile: "./server/properties.file" }),
  lamaHeader = properties.get("main.lamaTitle"),
  lamaVersion = properties.get("main.version"),
  lamaTwitter = properties.get("main.twitter"),
  lamaFacebook = properties.get("main.facebook");
var Filter = require("bad-words"),
  filter = new Filter();
var scripts = [
  {
    script: "/public/js/editScripts.js"
  }
];

function isEmpty(value) {
  return (
    (typeof value == "string" && !value.trim()) ||
    typeof value == "undefined" ||
    value === null
  );
}

module.exports = {
  index: function(req, res) {
    var viewModel;
    if (req.isAuthenticated()) {
      viewModel = {
        article: {},
        user: {},
        comments: [],
        layout: "user",
        scripts: scripts,
        lama: {}
      };
    } else {
      viewModel = {
        article: {},
        comments: [],
        lama: {}
      };
    }

    if (!isEmpty(req.user)) {
      Tools.loadCurrentUser(req, function(err, user) {
        if (err) {
          console.error("Article user lookup failed:", err);
          return res.redirect("/");
        }
        viewModel.user = user;
        Models.Article.findOne(
          {
            articleID: req.params.article_id
          },
          ).lean().exec().then(function(article) {
            if (article) {
              article.views = article.views + 1;
              viewModel.article = article;
              var hydratedArticle = Models.Article.hydrate(article);
              hydratedArticle.markModified("views");
              hydratedArticle.save().catch(function(err) {
                if (err) {
                  console.error("Article view increment failed:", err);
                }
              });

              viewModel.article.timestamp = article.timestamp =
                article.timestamp.getMonth() +
                1 +
                "/" +
                article.timestamp.getDate() +
                "/" +
                article.timestamp.getFullYear();

              Models.Comment.find(
                {
                  article_id: article.articleID
                },
                {},
                {
                  sort: {
                    timestamp: 1
                  }
                },
                ).lean().exec().then(function(comments) {
                  viewModel.comments = comments;
                  sidebar(viewModel, function(viewModel) {
                    if (
                      (req.isAuthenticated() &&
                        article.userID == req.user.local.email) ||
                      (req.isAuthenticated() && req.user.local.admin)
                    ) {
                      Tools.getSettings(viewModel, res, "article");
                    } else {
                      Tools.getSettings(viewModel, res, "articlepublic");
                    }
                  });
                });
            } else {
              res.redirect("/");
            }
          }).catch(function(err) {
            console.error("Article lookup failed:", err);
            return res.redirect("/");
          });
      });
      return;
    }

    Models.Article.findOne(
      {
        articleID: req.params.article_id
      },
      ).lean().exec().then(function(article) {
        if (article) {
          article.views = article.views + 1;
          viewModel.article = article;
          var hydratedArticle = Models.Article.hydrate(article);
          hydratedArticle.markModified("views");
          hydratedArticle.save().catch(function(err) {
            if (err) {
              console.error("Article view increment failed:", err);
            }
          });

          viewModel.article.timestamp = article.timestamp =
            article.timestamp.getMonth() +
            1 +
            "/" +
            article.timestamp.getDate() +
            "/" +
            article.timestamp.getFullYear();

          Models.Comment.find(
            {
              article_id: article.articleID
            },
            {},
            {
              sort: {
                timestamp: 1
              }
            },
            ).lean().exec().then(function(comments) {
              viewModel.comments = comments;
              //viewModel.user = JSON.stringify(req.user);
              sidebar(viewModel, function(viewModel) {
                if (
                  (req.isAuthenticated() &&
                    article.userID == req.user.local.email) ||
                  (req.isAuthenticated() && req.user.local.admin)
                ) {
                  Tools.getSettings(viewModel, res, "article");
                } else {
                  Tools.getSettings(viewModel, res, "articlepublic");
                }
              });
            });
        } else {
          res.redirect("/");
        }
      }).catch(function(err) {
        console.error("Article lookup failed:", err);
        return res.redirect("/");
      });
  },
  create: function(req, res) {
    var savePost = function() {
      var possible = "abcdefghijklmnopqrstuvwxyz0123456789",
        postUrl = "";

      for (var i = 0; i < 6; i += 1) {
        postUrl += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      var articleQuery = {
        articleID: req.body.editBlogID
      };
      if (!req.user.local.admin) {
        articleQuery.userID = req.user.local.email;
      }

      Models.Article.findOneAndUpdate(
        articleQuery,
        {
          $set: {
            title: req.body.title,
            description: req.body.description,
            blogbody: req.body.blogbody
          }
        }
      ).then(function(exArticle) {
          if (exArticle) {
            return res.redirect("/articles/" + exArticle.articleID);
          }
          return Models.Article.find({ articleID: postUrl }).exec().then(function(articles) {
            if (articles.length > 0) {
              return savePost();
            }
            if (req.body.blogbody == undefined) {
              return res.redirect("/home");
            }

            var newPost = new Models.Article({
              title: req.body.title,
              articleID: postUrl,
              description: req.body.description,
              blogbody: req.body.blogbody,
              userID: req.user.local.email,
              userName: req.user.local.name
            });
            return newPost.save().then(function(article) {
              res.redirect("/articles/" + article.articleID);
            });
          });
        }).catch(function(err) {
          console.error("Article update failed:", err);
          return res.redirect("/home");
        });
    };

    savePost();
  },
  like: function(req, res) {
    Models.Article.findOne(
      {
        articleID: req.params.article_id
      }
    ).exec().then(function(article) {
        if (article) {
          article.likes = article.likes + 1;
          article.save().then(function() {
            res.json({
              likes: article.likes
            });
          }).catch(function(err) {
            res.json(err);
          });
        }
      }).catch(function(err) {
        res.json(err);
      });
  },
  comment: function(req, res) {
    Models.Article.findOne(
      {
        articleID: req.params.article_id
      }
    ).exec().then(function(article) {
        if (article) {
          function isEmpty(value) {
            return (
              (typeof value == "string" && !value.trim()) ||
              typeof value == "undefined" ||
              value === null
            );
          }
          var newComment = new Models.Comment(req.body);
          if (!isEmpty(req.body.name)) {
            newComment.name = filter.clean(req.body.name);
          }

          if (!isEmpty(req.body.email)) {
            newComment.email = filter.clean(req.body.email);
          }
          if (!isEmpty(req.body.comment)) {
            newComment.comment = filter.clean(req.body.comment);
          }
          newComment.gravatar = md5(newComment.email);
          newComment.article_id = article.articleID;
          newComment.save().then(function(comment) {
            res.redirect(
              "/articles/" + article.articleID + "#" + comment.article_id
            );
          }).catch(function(err) {
            console.error("Comment save failed:", err);
            return res.redirect("/articles/" + article.articleID);
          });
        } else {
          res.redirect("/");
        }
      }).catch(function() {
        return res.redirect("/");
      });
  },
  remove: function(req, res) {
    var articleQuery = {
      articleID: req.params.article_id
    };
    if (!req.user.local.admin) {
      articleQuery.userID = req.user.local.email;
    }

    Models.Article.findOne(
      articleQuery,
      ).exec().then(function(article) {
        if (article) {
          Models.Comment.deleteMany(
            {
              article_id: article.articleID
            }
            ).then(function() {
              return article.deleteOne();
            }).then(function() {
              res.json(true);
            }).catch(function() {
              res.json(false);
            });
        } else {
          res.redirect("back");
        }
      }).catch(function() {
        return res.json(false);
      });
  },

  removeComment: function(req, res) {
    var commentId = req.params.article_id;
    var match = {};

    if (/^[a-fA-F0-9]{24}$/.test(commentId)) {
      match._id = commentId;
    } else if (commentId) {
      match.timestamp = new Date(commentId);
    }

    Models.Comment.findOne(match).exec().then(function(comment) {
      if (!comment) {
        return res.redirect("back");
      }

      return Models.Article.findOne(
        {
          articleID: comment.article_id
        }
        ).exec().then(function(article) {
          var canDelete =
            req.user.local.admin ||
            (article && article.userID === req.user.local.email) ||
            comment.email === req.user.local.email;
          if (!canDelete) {
            return res.status(403).json(false);
          }

          return Models.Comment.deleteOne(
            {
              _id: comment._id
            }
            ).then(function() {
              return res.json(true);
            });
        });
    }).catch(function() {
      return res.json(false);
    });
  }
};
