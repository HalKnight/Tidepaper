var path = require("path");
var Worker = require("worker_threads").Worker;

// Two workers matches the concurrency this replaced; each loads its own copy
// of the model, trading some extra memory for keeping inference off the main
// event loop entirely instead of just serializing it there.
var POOL_SIZE = 2;
var WORKER_SCRIPT = path.join(__dirname, "moderationWorker.js");

var workers = [];
var queue = [];
var pending = new Map();
var nextTaskId = 1;
var started = false;

function failCurrentTask(entry, err) {
  if (entry.currentTaskId != null) {
    var task = pending.get(entry.currentTaskId);
    if (task) {
      pending.delete(entry.currentTaskId);
      task.reject(err);
    }
    entry.currentTaskId = null;
  }
}

function createWorker() {
  var worker = new Worker(WORKER_SCRIPT);
  var entry = { worker: worker, busy: false, currentTaskId: null };

  worker.on("message", function(message) {
    entry.currentTaskId = null;
    entry.busy = false;
    var task = pending.get(message.id);
    pending.delete(message.id);
    if (task) {
      if (message.error) {
        task.reject(new Error(message.error));
      } else {
        task.resolve(message.unsafe);
      }
    }
    dispatchNext();
  });

  worker.on("error", function(err) {
    console.error("Moderation worker error:", err);
    failCurrentTask(entry, err);
    respawn(entry);
  });

  worker.on("exit", function(code) {
    if (code !== 0) {
      failCurrentTask(entry, new Error("Moderation worker exited with code " + code));
    }
    respawn(entry);
  });

  workers.push(entry);
  return entry;
}

function respawn(entry) {
  var index = workers.indexOf(entry);
  if (index !== -1) {
    workers.splice(index, 1);
  }
  createWorker();
  dispatchNext();
}

function ensureStarted() {
  if (started) {
    return;
  }
  started = true;
  for (var i = 0; i < POOL_SIZE; i += 1) {
    createWorker();
  }
}

function dispatchNext() {
  if (!queue.length) {
    return;
  }
  var idleWorker = workers.filter(function(entry) {
    return !entry.busy;
  })[0];
  if (!idleWorker) {
    return;
  }
  var task = queue.shift();
  idleWorker.busy = true;
  idleWorker.currentTaskId = task.id;
  pending.set(task.id, { resolve: task.resolve, reject: task.reject });
  idleWorker.worker.postMessage({ id: task.id, buffer: task.buffer, contentType: task.contentType });
}

module.exports = {
  // Resolves to a boolean: true if the image is classified as unsafe.
  classify: function(buffer, contentType) {
    ensureStarted();
    return new Promise(function(resolve, reject) {
      var id = nextTaskId++;
      queue.push({ id: id, buffer: buffer, contentType: contentType, resolve: resolve, reject: reject });
      dispatchNext();
    });
  }
};
