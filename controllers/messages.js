var Models = require("../models");
var Tools = require("../server/tools.js");
var Moderation = require("../helpers/moderation");

function currentEmail(req) {
  return String(req.user && req.user.local && req.user.local.email || "")
    .trim()
    .toLowerCase();
}

function renderMessages(req, res, viewModel) {
  Tools.loadCurrentUser(req, function(err, user) {
    if (err) {
      console.error("Message user lookup failed:", err);
      return res.redirect("/home");
    }
    viewModel.user = user;
    Tools.getSettings(viewModel, res, "messages");
  });
}

function renderMessagePage(req, res, viewModel, page) {
  Tools.loadCurrentUser(req, function(err, user) {
    if (err) {
      console.error("Message user lookup failed:", err);
      return res.redirect("/home");
    }
    viewModel.user = user;
    Tools.getSettings(viewModel, res, page);
  });
}

module.exports = {
  index: function(req, res) {
    var email = currentEmail(req);
    var page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    var pageSize = 25;
    var viewModel = {
      user: {},
      messages: [],
      unreadCount: 0,
      layout: "user",
      stats: { stat: true },
      lama: {},
      messagePage: page,
      messagePageSize: pageSize
    };

    return Promise.all([
      Models.Message.find({ recipientEmail: email, read: false }, { senderEmail: 1, senderName: 1, subject: 1, body: 1, "attachment.filename": 1, "attachment.contentType": 1, "attachment.size": 1, read: 1, createdAt: 1 }).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
      Tools.cachedCount("messages:unread:" + email, function() {
        return Models.Message.countDocuments({ recipientEmail: email, read: false });
      })
    ]).then(function(results) {
      viewModel.messages = results[0] || [];
      viewModel.unreadCount = results[1] || 0;
      viewModel.messageTotalPages = Math.max(Math.ceil(results[1] / pageSize), 1);
      viewModel.messagePreviousPage = Math.max(page - 1, 1);
      viewModel.messageNextPage = Math.min(page + 1, viewModel.messageTotalPages);
      renderMessages(req, res, viewModel);
    }).catch(function(err) {
      console.error("Message inbox lookup failed:", err);
      return res.redirect("/home");
    });
  },

  readMessages: function(req, res) {
    var email = currentEmail(req);
    var page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    var pageSize = 25;
    var viewModel = {
      user: {},
      messages: [],
      unreadCount: 0,
      readMessages: true,
      layout: "user",
      stats: { stat: true },
      lama: {},
      messagePage: page,
      messagePageSize: pageSize
    };

    return Models.Message.find({
      recipientEmail: email,
      read: true
    }, { senderEmail: 1, senderName: 1, subject: 1, body: 1, "attachment.filename": 1, "attachment.contentType": 1, "attachment.size": 1, read: 1, createdAt: 1 }).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec().then(function(messages) {
      viewModel.messages = messages || [];
      return Promise.all([
        Tools.cachedCount("messages:unread:" + email, function() {
          return Models.Message.countDocuments({ recipientEmail: email, read: false });
        }),
        Tools.cachedCount("messages:read:" + email, function() {
          return Models.Message.countDocuments({ recipientEmail: email, read: true });
        })
      ]);
    }).then(function(counts) {
      viewModel.unreadCount = counts[0] || 0;
      viewModel.messageTotalPages = Math.max(Math.ceil((counts[1] || 0) / pageSize), 1);
      viewModel.messagePreviousPage = Math.max(page - 1, 1);
      viewModel.messageNextPage = Math.min(page + 1, viewModel.messageTotalPages);
      renderMessages(req, res, viewModel);
    }).catch(function(err) {
      console.error("Read message lookup failed:", err);
      return res.redirect("/messages");
    });
  },

  markRead: function(req, res) {
    var email = currentEmail(req);
    return Models.Message.updateOne(
      { _id: req.params.message_id, recipientEmail: email },
      { $set: { read: true } }
    ).exec().then(function(result) {
      if (!result || result.matchedCount !== 1) {
        req.flash("error", "Message not found.");
      } else {
        Tools.invalidateUnreadCount(email);
      }
      return res.redirect("/messages");
    }).catch(function(err) {
      console.error("Mark message read failed:", err);
      req.flash("error", "The message could not be marked as read.");
      return res.redirect("/messages");
    });
  },

  compose: function(req, res) {
    var viewModel = {
      user: {},
      recipients: [],
      message: {},
      layout: "user",
      stats: { stat: true },
      lama: {}
    };

    return Models.User.find({ "local.email": { $ne: currentEmail(req) } }, { "local.email": 1, "local.name": 1 })
      .sort({ "local.name": 1, "local.email": 1 })
      .limit(250)
      .lean().exec()
      .then(function(users) {
        viewModel.recipients = users || [];
        renderMessagePage(req, res, viewModel, "messageCompose");
      })
      .catch(function(err) {
        console.error("Message recipient lookup failed:", err);
        viewModel.error_messages = "Unable to load the user list. Please try again.";
        renderMessagePage(req, res, viewModel, "messageCompose");
      });
  },

  send: function(req, res) {
    var senderEmail = currentEmail(req);
    var recipientEmail = String(req.body.recipientEmail || "").trim().toLowerCase();
    var subject = String(req.body.subject || "").trim();
    var body = String(req.body.body || "").trim();

    if (!recipientEmail || !subject || !body || recipientEmail === senderEmail) {
      req.flash("error", "Choose another user and provide a subject and message.");
      return res.redirect("/messages/compose");
    }

    return Models.User.findOne({ "local.email": recipientEmail }).lean().exec()
      .then(function(recipient) {
        if (!recipient) {
          req.flash("error", "That user could not be found.");
          return res.redirect("/messages/compose");
        }

        var imageCheck = req.file && req.file.mimetype.indexOf("image/") === 0
          ? Moderation.checkImage(req.file.buffer, undefined, req.file.mimetype)
          : Promise.resolve();
        return imageCheck.then(function() {
          var message = new Models.Message({
            senderEmail: senderEmail,
            senderName: req.user.local.name || senderEmail,
            recipientEmail: recipientEmail,
            subject: subject,
            body: body,
            attachment: req.file ? {
              filename: req.file.originalname,
              contentType: req.file.mimetype,
              size: req.file.size,
              data: req.file.buffer
            } : undefined
          });
          return message.save();
        }).then(function() {
          Tools.invalidateUnreadCount(recipientEmail);
          req.flash("success_messages", "Message sent.");
          return res.redirect("/messages");
        });
      })
      .catch(function(err) {
        console.error("Message send failed:", err);
        req.flash("error", "The message could not be sent.");
        return res.redirect("/messages/compose");
      });
  },

  attachment: function(req, res) {
    var email = currentEmail(req);
    return Models.Message.findOne({
      _id: req.params.message_id,
      recipientEmail: email
    }).lean().exec().then(function(message) {
      if (!message || !message.attachment || !message.attachment.data) {
        return res.status(404).send("Attachment not found.");
      }

      var filename = String(message.attachment.filename || "attachment")
        .replace(/[\\"\r\n]/g, "_");
      var contentType = message.attachment.contentType || "application/octet-stream";
      var data = Buffer.isBuffer(message.attachment.data)
        ? message.attachment.data
        : Buffer.from(message.attachment.data.data || message.attachment.data.buffer || message.attachment.data);
      res.type(contentType);
      res.set("Content-Disposition", contentType.indexOf("image/") === 0
        ? "inline; filename=\"" + filename + "\""
        : "attachment; filename=\"" + filename + "\"");
      return res.send(data);
    }).catch(function(err) {
      console.error("Message attachment lookup failed:", err);
      return res.status(404).send("Attachment not found.");
    });
  },

  read: function(req, res) {
    var email = currentEmail(req);
    return Models.Message.findOneAndUpdate(
      { _id: req.params.message_id, recipientEmail: email },
      { $set: { read: true } },
      { returnDocument: "after", projection: { "attachment.data": 0 } }
    ).lean().exec().then(function(message) {
      if (!message) {
        return res.redirect("/messages");
      }

      Tools.invalidateUnreadCount(email);
      var viewModel = {
        user: {},
        message: message,
        layout: "user",
        stats: { stat: true },
        lama: {}
      };
      renderMessagePage(req, res, viewModel, "message");
    }).catch(function(err) {
      console.error("Message lookup failed:", err);
      return res.redirect("/messages");
    });
  },

  remove: function(req, res) {
    var email = currentEmail(req);
    return Models.Message.deleteOne({
      _id: req.params.message_id,
      recipientEmail: email
    }).exec().then(function(result) {
      if (!result || result.deletedCount !== 1) {
        req.flash("error", "Message not found.");
      } else {
        Tools.invalidateUnreadCount(email);
        req.flash("success_messages", "Message deleted.");
      }
      return res.redirect("/messages");
    }).catch(function(err) {
      console.error("Message deletion failed:", err);
      req.flash("error", "The message could not be deleted.");
      return res.redirect("/messages");
    });
  }
};
