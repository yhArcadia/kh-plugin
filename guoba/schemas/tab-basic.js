/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:24:51
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 19:43:13
 * @FilePath: /kh-plugin/guoba/schemas/tab-basic.js
 * @Description: 基础设置页面
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import labels from './labels.js';

export default [
    { component: 'SOFT_GROUP_BEGIN', label: '常用设置' },


    { component: 'Divider', label: '基础设置' },
    {
        field: 'maxSaveLength',
        label: labels.maxSaveLength,
        component: 'InputNumber',
        componentProps: { min: 1, max: 200 },
        bottomHelpMessage: '每个用户在单个群内最多保存的记录条数，超过这个值的最早记录将被丢弃。'
    },
    {
        field: 'maxRenderLength',
        label: labels.maxRenderLength,
        component: 'InputNumber',
        componentProps: { min: 1, max: 100 },
        bottomHelpMessage: '普通开合卡显示最近几条；大写KH会绕过此限制从而渲染完整的全部记录。'
    },
    {
        field: 'rankLimit',
        label: labels.rankLimit,
        component: 'InputNumber',
        componentProps: { min: 1, max: 500 },
        bottomHelpMessage: '各类排行榜显示的最大人数(#换头大王、#老资历 等）。'
    },
    {
        field: 'reverseHistoryThreshold',
        label: labels.reverseHistoryThreshold,
        component: 'InputNumber',
        componentProps: { min: 0, max: 999 },
        bottomHelpMessage: '要渲染的记录数超过此值时，将倒序显示，最新记录在前，方便查看。0 表示始终倒序，999 可视为始终正序。'
    },


    { component: 'Divider', label: '实时检测与推送' },
    {
        field: 'monitorCD',
        label: labels.monitorCD,
        component: 'InputNumber',
        componentProps: { min: 5, max: 86400 },
        bottomHelpMessage: '对同一成员实时检测的间隔，单位秒。\n默认会全量判断在任何群发言了的任何群员的身份信息是否发生更新、并静默保存新身份资料，除非配置了黑白名单。'
    },
    {
        field: 'maxNotifyRenderLength',
        label: labels.maxNotifyRenderLength,
        component: 'InputNumber',
        componentProps: { min: 1, max: 200 },
        bottomHelpMessage: '群员发言时本检测到身份信息更新后，触发的实时推送图片中包含的历史条数。默认2条即为新身份和上一身份。'
    },

];