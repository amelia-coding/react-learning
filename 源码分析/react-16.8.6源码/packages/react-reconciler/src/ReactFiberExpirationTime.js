/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import MAX_SIGNED_31_BIT_INT from './maxSigned31BitInt';

export type ExpirationTime = number;

// ExpirationTime = Nowork 的初始值
export const NoWork = 0;
export const Never = 1;
// int32 - 1   
export const Sync = MAX_SIGNED_31_BIT_INT;

const UNIT_SIZE = 10;
const MAGIC_NUMBER_OFFSET = MAX_SIGNED_31_BIT_INT - 1; // 到期时间偏移量

// 1 unit of expiration time represents 10ms.
// 1单位的expiration为10毫秒。
export function msToExpirationTime(ms: number): ExpirationTime {
  // Always add an offset so that we don't clash with the magic number for NoWork.
  return MAGIC_NUMBER_OFFSET - ((ms / UNIT_SIZE) | 0);
}
// 1.3 | 0  = 1
// 1.9 | 0  = 1
export function expirationTimeToMs(expirationTime: ExpirationTime): number {
  return (MAGIC_NUMBER_OFFSET - expirationTime) * UNIT_SIZE;
}

// 向上取整，间隔在precision内的两个num最终得到的相同的值 如：(60, 25)  (74, 25)， 在25ms内得到的值相同， 相当于做了一次批处理
function ceiling(num: number, precision: number): number {
  return (((num / precision) | 0) + 1) * precision;
}

// precision = 25
// 间隔时间在25ms内， 得到的expritiontime时间一样的
// 相当于对25ms内的任务做了一次批处理

/**
 * 
 * @param {*} currentTime  
 * @param {*} expirationInMs  不同优先级任务会传不同的偏移量，把不同优先级的时间拉开一些差距
 * @param {*} bucketSizeMs  bucketSizeMs越大，批处理的间隔就越大
 */
function computeExpirationBucket(
  currentTime,
  expirationInMs,
  bucketSizeMs,
): ExpirationTime {
  return (
    MAGIC_NUMBER_OFFSET -
    ceiling(
      MAGIC_NUMBER_OFFSET - currentTime + expirationInMs / UNIT_SIZE,
      bucketSizeMs / UNIT_SIZE,  
    )
  );
}

export const LOW_PRIORITY_EXPIRATION = 5000;
export const LOW_PRIORITY_BATCH_SIZE = 250;

// 异步任务的到期时间， LOW_PRIORITY_BATCH_SIZE  相当于把相差250ms内的任务都给相同的expirationTime，然后在一次更新中完成
// （普通异步更新）的expirationTime
export function computeAsyncExpiration(
  currentTime: ExpirationTime,
): ExpirationTime {
  return computeExpirationBucket(
    currentTime,
    LOW_PRIORITY_EXPIRATION,
    LOW_PRIORITY_BATCH_SIZE,
  );
}

// We intentionally set a higher expiration time for interactive updates in
// dev than in production.
//
// If the main thread is being blocked so long that you hit the expiration,
// it's a problem that could be solved with better scheduling.
//
// People will be more likely to notice this and fix it with the long
// expiration time in development.
//
// In production we opt for better UX at the risk of masking scheduling
// problems, by expiring fast.
export const HIGH_PRIORITY_EXPIRATION = __DEV__ ? 500 : 150;
export const HIGH_PRIORITY_BATCH_SIZE = 100;

export function computeInteractiveExpiration(currentTime: ExpirationTime) {
  return computeExpirationBucket(
    currentTime,
    HIGH_PRIORITY_EXPIRATION,
    HIGH_PRIORITY_BATCH_SIZE,
  );
}
