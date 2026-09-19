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

"use strict"
var models = require('../models');

module.exports = {
	newest : function(callback) {
		// The sidebar is shown to anonymous visitors too, so only ever surface
		// comments on public articles here; private article comments/titles must
		// not leak into this shared widget.
		var CANDIDATE_LIMIT = 50;
		var RESULT_LIMIT = 5;

		models.Comment.find({}, {}, {
			limit : CANDIDATE_LIMIT,
			sort : {
				'timestamp' : -1
			}
		}).lean().exec()
			.then(function(comments) {
				comments = comments || [];
				var articleIds = comments.map(function(comment) {
					return comment.article_id;
				});

				return models.Article.find({
					articleID: { $in: articleIds },
					private: { $ne: true }
				}).lean().exec().then(function(articles) {
					var articlesById = {};
					(articles || []).forEach(function(article) {
						articlesById[article.articleID] = article;
					});

					return comments
						.filter(function(comment) {
							return !!articlesById[comment.article_id];
						})
						.slice(0, RESULT_LIMIT)
						.map(function(comment) {
							comment.article = articlesById[comment.article_id];
							return comment;
						});
				});
			})
			.then(function(comments) {
				callback(null, comments);
			})
			.catch(callback);
	}
};