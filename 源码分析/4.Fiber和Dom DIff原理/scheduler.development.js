/** @license React v0.13.6
 * scheduler.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
/**
 * 老袁解析react fiber
 * 1.获取当前系统的开始时间
 * 2.设置任务的优先级
 * 3.根据优先级别设置对应的过期时间
 * 4.根据过期时间进行双向链表的排序
 * 5.排完序了 然后如何执行呢？？？ensureHostCallbackIsScheduled
 * 6.按照每一帧之后的空闲开始进行更新requestAnimationFrameWithTimeout
 * 7.animationTick是线索 计算帧过期时间并压缩帧
 * 8.配合MessageChannel进行具体的调度任务
 * 9.prevScheduledCallback == flushWork最终执行调度
 * 原则：有过期的执行全部过期 没过期尽可能多的执行
 * 剩下没执行完轮回到5 如果插入了高优先级的立即执行
 *  */
"use strict";

if (process.env.NODE_ENV !== "production") {
  (function() {
    "use strict";

    Object.defineProperty(exports, "__esModule", { value: true });

    var enableSchedulerDebugging = false;

    /* eslint-disable no-var */

    // TODO: Use symbols?
    //yideng 2.设置任务的优先级
    var ImmediatePriority = 1;
    var UserBlockingPriority = 2;
    var NormalPriority = 3;
    var LowPriority = 4;
    var IdlePriority = 5;
    // var ImmediatePriority = 1;  //最高优先级
    // var UserBlockingPriority = 2; //用户阻塞型优先级
    // var NormalPriority = 3; //普通优先级
    // var LowPriority = 4; // 低优先级
    // var IdlePriority = 5; // 空闲优先级
    //==========接下来是对五种优先级别设置的五个过期时间=============
    // Max 31 bit integer. The max integer size in V8 for 32-bit systems.
    // Math.pow(2, 30) - 1
    // 0b111111111111111111111111111111
    //3.根据优先级别设置对应的过期时间
    //32位系统V8引擎里最大的整数 据粗略计算这个时间大概是12.427天
    //tab页开着12天才会过期
    var maxSigned31BitInt = 1073741823;
    // 立马过期 ==> ImmediatePriority
    // Times out immediately
    var IMMEDIATE_PRIORITY_TIMEOUT = -1;
    // Eventually times out
    // 250ms以后过期
    var USER_BLOCKING_PRIORITY = 250;
    var NORMAL_PRIORITY_TIMEOUT = 5000;
    var LOW_PRIORITY_TIMEOUT = 10000;
    // Never times out
    // 永不过期
    var IDLE_PRIORITY = maxSigned31BitInt;
    /*每个任务在添加到链表里的时候，都会通过 performance.now() + timeout
    来得出这个任务的过期时间，随着时间的推移，当前时间会越来越接近这个过期时间，
    所以过期时间越小的代表优先级越高。如果过期时间已经比当前时间小了，
    说明这个任务已经过期了还没执行，需要立马去执行(asap)。*/
    // Callbacks are stored as a circular, doubly linked list.

    //第一个任务节点
    var firstCallbackNode = null;

    var currentDidTimeout = false;
    // Pausing the scheduler is useful for debugging.
    var isSchedulerPaused = false;

    var currentPriorityLevel = NormalPriority;
    var currentEventStartTime = -1;
    var currentExpirationTime = -1;

    // This is set when a callback is being executed, to prevent re-entrancy.
    var isExecutingCallback = false;

    var isHostCallbackScheduled = false;
    //yideng 1.获取当前系统的开始时间-performance.now
    var hasNativePerformanceNow =
      typeof performance === "object" && typeof performance.now === "function";

    function ensureHostCallbackIsScheduled() {
      if (isExecutingCallback) {
        // Don't schedule work yet; wait until the next time we yield.
        return;
      }
      // Schedule the host callback using the earliest expiration in the list.
      var expirationTime = firstCallbackNode.expirationTime;
      if (!isHostCallbackScheduled) {
        isHostCallbackScheduled = true;
      } else {
        // Cancel the existing host callback.
        cancelHostCallback();
      }
      requestHostCallback(flushWork, expirationTime);
    }

    function flushFirstCallback() {
      var flushedNode = firstCallbackNode;

      // Remove the node from the list before calling the callback. That way the
      // list is in a consistent state even if the callback throws.
      var next = firstCallbackNode.next;
      if (firstCallbackNode === next) {
        // This is the last callback in the list.
        firstCallbackNode = null;
        next = null;
      } else {
        var lastCallbackNode = firstCallbackNode.previous;
        firstCallbackNode = lastCallbackNode.next = next;
        next.previous = lastCallbackNode;
      }

      flushedNode.next = flushedNode.previous = null;

      // Now it's safe to call the callback.
      var callback = flushedNode.callback;
      var expirationTime = flushedNode.expirationTime;
      var priorityLevel = flushedNode.priorityLevel;
      var previousPriorityLevel = currentPriorityLevel;
      var previousExpirationTime = currentExpirationTime;
      currentPriorityLevel = priorityLevel;
      currentExpirationTime = expirationTime;
      var continuationCallback;
      try {
        continuationCallback = callback();
      } finally {
        currentPriorityLevel = previousPriorityLevel;
        currentExpirationTime = previousExpirationTime;
      }

      // A callback may return a continuation. The continuation should be scheduled
      // with the same priority and expiration as the just-finished callback.
      if (typeof continuationCallback === "function") {
        var continuationNode = {
          callback: continuationCallback,
          priorityLevel: priorityLevel,
          expirationTime: expirationTime,
          next: null,
          previous: null
        };

        // Insert the new callback into the list, sorted by its expiration. This is
        // almost the same as the code in `scheduleCallback`, except the callback
        // is inserted into the list *before* callbacks of equal expiration instead
        // of after.
        if (firstCallbackNode === null) {
          // This is the first callback in the list.
          firstCallbackNode = continuationNode.next = continuationNode.previous = continuationNode;
        } else {
          var nextAfterContinuation = null;
          var node = firstCallbackNode;
          do {
            if (node.expirationTime >= expirationTime) {
              // This callback expires at or after the continuation. We will insert
              // the continuation *before* this callback.
              nextAfterContinuation = node;
              break;
            }
            node = node.next;
          } while (node !== firstCallbackNode);

          if (nextAfterContinuation === null) {
            // No equal or lower priority callback was found, which means the new
            // callback is the lowest priority callback in the list.
            nextAfterContinuation = firstCallbackNode;
          } else if (nextAfterContinuation === firstCallbackNode) {
            // The new callback is the highest priority callback in the list.
            firstCallbackNode = continuationNode;
            ensureHostCallbackIsScheduled();
          }

          var previous = nextAfterContinuation.previous;
          previous.next = nextAfterContinuation.previous = continuationNode;
          continuationNode.next = nextAfterContinuation;
          continuationNode.previous = previous;
        }
      }
    }

    function flushImmediateWork() {
      if (
        // Confirm we've exited the outer most event handler
        currentEventStartTime === -1 &&
        firstCallbackNode !== null &&
        firstCallbackNode.priorityLevel === ImmediatePriority
      ) {
        isExecutingCallback = true;
        try {
          do {
            flushFirstCallback();
          } while (
            // Keep flushing until there are no more immediate callbacks
            firstCallbackNode !== null &&
            firstCallbackNode.priorityLevel === ImmediatePriority
          );
        } finally {
          isExecutingCallback = false;
          if (firstCallbackNode !== null) {
            // There's still work remaining. Request another callback.
            ensureHostCallbackIsScheduled();
          } else {
            isHostCallbackScheduled = false;
          }
        }
      }
    }

    function flushWork(didTimeout) {
      // Exit right away if we're currently paused

      if (enableSchedulerDebugging && isSchedulerPaused) {
        return;
      }

      isExecutingCallback = true;
      var previousDidTimeout = currentDidTimeout;
      currentDidTimeout = didTimeout;
      try {
        //如果是任务过期了 赶紧排队把过期的任务给执行了
        if (didTimeout) {
          // Flush all the expired callbacks without yielding.
          while (
            firstCallbackNode !== null &&
            !(enableSchedulerDebugging && isSchedulerPaused)
          ) {
            // TODO Wrap in feature flag
            // Read the current time. Flush all the callbacks that expire at or
            // earlier than that time. Then read the current time again and repeat.
            // This optimizes for as few performance.now calls as possible.
            var currentTime = exports.unstable_now();
            if (firstCallbackNode.expirationTime <= currentTime) {
              do {
                flushFirstCallback();
              } while (
                firstCallbackNode !== null &&
                firstCallbackNode.expirationTime <= currentTime &&
                !(enableSchedulerDebugging && isSchedulerPaused)
              );
              continue;
            }
            break;
          }
        } else {
          //当前帧有富余时间，while的逻辑是只要有任务且当前帧没过期就去执行任务。
          //执行队首任务，把队首任务从链表移除，并把第二个任务置为队首任务。执行任务可能产生新的任务，再把新任务插入到任务链表
          // Keep flushing callbacks until we run out of time in the frame.
          if (firstCallbackNode !== null) {
            do {
              if (enableSchedulerDebugging && isSchedulerPaused) {
                break;
              }
              flushFirstCallback();
              //shouldYieldToHost代表当前帧过期了，取反的话就是没过期。
            } while (firstCallbackNode !== null && !shouldYieldToHost());
          }
        }
      } finally {
        isExecutingCallback = false;
        currentDidTimeout = previousDidTimeout;
        //最后，如果还有任务的话，再启动一轮新的任务执行调度
        if (firstCallbackNode !== null) {
          // There's still work remaining. Request another callback.
          ensureHostCallbackIsScheduled();
        } else {
          isHostCallbackScheduled = false;
        }
        // Before exiting, flush all the immediate work that was scheduled.
         //最最后，如果还有任务且有最高优先级的任务，就都执行一遍。
        flushImmediateWork();
      }
    }

    function unstable_runWithPriority(priorityLevel, eventHandler) {
      switch (priorityLevel) {
        case ImmediatePriority:
        case UserBlockingPriority:
        case NormalPriority:
        case LowPriority:
        case IdlePriority:
          break;
        default:
          priorityLevel = NormalPriority;
      }

      var previousPriorityLevel = currentPriorityLevel;
      var previousEventStartTime = currentEventStartTime;
      currentPriorityLevel = priorityLevel;
      currentEventStartTime = exports.unstable_now();

      try {
        return eventHandler();
      } finally {
        currentPriorityLevel = previousPriorityLevel;
        currentEventStartTime = previousEventStartTime;

        // Before exiting, flush all the immediate work that was scheduled.
        flushImmediateWork();
      }
    }

    function unstable_next(eventHandler) {
      var priorityLevel = void 0;
      switch (currentPriorityLevel) {
        case ImmediatePriority:
        case UserBlockingPriority:
        case NormalPriority:
          // Shift down to normal priority
          priorityLevel = NormalPriority;
          break;
        default:
          // Anything lower than normal priority should remain at the current level.
          priorityLevel = currentPriorityLevel;
          break;
      }

      var previousPriorityLevel = currentPriorityLevel;
      var previousEventStartTime = currentEventStartTime;
      currentPriorityLevel = priorityLevel;
      currentEventStartTime = exports.unstable_now();

      try {
        return eventHandler();
      } finally {
        currentPriorityLevel = previousPriorityLevel;
        currentEventStartTime = previousEventStartTime;

        // Before exiting, flush all the immediate work that was scheduled.
        flushImmediateWork();
      }
    }

    function unstable_wrapCallback(callback) {
      var parentPriorityLevel = currentPriorityLevel;
      return function() {
        // This is a fork of runWithPriority, inlined for performance.
        var previousPriorityLevel = currentPriorityLevel;
        var previousEventStartTime = currentEventStartTime;
        currentPriorityLevel = parentPriorityLevel;
        currentEventStartTime = exports.unstable_now();

        try {
          return callback.apply(this, arguments);
        } finally {
          currentPriorityLevel = previousPriorityLevel;
          currentEventStartTime = previousEventStartTime;
          flushImmediateWork();
        }
      };
    }
    //yideng 4.根据过期时间进行双向链表的排序
    function unstable_scheduleCallback(callback, deprecated_options) {
      var startTime =
        currentEventStartTime !== -1
          ? currentEventStartTime
          : exports.unstable_now();

      var expirationTime;
      if (
        typeof deprecated_options === "object" &&
        deprecated_options !== null &&
        typeof deprecated_options.timeout === "number"
      ) {
        // FIXME: Remove this branch once we lift expiration times out of React.
        //如果没有传递过去时间的话直接按照默认的传递
        expirationTime = startTime + deprecated_options.timeout;
      } else {
        switch (currentPriorityLevel) {
          case ImmediatePriority:
            expirationTime = startTime + IMMEDIATE_PRIORITY_TIMEOUT;
            break;
          case UserBlockingPriority:
            expirationTime = startTime + USER_BLOCKING_PRIORITY;
            break;
          case IdlePriority:
            expirationTime = startTime + IDLE_PRIORITY;
            break;
          case LowPriority:
            expirationTime = startTime + LOW_PRIORITY_TIMEOUT;
            break;
          case NormalPriority:
          default:
            expirationTime = startTime + NORMAL_PRIORITY_TIMEOUT;
        }
      }
      //yideng 双向的链表
      var newNode = {
        callback: callback, //任务具体的内容
        priorityLevel: currentPriorityLevel, //任务优先级
        expirationTime: expirationTime, //任务的过期时间
        next: null, //下一个节点
        previous: null //上一个节点
      };

      // Insert the new callback into the list, ordered first by expiration, then
      // by insertion. So the new callback is inserted any other callback with
      // equal expiration.
      //yideng仿照之前的双向节点的例子 插入指定节点
      if (firstCallbackNode === null) {
        // This is the first callback in the list.
        firstCallbackNode = newNode.next = newNode.previous = newNode;
        //排完顺序之后按照指定的规则执行任务
        //那么什么是合适的时间呢？也就是之前讨论过的每一帧绘制完成之后的空闲时间
        //5.排完序了 然后如何执行呢？？？ensureHostCallbackIsScheduled
        ensureHostCallbackIsScheduled();
      } else {
        var next = null;
        var node = firstCallbackNode;
        do {
          if (node.expirationTime > expirationTime) {
            // The new callback expires before this one.
            next = node;
            break;
          }
          node = node.next;
        } while (node !== firstCallbackNode);

        if (next === null) {
          // No callback with a later expiration was found, which means the new
          // callback has the latest expiration in the list.
          next = firstCallbackNode;
        } else if (next === firstCallbackNode) {
          // The new callback has the earliest expiration in the entire list.
          firstCallbackNode = newNode;
          ensureHostCallbackIsScheduled();
        }

        var previous = next.previous;
        previous.next = next.previous = newNode;
        newNode.next = next;
        newNode.previous = previous;
      }

      return newNode;
    }

    function unstable_pauseExecution() {
      isSchedulerPaused = true;
    }

    function unstable_continueExecution() {
      isSchedulerPaused = false;
      if (firstCallbackNode !== null) {
        ensureHostCallbackIsScheduled();
      }
    }

    function unstable_getFirstCallbackNode() {
      return firstCallbackNode;
    }

    function unstable_cancelCallback(callbackNode) {
      var next = callbackNode.next;
      if (next === null) {
        // Already cancelled.
        return;
      }

      if (next === callbackNode) {
        // This is the only scheduled callback. Clear the list.
        firstCallbackNode = null;
      } else {
        // Remove the callback from its position in the list.
        if (callbackNode === firstCallbackNode) {
          firstCallbackNode = next;
        }
        var previous = callbackNode.previous;
        previous.next = next;
        next.previous = previous;
      }

      callbackNode.next = callbackNode.previous = null;
    }

    function unstable_getCurrentPriorityLevel() {
      return currentPriorityLevel;
    }

    function unstable_shouldYield() {
      return (
        !currentDidTimeout &&
        ((firstCallbackNode !== null &&
          firstCallbackNode.expirationTime < currentExpirationTime) ||
          shouldYieldToHost())
      );
    }

    // The remaining code is essentially a polyfill for requestIdleCallback. It
    // works by scheduling a requestAnimationFrame, storing the time for the start
    // of the frame, then scheduling a postMessage which gets scheduled after paint.
    // Within the postMessage handler do as much work as possible until time + frame
    // rate. By separating the idle call into a separate event tick we ensure that
    // layout, paint and other browser work is counted against the available time.
    // The frame rate is dynamically adjusted.

    // We capture a local reference to any global, in case it gets polyfilled after
    // this module is initially evaluated. We want to be using a
    // consistent implementation.
    var localDate = Date;

    // This initialization code may run even on server environments if a component
    // just imports ReactDOM (e.g. for findDOMNode). Some environments might not
    // have setTimeout or clearTimeout. However, we always expect them to be defined
    // on the client. https://github.com/facebook/react/pull/13088
    var localSetTimeout =
      typeof setTimeout === "function" ? setTimeout : undefined;
    var localClearTimeout =
      typeof clearTimeout === "function" ? clearTimeout : undefined;

    // We don't expect either of these to necessarily be defined, but we will error
    // later if they are missing on the client.
    var localRequestAnimationFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : undefined;
    var localCancelAnimationFrame =
      typeof cancelAnimationFrame === "function"
        ? cancelAnimationFrame
        : undefined;

    // requestAnimationFrame does not run when the tab is in the background. If
    // we're backgrounded we prefer for that work to happen so that the page
    // continues to load in the background. So we also schedule a 'setTimeout' as
    // a fallback.
    // TODO: Need a better heuristic for backgrounded work.
    var ANIMATION_FRAME_TIMEOUT = 100;
    var rAFID;
    var rAFTimeoutID;
    //yideng 如果tab不激活的话 使用SetTimeout进行处理 如果正常情况直接干掉timeout
    //6.按照每一帧之后的空闲开始进行更新requestAnimationFrameWithTimeout
    var requestAnimationFrameWithTimeout = function(callback) {
      // schedule rAF and also a setTimeout
      rAFID = localRequestAnimationFrame(function(timestamp) {
        //每一次系统执行的performance.now 默认间隔是16.7
        // cancel the setTimeout
        localClearTimeout(rAFTimeoutID);
        callback(timestamp);
      });
      rAFTimeoutID = localSetTimeout(function() {
        // cancel the requestAnimationFrame
        localCancelAnimationFrame(rAFID);
        callback(exports.unstable_now());
      }, ANIMATION_FRAME_TIMEOUT);
    };

    if (hasNativePerformanceNow) {
      var Performance = performance;
      exports.unstable_now = function() {
        return Performance.now();
      };
    } else {
      exports.unstable_now = function() {
        return localDate.now();
      };
    }

    var requestHostCallback;
    var cancelHostCallback;
    var shouldYieldToHost;

    var globalValue = null;
    if (typeof window !== "undefined") {
      globalValue = window;
    } else if (typeof global !== "undefined") {
      globalValue = global;
    }

    if (globalValue && globalValue._schedMock) {
      // Dynamic injection, only for testing purposes.
      var globalImpl = globalValue._schedMock;
      requestHostCallback = globalImpl[0];
      cancelHostCallback = globalImpl[1];
      shouldYieldToHost = globalImpl[2];
      exports.unstable_now = globalImpl[3];
    } else if (
      // If Scheduler runs in a non-DOM environment, it falls back to a naive
      // implementation using setTimeout.
      typeof window === "undefined" ||
      // Check if MessageChannel is supported, too.
      typeof MessageChannel !== "function"
    ) {
      // If this accidentally gets imported in a non-browser environment, e.g. JavaScriptCore,
      // fallback to a naive implementation.
      var _callback = null;
      var _flushCallback = function(didTimeout) {
        if (_callback !== null) {
          try {
            _callback(didTimeout);
          } finally {
            _callback = null;
          }
        }
      };
      requestHostCallback = function(cb, ms) {
        if (_callback !== null) {
          // Protect against re-entrancy.
          setTimeout(requestHostCallback, 0, cb);
        } else {
          _callback = cb;
          setTimeout(_flushCallback, 0, false);
        }
      };
      cancelHostCallback = function() {
        _callback = null;
      };
      shouldYieldToHost = function() {
        return false;
      };
    } else {
      if (typeof console !== "undefined") {
        // TODO: Remove fb.me link
        if (typeof localRequestAnimationFrame !== "function") {
          console.error(
            "This browser doesn't support requestAnimationFrame. " +
              "Make sure that you load a " +
              "polyfill in older browsers. https://fb.me/react-polyfills"
          );
        }
        if (typeof localCancelAnimationFrame !== "function") {
          console.error(
            "This browser doesn't support cancelAnimationFrame. " +
              "Make sure that you load a " +
              "polyfill in older browsers. https://fb.me/react-polyfills"
          );
        }
      }

      var scheduledHostCallback = null; //代表任务链表的执行器
      var isMessageEventScheduled = false;
      var timeoutTime = -1; //代表最高优先级任务firstCallbackNode的过期时间
      var isAnimationFrameScheduled = false;
      var isFlushingHostCallback = false;
      var frameDeadline = 0; //代表一帧的过期时间，通过rAF回调入参t加上activeFrameTime来计算
      // We start out assuming that we run at 30fps but then the heuristic tracking
      // will adjust this value to a faster fps if we get more frequent animation
      // frames.
      var previousFrameTime = 33; // 一帧的渲染时间33ms，这里假设 1s 30帧
      var activeFrameTime = 33;

      shouldYieldToHost = function() {
        return frameDeadline <= exports.unstable_now();
      };

      // We use the postMessage trick to defer idle work until after the repaint.
      //如下是整个的执行流程，
      //8.配合MessageChannel进行具体的调度任务
      //8-1.在每一帧开始的rAF的回调里记录每一帧的开始时间，并计算每一帧的过期时间，
      //8-2.通过messageChannel发送消息。在帧末messageChannel的回调里接收消息，
      //8-3.根据当前帧的过期时间和当前时间进行比对来决定当前帧能否执行任务，
      //8-4.如果能的话会依次从任务链表里拿出队首任务来执行
      //8-5.执行尽可能多的任务后如果还有任务，下一帧再重新调度。
      var channel = new MessageChannel();
      var port = channel.port2;
      //下面的代码逻辑决定当前帧要不要执行任务
      // 1、如果当前帧没过期，说明当前帧有富余时间，可以执行任务
      // 2、如果当前帧过期了，说明当前帧没有时间了，这里再看一下当前任务firstCallbackNode
      //是否过期，如果过期了也要执行任务；如果当前任务没过期，说明不着急，那就先不执行去
      channel.port1.onmessage = function(event) {
        isMessageEventScheduled = false;

        var prevScheduledCallback = scheduledHostCallback;
        var prevTimeoutTime = timeoutTime;
        scheduledHostCallback = null;
        timeoutTime = -1;

        var currentTime = exports.unstable_now();

        var didTimeout = false;
        if (frameDeadline - currentTime <= 0) {
          // There's no time left in this idle period. Check if the callback has
          // a timeout and whether it's been exceeded.
          if (prevTimeoutTime !== -1 && prevTimeoutTime <= currentTime) {
            // Exceeded the timeout. Invoke the callback even though there's no
            // time left.
            //任务过期
            didTimeout = true;
          } else {
            // No timeout.
            //当前帧由于浏览器渲染等原因过期了，那就去下一帧再处理
            if (!isAnimationFrameScheduled) {
              // Schedule another animation callback so we retry later.
              isAnimationFrameScheduled = true;
              requestAnimationFrameWithTimeout(animationTick);
            }
            // Exit without invoking the callback.
            scheduledHostCallback = prevScheduledCallback;
            timeoutTime = prevTimeoutTime;
            return;
          }
        }

        if (prevScheduledCallback !== null) {
          isFlushingHostCallback = true;
          try {
            prevScheduledCallback(didTimeout);
          } finally {
            isFlushingHostCallback = false;
          }
        }
      };
      //7.animationTick是线索 计算帧过期时间并压缩帧
      var animationTick = function(rafTime) {
        if (scheduledHostCallback !== null) {
          //有任务再进行递归，没任务的话不需要工作
          // Eagerly schedule the next animation callback at the beginning of the
          // frame. If the scheduler queue is not empty at the end of the frame, it
          // will continue flushing inside that callback. If the queue *is* empty,
          // then it will exit immediately. Posting the callback at the start of the
          // frame ensures it's fired within the earliest possible frame. If we
          // waited until the end of the frame to post the callback, we risk the
          // browser skipping a frame and not firing the callback until the frame
          // after that.
          requestAnimationFrameWithTimeout(animationTick);
        } else {
          // No pending work. Exit.
          isAnimationFrameScheduled = false;
          return;
        }

        var nextFrameTime = rafTime - frameDeadline + activeFrameTime;
        //用连续的两次时间 被不断的压缩activeFrameTime
        if (
          nextFrameTime < activeFrameTime &&
          previousFrameTime < activeFrameTime
        ) {
          if (nextFrameTime < 8) {
            // Defensive coding. We don't support higher frame rates than 120hz.
            // If the calculated frame time gets lower than 8, it is probably a bug.
            nextFrameTime = 8;
          }
          // If one frame goes long, then the next one can be short to catch up.
          // If two frames are short in a row, then that's an indication that we
          // actually have a higher frame rate than what we're currently optimizing.
          // We adjust our heuristic dynamically accordingly. For example, if we're
          // running on 120hz display or 90hz VR display.
          // Take the max of the two in case one of them was an anomaly due to
          // missed frame deadlines.
          activeFrameTime =
            nextFrameTime < previousFrameTime
              ? previousFrameTime
              : nextFrameTime;
        } else {
          previousFrameTime = nextFrameTime;
        }
        //计算当前帧的截止时间，用开始时间加上每一帧的渲染时间
        frameDeadline = rafTime + activeFrameTime;
        if (!isMessageEventScheduled) {
          isMessageEventScheduled = true;
          //port2 负责发送数据
          //port2监听消息的回调来做任务调度的具体工作
          port.postMessage(undefined);
        }
      };

      requestHostCallback = function(callback, absoluteTimeout) {
        scheduledHostCallback = callback;
        timeoutTime = absoluteTimeout;
        if (isFlushingHostCallback || absoluteTimeout < 0) {
          // Don't wait for the next frame. Continue working ASAP, in a new event.
          port.postMessage(undefined);
        } else if (!isAnimationFrameScheduled) {
          // If rAF didn't already schedule one, we need to schedule a frame.
          // TODO: If this rAF doesn't materialize because the browser throttles, we
          // might want to still have setTimeout trigger rIC as a backup to ensure
          // that we keep performing work.
          isAnimationFrameScheduled = true;
          requestAnimationFrameWithTimeout(animationTick);
        }
      };

      cancelHostCallback = function() {
        scheduledHostCallback = null;
        isMessageEventScheduled = false;
        timeoutTime = -1;
      };
    }

    exports.unstable_ImmediatePriority = ImmediatePriority;
    exports.unstable_UserBlockingPriority = UserBlockingPriority;
    exports.unstable_NormalPriority = NormalPriority;
    exports.unstable_IdlePriority = IdlePriority;
    exports.unstable_LowPriority = LowPriority;
    exports.unstable_runWithPriority = unstable_runWithPriority;
    exports.unstable_next = unstable_next;
    exports.unstable_scheduleCallback = unstable_scheduleCallback;
    exports.unstable_cancelCallback = unstable_cancelCallback;
    exports.unstable_wrapCallback = unstable_wrapCallback;
    exports.unstable_getCurrentPriorityLevel = unstable_getCurrentPriorityLevel;
    exports.unstable_shouldYield = unstable_shouldYield;
    exports.unstable_continueExecution = unstable_continueExecution;
    exports.unstable_pauseExecution = unstable_pauseExecution;
    exports.unstable_getFirstCallbackNode = unstable_getFirstCallbackNode;
  })();
}
