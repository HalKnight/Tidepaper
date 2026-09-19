var perfHooks = require("perf_hooks");

// Continuously samples event-loop delay so we can tell when the process is
// falling behind (e.g. from CPU-bound moderation work) without any external
// monitoring dependency.
var eventLoopHistogram = perfHooks.monitorEventLoopDelay({ resolution: 20 });
eventLoopHistogram.enable();

var EVENT_LOOP_WARN_THRESHOLD_MS = 100;
var CHECK_INTERVAL_MS = 30 * 1000;

function nsToMs(nanoseconds) {
  return Math.round((nanoseconds / 1e6) * 100) / 100;
}

function getEventLoopStats() {
  return {
    meanMs: nsToMs(eventLoopHistogram.mean),
    p50Ms: nsToMs(eventLoopHistogram.percentile(50)),
    p95Ms: nsToMs(eventLoopHistogram.percentile(95)),
    p99Ms: nsToMs(eventLoopHistogram.percentile(99)),
    maxMs: nsToMs(eventLoopHistogram.max)
  };
}

// Rolling stats for moderation inference latency (wall time including any
// worker-queue wait), not just raw event-loop delay.
var INFERENCE_SAMPLE_LIMIT = 200;
var inferenceDurations = [];
var inferenceCount = 0;
var inferenceTotalMs = 0;
var inferenceMinMs = null;
var inferenceMaxMs = null;

function recordInferenceDuration(ms) {
  inferenceCount += 1;
  inferenceTotalMs += ms;
  inferenceMinMs = inferenceMinMs === null ? ms : Math.min(inferenceMinMs, ms);
  inferenceMaxMs = inferenceMaxMs === null ? ms : Math.max(inferenceMaxMs, ms);
  inferenceDurations.push(ms);
  if (inferenceDurations.length > INFERENCE_SAMPLE_LIMIT) {
    inferenceDurations.shift();
  }
}

function percentileOf(sortedValues, percentile) {
  if (!sortedValues.length) {
    return 0;
  }
  var index = Math.min(
    sortedValues.length - 1,
    Math.ceil((percentile / 100) * sortedValues.length) - 1
  );
  return sortedValues[Math.max(0, index)];
}

function getInferenceStats() {
  var sorted = inferenceDurations.slice().sort(function(a, b) {
    return a - b;
  });
  return {
    count: inferenceCount,
    avgMs: inferenceCount ? Math.round((inferenceTotalMs / inferenceCount) * 100) / 100 : 0,
    minMs: inferenceMinMs || 0,
    maxMs: inferenceMaxMs || 0,
    p95Ms: Math.round(percentileOf(sorted, 95) * 100) / 100,
    sampleSize: sorted.length
  };
}

setInterval(function() {
  var stats = getEventLoopStats();
  if (stats.p99Ms > EVENT_LOOP_WARN_THRESHOLD_MS) {
    console.warn("Event loop delay is elevated:", stats);
  }
}, CHECK_INTERVAL_MS).unref();

module.exports = {
  getEventLoopStats: getEventLoopStats,
  recordInferenceDuration: recordInferenceDuration,
  getInferenceStats: getInferenceStats
};
