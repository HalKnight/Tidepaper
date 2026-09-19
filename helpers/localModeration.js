var modelPromise;

// nsfwjs resizes to this size internally anyway (MobileNetV2 input), so decoding
// straight to this resolution avoids building a full-size pixel buffer/tensor
// for large uploads.
var MODEL_INPUT_SIZE = 224;

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

  // Sample straight down to the model's input size instead of building a
  // full-resolution buffer/tensor first; nsfwjs would resize to this anyway.
  var targetWidth = Math.min(width, MODEL_INPUT_SIZE);
  var targetHeight = Math.min(height, MODEL_INPUT_SIZE);
  var rgb = new Uint8Array(targetWidth * targetHeight * 3);
  for (var ty = 0; ty < targetHeight; ty += 1) {
    var sy = Math.floor((ty * height) / targetHeight);
    for (var tx = 0; tx < targetWidth; tx += 1) {
      var sx = Math.floor((tx * width) / targetWidth);
      var srcIndex = (sy * width + sx) * 4;
      var dstIndex = (ty * targetWidth + tx) * 3;
      rgb[dstIndex] = pixels[srcIndex];
      rgb[dstIndex + 1] = pixels[srcIndex + 1];
      rgb[dstIndex + 2] = pixels[srcIndex + 2];
    }
  }
  return tf.tensor3d(rgb, [targetHeight, targetWidth, 3], "int32");
}

module.exports = {
  // Resolves to a boolean: true if the image is classified as unsafe.
  classify: function(buffer, contentType) {
    return loadLocalModel().then(function(runtime) {
      var image = decodeImage(runtime.tf, buffer, contentType);
      return runtime.model.classify(image).then(function(predictions) {
        image.dispose();
        return isUnsafe(predictions);
      }).catch(function(err) {
        image.dispose();
        throw err;
      });
    });
  }
};
