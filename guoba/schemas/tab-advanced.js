/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:25:44
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-26 18:44:58
 * @FilePath: /kh-plugin/guoba/schemas/tab-advanced.js
 * @Description: 进阶配置页面
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import labels from './labels.js';

export default [
  { component: 'SOFT_GROUP_BEGIN', label: '进阶配置' },


  { component: 'Divider', label: '定时更新群员信息' },
  {
    field: 'updateSchedule',
    label: labels.updateSchedule,
    component: 'EasyCron',
    componentProps: {
      placeholder: '选择 Cron 表达式',
      hideSecond: true,
    },
    bottomHelpMessage: '定时更新计划，默认每天凌晨03:30执行一次。'
  },
  {
    field: 'autoUpdateGroups',
    label: labels.autoUpdateGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: '请选择要启用自动更新的群' },
    bottomHelpMessage: '插件会在上方Cron指定的时间，自动更新这些群的全部群员的信息。一般而言，不需要配置这项，因为默认的实时监听，就会捕获所有的【有效身份】。而启用自动更新则有可能引入【无效身份】。所谓【有效身份】指的是群友以这个身份再群里发过言而得以被群友观察到该身份。而假设群友更换到A头像之后没有发言，随后又换到了B头像，那么记录下A头像对于群友识别他来说是没有意义的，可以理解为【无效头像】。'
  },

  
  { component: 'Divider', label: '互通组配置' },
  {
    field: 'linkedGroups',
    label: labels.linkedGroups,
    component: 'GSubForm',
    componentProps: {
      multiple: true,
      schemas: [
        {
          field: 'groupNames',
          label: '勾选互通群',
          component: 'GSelectGroup',
          componentProps: { multiple: true, placeholder: '选择同一互通组内的群' }
        },
        {
          field: 'groupNamesDisplay',
          label: '预览（编辑无效）',
          component: 'GTags',
          componentProps: { allowAdd: false, allowDel: false }
        }
      ]
    },
    bottomHelpMessage: '什么时候需要配置互通组：对于同一组织体系下的多个群，其群员会有一定重复。如当"我们"都重复加了某组织的1群和2群，此时"你"在这两个群的身份都对"我"可见，那么在查询"你"的身份时，Bot同时提供"你"在另一个群的身份则有助于"我"了解"你"是谁。\n各组可交叉。'
  },


  { component: 'Divider', label: '退群通报' },
  {
    field: 'leaveNoticeAllGroups',
    label: labels.leaveNoticeAllGroups,
    component: 'Switch',
    componentProps: { defaultValue: true },
    bottomHelpMessage: '开启后对全群启用退群通报。关闭后仅在下方列表中配置的群启用。'
  },
  {
    field: 'leaveNoticeGroups',
    label: labels.leaveNoticeGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: '选择需要启用退群通报的群' }
  },


  { component: 'Divider', label: '渲染精度' },
  {
    field: 'renderScale',
    label: labels.renderScale,
    component: 'InputNumber',
    componentProps: {
      min: 50,
      max: 300,
      step: 10,
      placeholder: ''
    },
    bottomHelpMessage: '控制生成图片的清晰度。增大此值提高图片清晰度，但会增加耗时，建议不超过200。图片过大可能导致OOM，以及协议端发送失败。如果较长的记录出现发不出图的情况，请考虑降低精度。'
  },


  { component: 'Divider', label: '其他定时任务' },
  {
    field: 'orphanScanSchedule',
    label: labels.orphanScanSchedule,
    component: 'EasyCron',
    componentProps: {
      placeholder: '选择 Cron 表达式',
      hideSecond: true,
    },
    bottomHelpMessage: '闲置头像扫描计划，默认每天凌晨04:30执行一次。'
  },
  {
    field: 'htmlCacheCleanSchedule',
    label: labels.htmlCacheCleanSchedule,
    component: 'EasyCron',
    componentProps: {
      placeholder: '选择 Cron 表达式',
      hideSecond: true,
    },
    bottomHelpMessage: 'KH临时HTML缓存清理计划，默认每小时执行一次.'
  },
];