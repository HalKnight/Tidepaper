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

var express = require("express"),
  config = require("./server/configure"),
  app = express(),
  passport = require("passport"),
  mongoose = require("mongoose"),
  fs = require("fs"),
  path = require("path"),
  PropertiesReaderModule = require("properties-reader"),
  PropertiesReader = PropertiesReaderModule.default ||
    PropertiesReaderModule.propertiesReader ||
    PropertiesReaderModule;

var server_port = process.env.PORT || 8080;
var server_ip_address = process.env.HOST || "127.0.0.1";
var localPropertiesPath = path.join(__dirname, "server", "properties.local.file");
var localProperties = fs.existsSync(localPropertiesPath)
  ? PropertiesReader({ sourceFile: localPropertiesPath })
  : null;
var mongoUri =
  process.env.MONGODB_URI ||
  (localProperties && localProperties.get("database.mongoUri"));

if (!mongoUri) {
  throw new Error(
    "MongoDB URI is required. Set MONGODB_URI or create server/properties.local.file."
  );
}

app.set("views", __dirname + "/views");
require("./config/passport.js")(passport);

app = config(app);

mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 5000
}).catch(function(err) {
  console.error("MongoDB connection error:", err.message);
});

mongoose.connection.on("open", function() {
  console.log("Mongoose connected.");
});

mongoose.connection.on("error", function(err) {
  console.error("MongoDB connection failed:", err.message);
});

var server = app.listen(server_port, server_ip_address, function() {
  console.log("Listening on " + server_ip_address + ", port " + server_port);
});
