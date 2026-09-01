/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-08-18 17:33:34
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 19:42:41
 * @FilePath: /kh-plugin/guoba/schemas/schema.js
 * @Description: 表单聚合
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import tabBasic from './tab-basic.js';
import tabNotify from './tab-notify.js';
import tabScope from './tab-scope.js';
import tabAdvanced from './tab-advanced.js';

export default [
  ...tabBasic,
  ...tabNotify,
  ...tabScope,
  ...tabAdvanced,
];