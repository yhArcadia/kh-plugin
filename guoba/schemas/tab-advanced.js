/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:25:44
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-03 18:47:08
 * @FilePath: /kh-plugin/guoba/schemas/tab-advanced.js
 * @Description: 进阶配置页面
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import labels from './labels.js';

export default [
  { component: 'SOFT_GROUP_BEGIN', label: '进阶配置' },


  { component: 'Divider', label: '自动更新与定时任务' },
  {
    field: 'updateSchedule',
    label: labels.updateSchedule,
    component: 'Input',
    bottomHelpMessage: '定时更新 Cron 表达式，例如 0 30 3 * * * 表示每天凌晨 03:30执行一次。'
  },
  {
    field: 'autoUpdateGroups',
    label: labels.autoUpdateGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: '请选择要启用自动更新的群' },
    bottomHelpMessage: '插件会在上方Cron指定的时间，自动更新这些群的全部群员的信息'
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

];