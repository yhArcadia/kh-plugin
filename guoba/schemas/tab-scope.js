/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 19:25:28
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 19:43:33
 * @FilePath: /kh-plugin/guoba/schemas/tab-scope.js
 * @Description: 生效范围配置页
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import labels from './labels.js';

export default [
  { component: 'SOFT_GROUP_BEGIN', label: '生效范围' },

  
  {
    field: 'userBlacklist',
    label: labels.userBlacklist,
    component: 'GTags',
    componentProps: {
      allowAdd: true,
      allowDel: true,
      showPrompt: true,
      promptProps: {
        content: `请输入${labels.userBlacklist}的 QQ号`,
        placeholder: '纯数字 QQ 号',
        okText: '添加'
      }
    },
    bottomHelpMessage: '黑名单中的用户，插件将始终不更新其在任何群中的信息。'
  },
  {
    field: 'groupWhitelist',
    label: labels.groupWhitelist,
    component: 'GSelectGroup',
    componentProps: { placeholder: '选择白名单群' },
    bottomHelpMessage: '配置后，定时更新和群员发言实时检测将只在这些群生效。配置此项将导致【群黑名单不再生效】。'
  },
  {
    field: 'groupBlacklist',
    label: labels.groupBlacklist,
    component: 'GSelectGroup',
    componentProps: { placeholder: '选择黑名单群' },
    bottomHelpMessage: '黑名单中的群，插件始终不更新其任何群员的信息。仅在【群白名单为空】时，群黑名单才生效。注意：主人依旧可以使用 更新群员信息 或 静默更新信息 来手动更新群员（黑名单用户除外）的信息。'
  },
  {
    field: 'divingGroups',
    label: labels.divingGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: '请选择潜水群' },
    bottomHelpMessage: '在这些群中，依然可正常记录与更新群员的信息，但无法触发本插件的任何文本或图片响应，以此避免暴露Bot身份。\n主人在潜水群发送"更新群员信息"会转为执行"静默更新信息"。'
  },

];