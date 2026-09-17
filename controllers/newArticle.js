/*
MIT License
        if (!article) {
          return res.redirect("/");
        }
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
  UserModel = require("../models/user");
var Tools = require("../server/tools.js");
var scripts = [
  {
    script: "/public/js/editScripts.js"
  }
];
var PropertiesReaderModule = require("properties-reader");
var PropertiesReader = PropertiesReaderModule.default ||
  PropertiesReaderModule.propertiesReader ||
  PropertiesReaderModule;
var properties = PropertiesReader({ sourceFile: "./server/properties.file" }),
  lamaHeader = properties.get("main.lamaTitle"),
  lamaVersion = properties.get("main.version"),
  lamaTwitter = properties.get("main.twitter"),
  lamaFacebook = properties.get("main.facebook");

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
        stats: {
          stat: true
        },
        layout: "user",
        scripts: scripts,
        lama: {}
      };
    } else {
      viewModel = {
        article: {},
        lama: {}
      };
    }

    if (!isEmpty(req.user)) {
      Tools.loadCurrentUser(req, function(err, user) {
        if (err) {
          console.error("New article user lookup failed:", err);
          return res.redirect("/");
        }
        viewModel.user = user;
        if (req.isAuthenticated()) {
          Tools.getSettings(viewModel, res, "newArticle");
        } else {
          res.redirect("/");
        }
        return;
      });
      return;
    }

    if (req.isAuthenticated()) {
      Tools.getSettings(viewModel, res, "newArticle");
    } else {
      res.redirect("/");
    }
  },

  edit: function(req, res) {
    var viewModel;
    if (req.isAuthenticated()) {
      viewModel = {
        article: {},
        user: {},
        stats: {
          stat: true
        },
        layout: "user",
        scripts: scripts,
        lama: {}
      };
    } else {
      viewModel = {
        article: {},
        lama: {}
      };
    }

    ArticleModel.findOne(
      {
        articleID: {
          $eq: req.params.article_id
        }
      },
      ).lean().exec().then(function(article) {
        if (!article) {
          return res.redirect("/");
        }

        viewModel.article = article;
        sidebar(viewModel, function(viewModel) {
          if (req.isAuthenticated()) {
            Tools.getSettings(viewModel, res, "newArticle");
          } else {
            res.redirect("/");
          }
        });
      }).catch(function(err) {
        console.error("Article edit lookup failed:", err);
        return res.redirect("/");
      });
  }
};
