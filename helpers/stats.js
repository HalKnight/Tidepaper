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

"use strict";
var models = require("../models"),
  async = require("async");

module.exports = function(callback) {
  async.parallel(
    [
      function(next) {
        models.Article.countDocuments({}, next);
      },
      function(next) {
        models.Comment.countDocuments({}, next);
      },
      function(next) {
        models.Article.aggregate(
          [{
            $group: {
              _id: null,
              viewsTotal: {
                $sum: "$views"
              }
            }
          }],
          function(err, result) {
            var viewsTotal = 0;
            if (result !== undefined && result.length > 0) {
              viewsTotal += result[0].viewsTotal;
            }
            next(null, viewsTotal);
          }
        );
      },
      function(next) {
        models.Article.aggregate(
          [{
            $group: {
              _id: null,
              likesTotal: {
                $sum: "$likes"
              }
            }
          }],
          function(err, result) {
            var likesTotal = 0;
            if (result !== undefined && result.length > 0) {
              likesTotal += result[0].likesTotal;
            }
            next(null, likesTotal);
          }
        );
      }
    ],
    function(err, results) {
      callback(null, {
        articles: results[0],
        comments: results[1],
        views: results[2],
        likes: results[3]
      });
    }
  );
};
