var modelPromise;
var Settings = require("../models/settings");
var PropertiesReaderModule = require("properties-reader");
var PropertiesReader = PropertiesReaderModule.default ||
  PropertiesReaderModule.propertiesReader ||
  PropertiesReaderModule;
var properties = PropertiesReader({ sourceFile: "./server/properties.file" });
var settingsID = properties.get("admin.settingsID");

function configuredProvider() {
  return Settings.findOne({ settings_id: settingsID }).lean().exec()
    .then(function(settings) {
      return settings && settings.moderationProvider || "local";
    });
}

function loadLocalModel() {
  if (!modelPromise) {
    modelPromise = Promise.all([
      Promise.resolve().then(function() { return require("nsfwjs"); }),
      Promise.resolve().then(function() { return require("@tensorflow/tfjs"); })
    ]).then(function(modules) {
      return modules[0].load().then(function(model) {
        return {
          model: model,
          tf: modules[1]
        };
      });
    });
  }
  return modelPromise;
}

function isUnsafe(predictions) {
  return (predictions || []).some(function(prediction) {
    var className = String(prediction.className || "").toLowerCase();
    return ["porn", "hentai", "sexy"].indexOf(className) !== -1 && prediction.probability >= 0.65;
  });
}

function checkAws(buffer) {
  var rekognition = require("@aws-sdk/client-rekognition");
  var client = new rekognition.RekognitionClient({
    region: process.env.AWS_REGION || "us-east-1"
  });
  return client.send(new rekognition.DetectModerationLabelsCommand({
    Image: { Bytes: buffer },
    MinConfidence: 65
  })).then(function(result) {
    var unsafe = (result.ModerationLabels || []).some(function(label) {
      return /nudity|sexual|explicit|suggestive|violence/i.test(label.Name || "");
    });
    if (unsafe) {
      throw new Error("Image failed AWS content moderation.");
    }
    return true;
  });
}

function checkGoogle(buffer) {
  var vision = require("@google-cloud/vision");
  var client = new vision.ImageAnnotatorClient();
  return client.safeSearchDetection({
    image: { content: buffer }
  }).then(function(results) {
    var safeSearch = results[0] && results[0].safeSearchAnnotation || {};
    var blocked = ["adult", "racy", "violence"].some(function(category) {
      return ["LIKELY", "VERY_LIKELY"].indexOf(safeSearch[category]) !== -1;
    });
    if (blocked) {
      throw new Error("Image failed Google SafeSearch moderation.");
    }
    return true;
  });
}

function checkAzure(buffer) {
  var endpoint = String(process.env.AZURE_CONTENT_SAFETY_ENDPOINT || "").replace(/\/$/, "");
  var key = process.env.AZURE_CONTENT_SAFETY_KEY;
  if (!endpoint || !key) {
    return Promise.reject(new Error("Azure Content Safety credentials are not configured."));
  }
  return fetch(endpoint + "/contentsafety/image:analyze?api-version=2023-10-01", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key
    },
    body: JSON.stringify({ image: { content: buffer.toString("base64") } })
  }).then(function(response) {
    if (!response.ok) {
      throw new Error("Azure Content Safety request failed with status " + response.status + ".");
    }
    return response.json();
  }).then(function(result) {
    var blocked = (result.categoriesAnalysis || []).some(function(category) {
      return ["Sexual", "Violence", "SelfHarm", "Hate"].indexOf(category.category) !== -1 && category.severity >= 2;
    });
    if (blocked) {
      throw new Error("Image failed Azure Content Safety moderation.");
    }
    return true;
  });
}

function checkLocal(buffer, contentType) {
  return loadLocalModel().then(function(runtime) {
    var image = decodeImage(runtime.tf, buffer, contentType);
    return runtime.model.classify(image).then(function(predictions) {
      image.dispose();
      if (isUnsafe(predictions)) {
        throw new Error("Image failed Tidepaper safety moderation.");
      }
      return true;
    }).catch(function(err) {
      image.dispose();
      throw err;
    });
  });
}

function decodeImage(tf, buffer, contentType) {
  var detected = { mime: contentType };
  var pixels;
  var width;
  var height;

  if (detected && detected.mime === "image/jpeg") {
    var jpeg = require("jpeg-js").decode(buffer, { useTArray: true });
    pixels = jpeg.data;
    width = jpeg.width;
    height = jpeg.height;
  } else if (detected && detected.mime === "image/png") {
    var png = require("pngjs").PNG.sync.read(buffer);
    pixels = png.data;
    width = png.width;
    height = png.height;
  } else if (detected && detected.mime === "image/gif") {
    var GifReader = require("omggif").GifReader;
    var reader = new GifReader(buffer);
    width = reader.width;
    height = reader.height;
    pixels = Buffer.alloc(width * height * 4);
    reader.decodeAndBlitFrameRGBA(0, pixels);
  } else {
    throw new Error("This image format cannot be moderated locally.");
  }

  var rgb = new Uint8Array(width * height * 3);
  for (var pixel = 0; pixel < width * height; pixel += 1) {
    rgb[pixel * 3] = pixels[pixel * 4];
    rgb[pixel * 3 + 1] = pixels[pixel * 4 + 1];
    rgb[pixel * 3 + 2] = pixels[pixel * 4 + 2];
  }
  return tf.tensor3d(rgb, [height, width, 3], "int32");
}

module.exports = {
  checkImage: function(buffer, provider, contentType) {
    var providerPromise = provider ? Promise.resolve(provider) : configuredProvider();
    return providerPromise.then(function(selectedProvider) {
      if (selectedProvider === "aws") {
        return checkAws(buffer);
      }
      if (selectedProvider === "google") {
        return checkGoogle(buffer);
      }
      if (selectedProvider === "azure") {
        return checkAzure(buffer);
      }
      if (selectedProvider !== "local") {
        throw new Error("Unknown image moderation provider: " + selectedProvider + ".");
      }
      return checkLocal(buffer, contentType);
    });
  }
};
