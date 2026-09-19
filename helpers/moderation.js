var awsClient;
var googleClient;
var Settings = require("../models/settings");
var moderationWorkerPool = require("./moderationWorkerPool");
var Metrics = require("../server/metrics");
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

function checkAws(buffer) {
  var rekognition = require("@aws-sdk/client-rekognition");
  if (!awsClient) {
    awsClient = new rekognition.RekognitionClient({
      region: process.env.AWS_REGION || "us-east-1"
    });
  }
  return awsClient.send(new rekognition.DetectModerationLabelsCommand({
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
  if (!googleClient) {
    googleClient = new vision.ImageAnnotatorClient();
  }
  return googleClient.safeSearchDetection({
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
  var startedAt = Date.now();
  return moderationWorkerPool.classify(buffer, contentType).then(function(unsafe) {
    Metrics.recordInferenceDuration(Date.now() - startedAt);
    if (unsafe) {
      throw new Error("Image failed Tidepaper safety moderation.");
    }
    return true;
  }, function(err) {
    Metrics.recordInferenceDuration(Date.now() - startedAt);
    throw err;
  });
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
