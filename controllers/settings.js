/*
MIT License
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
var Settings = require("../models/settings");
var Tools = require("../server/tools.js");
var PropertiesReaderModule = require("properties-reader");
var PropertiesReader = PropertiesReaderModule.default ||
  PropertiesReaderModule.propertiesReader ||
  PropertiesReaderModule;
var properties = PropertiesReader({ sourceFile: "./server/properties.file" }),
  lamaHeader = properties.get("main.lamaTitle"),
  lamaVersion = properties.get("main.version"),
  settingsID = properties.get("admin.settingsID"),
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

function normalizeTidepaperUrl(value) {
  var url = String(value || "").trim();
  return url || "/home";
}

function normalizeTidepaperIconUrl(value) {
  if (Array.isArray(value)) {
    value = value[value.length - 1];
  }
  var url = String(value || "").trim();
  if (/^public\//i.test(url)) {
    url = "/" + url;
  } else if (/^upload\//i.test(url)) {
    url = "/public/" + url;
  }
  return /^(https?:\/\/|\/)/i.test(url) ? url : "";
}

module.exports = {
  index: function(req, res) {
    var viewModel;
    if (req.isAuthenticated() && req.user.local.admin) {
      viewModel = {
        user: {},
        layout: "user",
        stats: {
          stat: true
        },
        lama: {},
        settings: {}
      };

      if (!isEmpty(req.user)) {
        Tools.loadCurrentUser(req, function(err, user) {
          if (err) {
            console.error("Settings page user lookup failed:", err);
            return res.redirect("/");
          }
          viewModel.user = user;
          Tools.getSettings(viewModel, res, "settings", true);
          return;
        });
        return;
      }
      Tools.getSettings(viewModel, res, "settings", true);
    } else {
      res.redirect("/");
    }
  },
  edit: function(req, res) {
    var viewModel;
    if (req.isAuthenticated() && req.user.local.admin) {
      viewModel = {
        user: {},
        layout: "user",
        stats: {
          stat: true
        },
        lama: {},
        settings: {}
      };

      var curSet = {};
      if (req.body.newUsers == "on") {
        curSet = {
          header: req.body.header,
          tidepaperUrl: normalizeTidepaperUrl(req.body.tidepaperUrl),
          tidepaperIconUrl: normalizeTidepaperIconUrl(req.body.tidepaperIconUrl),
          newUsers: true,
          theme: req.body.theme,
          moderationProvider: req.body.moderationProvider || "local"
        };
      } else {
        curSet = {
          header: req.body.header,
          tidepaperUrl: normalizeTidepaperUrl(req.body.tidepaperUrl),
          tidepaperIconUrl: normalizeTidepaperIconUrl(req.body.tidepaperIconUrl),
          newUsers: false,
          theme: req.body.theme,
          moderationProvider: req.body.moderationProvider || "local"
        };
      }

      if (!isEmpty(req.user)) {
        Tools.loadCurrentUser(req, function(err, user) {
          if (err) {
            console.error("Settings edit user lookup failed:", err);
            return res.redirect("/");
          }
          viewModel.user = user;
          Settings.updateOne(
            {
              settings_id: settingsID
            },
            {
              $set: curSet,
              $setOnInsert: { settings_id: settingsID }
            },
            {
              upsert: true,
              setDefaultsOnInsert: true
            },
            ).then(function(lamaSettings) {
              Tools.getSettings(viewModel, res, "settings", true);
            }).catch(function(err) {
              console.error("Settings update failed:", err);
              return res.redirect("/");
            });
          return;
        });
        return;
      }
      Settings.updateOne(
        {
          settings_id: settingsID
        },
        {
          $set: curSet,
          $setOnInsert: { settings_id: settingsID }
        },
        {
          upsert: true,
          setDefaultsOnInsert: true
        },
        ).then(function(lamaSettings) {
          Tools.getSettings(viewModel, res, "settings", true);
        }).catch(function(err) {
          console.error("Settings update failed:", err);
          return res.redirect("/");
        });
    } else {
      res.redirect("/");
    }
  }
};
