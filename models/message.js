var mongoose = require("mongoose");

var MessageSchema = new mongoose.Schema({
  senderEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  senderName: {
    type: String,
    required: true
  },
  recipientEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160
  },
  body: {
    type: String,
    required: true,
    maxlength: 10000
  },
  attachment: {
    filename: String,
    contentType: String,
    size: Number,
    data: Buffer
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

MessageSchema.index({ recipientEmail: 1, createdAt: -1 });
MessageSchema.index({ senderEmail: 1, createdAt: -1 });

module.exports = mongoose.model("Message", MessageSchema);
