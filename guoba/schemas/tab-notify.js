/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:25:11
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-03 21:05:00
 * @FilePath: /kh-plugin/guoba/schemas/tab-notify.js
 * @Description: 推送规则页面
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import labels from './labels.js';

export default [
  { component: 'SOFT_GROUP_BEGIN', label: '推送规则' },

  
  { component: 'Divider', label: '目标群聊' },
  {
    field: 'notifyGroups',
    label: labels.notifyGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: '请选择要实时推送身份变更的群' },
    bottomHelpMessage: `这些群里有人改名换头像后发言，机器人会捕获更新、并在群里推送历史身份卡片。
      \n一、此配置只是用于控制是否进行推送，即便不配置，bot依然会以默认10分钟的cd来判断在任何群发言了的任何群员的身份信息是否发生更新、并静默保存新身份资料。如不需要更新请配置黑白名单；
      \n二、对每个人的检测默认有10分钟间隔所以会有变更信息后即便发言也不立刻推送的可能；
      \n三、如果对该群配置了定时自动更新全员信息，那么如果该用户改名换头像后保持静默直到bot自动更新了其新身份后才发言，自然也不会触发推送。`
  },


  { component: 'Divider', label: '触发推送的类型' },
  { field: 'notifyDefaultAvatar', label: '头像变更', component: 'Switch', componentProps: { defaultValue: true } },
  { field: 'notifyDefaultNickname', label: '昵称变更', component: 'Switch', componentProps: { defaultValue: true } },
  { field: 'notifyDefaultTitle', label: '头衔变更', component: 'Switch', componentProps: { defaultValue: true } },
  { field: 'notifyDefaultCard', label: '群名片变更', component: 'Switch', componentProps: { defaultValue: true } },
  { field: 'notifyDefaultRole', label: '群权限变更', component: 'Switch', componentProps: { defaultValue: true } },


  { component: 'Divider', label: '为每个群定制推送规则' },
  {
    field: 'notifyRulesGroups',
    label: '自定义群推送规则',
    component: 'GSubForm',
    componentProps: {
      multiple: true,
      schemas: [
        {
          field: 'groupName',
          label: '群名',
          component: 'Input',
          componentProps: { placeholder: '保存后自动获取' }
        },
        {
          field: 'groupId',
          label: '群号',
          component: 'GSelectGroup',
          componentProps: { isRadioSelection: true, placeholder: '选择要单独配置推送规则的群' }
        },
        { field: 'avatar', label: '头像变更', component: 'Switch', componentProps: { defaultValue: false } },
        { field: 'nickname', label: '昵称变更', component: 'Switch', componentProps: { defaultValue: false } },
        { field: 'title', label: '头衔变更', component: 'Switch', componentProps: { defaultValue: false } },
        { field: 'card', label: '群名片变更', component: 'Switch', componentProps: { defaultValue: false } },
        { field: 'role', label: '群权限变更', component: 'Switch', componentProps: { defaultValue: false } }
      ]
    },
    bottomHelpMessage: '为特定群单独配置推送类型，覆盖全局默认规则。未在此处配置的群将使用上方全局默认规则。'
  },

];