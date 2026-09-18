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
var Settings = require("../models/settings");
var UserModel = require("../models/user");
var MessageModel = require("../models/message");
var css = [
  {
    css: "/public/css/readable.css"
  }
];
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
  lamaTheme = properties.get("main.theme");

module.exports = {
  loadCurrentUser: function(req, callback) {
    if (!req || !req.user || !req.user.local || !req.user.local.email) {
      return callback(null, {});
    }

    UserModel.findOne({
      "local.email": req.user.local.email
    }).lean().exec()
      .then(function(user) {
        callback(null, user || {});
      })
      .catch(callback);
  },

  getSettings: function(viewModel, res, page, editSettings) {
    viewModel.lama.header = lamaHeader;
    viewModel.lama.version = lamaVersion;
    viewModel.lama.twitter = lamaTwitter;
    viewModel.lama.facebook = lamaFacebook;
    if (viewModel.user && viewModel.user.local) {
      viewModel.lama.twitter = viewModel.user.local.xUrl || lamaTwitter;
      viewModel.lama.facebook = viewModel.user.local.facebookUrl || lamaFacebook;
    }
    viewModel.styleSheet = css;
    viewModel.theme = lamaTheme;

    var unreadMessagesPromise = viewModel.user && viewModel.user.local && viewModel.user.local.email
      ? MessageModel.countDocuments({
          recipientEmail: String(viewModel.user.local.email).trim().toLowerCase(),
          read: false
        }).catch(function(err) {
          console.error("Unread message count failed:", err);
          return 0;
        })
      : Promise.resolve(0);

    Promise.all([
      Settings.findOne({
        settings_id: settingsID
      }).lean().exec(),
      unreadMessagesPromise
    ])
      .then(function(results) {
        var settings = results[0];
        viewModel.unreadMessages = results[1] || 0;
        if (settings) {
          var savedHeader = String(settings.header || "").trim();
          viewModel.lama.header = savedHeader.toLowerCase() === "lama"
            ? lamaHeader
            : settings.header || lamaHeader;
          if (viewModel.user && viewModel.user.local) {
            viewModel.lama.twitter = viewModel.user.local.xUrl || lamaTwitter;
            viewModel.lama.facebook = viewModel.user.local.facebookUrl || lamaFacebook;
          }
          viewModel.theme = settings.theme || lamaTheme;

          css = [
            {
              css: "/public/css/" + settings.theme + ".css"
            }
          ];

          viewModel.styleSheet = css;
          if (editSettings) {
            viewModel.settings = settings;
            if (savedHeader.toLowerCase() === "lama") {
              viewModel.settings.header = lamaHeader;
            }
          }
          res.render(page, viewModel);
        } else {
          if (editSettings) {
            var newSettings = new Settings();
            newSettings.header = lamaHeader;
            newSettings.twitter = lamaTwitter;
            newSettings.facebook = lamaFacebook;
            newSettings.theme = lamaTheme;
            newSettings.newUsers = true;
            viewModel.settings = newSettings;
          }
          res.render(page, viewModel);
        }
      })
      .catch(function(err) {
        console.error("Settings lookup failed:", err);
        res.status(500).send("Unable to load settings.");
      });
  }
};
