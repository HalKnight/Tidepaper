var mongoose = require("mongoose");

var ArticleAttachmentSchema = new mongoose.Schema({
  articleID: {
    type: String,
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true
  },
  contentType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  data: {
    type: Buffer,
    required: true
  },
  inline: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("ArticleAttachment", ArticleAttachmentSchema);
