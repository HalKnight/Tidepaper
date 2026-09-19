// Runs inside a worker_thread so NSFWJS/TensorFlow inference doesn't block the
// main event loop. See helpers/moderationWorkerPool.js for the pool manager.
var parentPort = require("worker_threads").parentPort;
var localModeration = require("./localModeration");

parentPort.on("message", function(task) {
  // postMessage structured-clones a Node Buffer down to a plain Uint8Array,
  // but the image decoders need real Buffer methods (readUInt32BE, etc.).
  var buffer = Buffer.isBuffer(task.buffer) ? task.buffer : Buffer.from(task.buffer);
  localModeration.classify(buffer, task.contentType).then(function(unsafe) {
    parentPort.postMessage({ id: task.id, unsafe: unsafe });
  }).catch(function(err) {
    parentPort.postMessage({ id: task.id, error: (err && err.message) || String(err) });
  });
});
