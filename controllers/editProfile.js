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
var fs = require('fs'),
	path = require('path'),
	User = require('../models/user'),
	Article = require('../models/article'),
	md5 = require('MD5');
var Tools = require('../server/tools.js');
var PropertiesReader = require('properties-reader');
var properties = PropertiesReader('./server/properties.file'),
	lamaHeader = properties.get('main.lamaTitle'),
	lamaVersion = properties.get('main.version'),
	lamaTwitter = properties.get('main.twitter'),
	lamaFacebook = properties.get('main.facebook');

module.exports = {
	index : function(req, res, admin) {
		var viewModel;
		var cookieOptions = {
			sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
			secure: process.env.NODE_ENV === 'production'
		};
		res.clearCookie('cookie_userEmail');
		res.cookie('cookie_userEmail', req.params.user_id, cookieOptions);
		admin = req.cookies.cookie_userEmail;
		if (req.isAuthenticated()) {
			viewModel = {
				user : {},
				userAdmin : {},
				message : req.flash('error'),
				admin : {
					edit : true
				},
				layout : 'user',
				lama : {}
			};
		}


		User.findOne({
			'local.email' : {
				$eq: req.params.user_id
			}
		},
			function(err, user) {
				if (err) {
					console.error('Profile admin lookup failed:', err);
					return res.redirect('/login');
				}
				if (user) {
					viewModel.userAdmin = req.user;
					viewModel.user = user;
					Tools.getSettings(viewModel, res, 'editProfileAdmin');
				}

			}).lean();
	},
};