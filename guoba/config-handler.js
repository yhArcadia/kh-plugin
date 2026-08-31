/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-09-01 01:16:10
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-09-01 01:20:27
 * @FilePath: /kh-plugin/guoba/config-handler.js
 * @Description: 配置数据转换：UI - YAML
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { loadUserConfig, saveConfig, linkedGroupsToGuoba, notifyRulesGroupsToGuoba } from '../components/config.js';
import { getGroupName } from '../utils/group-name.js';

export let statsCache = { expiresAt: 0, value: null };

export function getConfigData() {
  const cfg = loadUserConfig();
  const def = cfg.notifyRules?.default || {};
  const groups = notifyRulesGroupsToGuoba(cfg.notifyRules).map(g => ({
    ...g,
    groupName: getGroupName(g.groupId)
  }));
  return {
    ...cfg,
    linkedGroups: linkedGroupsToGuoba(cfg.linkedGroups),
    notifyDefaultAvatar: def.avatar,
    notifyDefaultNickname: def.nickname,
    notifyDefaultTitle: def.title,
    notifyDefaultCard: def.card,
    notifyDefaultRole: def.role,
    notifyRulesGroups: groups
  };
}

export async function setConfigData(data) {
  data.notifyRulesDefault = {
    avatar: data.notifyDefaultAvatar,
    nickname: data.notifyDefaultNickname,
    title: data.notifyDefaultTitle,
    card: data.notifyDefaultCard,
    role: data.notifyDefaultRole
  };
  delete data.notifyDefaultAvatar;
  delete data.notifyDefaultNickname;
  delete data.notifyDefaultTitle;
  delete data.notifyDefaultCard;
  delete data.notifyDefaultRole;

  const groupNameMap = {};
  if (Array.isArray(data.notifyRulesGroups)) {
    for (const g of data.notifyRulesGroups) {
      if (g.groupId && g.groupName) groupNameMap[String(g.groupId)] = g.groupName;
    }
    data.notifyRulesGroups = data.notifyRulesGroups.map(g => {
      const { groupName, ...rest } = g;
      return {
        groupId: rest.groupId,
        avatar: rest.avatar ?? false,
        nickname: rest.nickname ?? false,
        title: rest.title ?? false,
        card: rest.card ?? false,
        role: rest.role ?? false
      };
    });
  }

  const saved = saveConfig(data);
  statsCache = { expiresAt: 0, value: null };

  const def = saved.notifyRules?.default || {};
  const { notifyRules: _nr, ...restSaved } = saved;
  const groups = notifyRulesGroupsToGuoba(saved.notifyRules).map(g => ({
    ...g,
    groupName: groupNameMap[String(g.groupId)] || getGroupName(g.groupId)
  }));

  return {
    ...restSaved,
    linkedGroups: linkedGroupsToGuoba(saved.linkedGroups),
    notifyDefaultAvatar: def.avatar,
    notifyDefaultNickname: def.nickname,
    notifyDefaultTitle: def.title,
    notifyDefaultCard: def.card,
    notifyDefaultRole: def.role,
    notifyRulesGroups: groups,
    notice: '配置已保存，重启Yunzai后全部配置生效。'
  };
}