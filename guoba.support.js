import { pluginRoot } from './components/paths.js';
import { getConfigData, setConfigData } from './guoba/config-handler.js';
import { statistics, members, memberHistory, blacklistPreview, runAction } from './guoba/actions/index.js';
import configuration_schemas from './guoba/schemas/schema.js';
import path from 'path';

const schemas = [...configuration_schemas];

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'kh-plugin',
      title: 'Kh-Plugin',
      author: '渔火Arcadia',
      authorLink: 'https://github.com/yhArcadia',
      link: 'https://github.com/yhArcadia/kh-plugin',
      isV2: false,
      isV3: true,
      showInMenu: 'auto',
      iconPath: path.join(pluginRoot, 'resources/img/icon.png'),
      description: '群成员头像昵称记录留档工具，有效制裁群友“改头换面”、秽土转生。(如链接打不开请把github换成gitee)'
    },
    configInfo: {
      schemas,
      getConfigData,
      setConfigData,
      actions: {
        statistics: (args, ctx) => runAction(statistics, args, ctx),
        members: (args, ctx) => runAction(members, args, ctx),
        memberHistory: (args, ctx) => runAction(memberHistory, args, ctx),
        blacklistPreview: (args, ctx) => runAction(blacklistPreview, args, ctx)
      }
    }
  };
}