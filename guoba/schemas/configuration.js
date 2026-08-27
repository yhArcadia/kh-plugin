const labels = {
  linkedGroups: '互通群组',
  maxSaveLength: '单人保留记录上限',
  maxRenderLength: 'kh卡最大条数',
  autoUpdateGroups: '自动更新群',
  updateSchedule: '自动更新 Cron',
  notifyGroups: '实时推送群',
  maxNotifyRenderLength: '实时推送记录数',
  monitorCD: '实时检测冷却（秒）',
  rankLimit: '排行榜人数',
  groupWhitelist: '群白名单',
  groupBlacklist: '群黑名单',
  userBlacklist: '用户黑名单',
  divingGroups: '潜水群'
};


export default [

  { component: 'SOFT_GROUP_BEGIN', label: '常用设置' },
  { component: 'Divider', label: '基础设置' },
  { field: 'maxSaveLength', label: labels.maxSaveLength, component: 'InputNumber', componentProps: { min: 1, max: 200 }, bottomHelpMessage: '每个用户在单个群内最多保存的记录条数，超过这个值的最早记录将被丢弃。' },
  { field: 'maxRenderLength', label: labels.maxRenderLength, component: 'InputNumber', componentProps: { min: 1, max: 100 }, bottomHelpMessage: '普通开合卡显示最近几条；大写KH会绕过此限制从而渲染完整的全部记录。' },
  { field: 'rankLimit', label: labels.rankLimit, component: 'InputNumber', componentProps: { min: 1, max: 500 }, bottomHelpMessage: '各类排行榜显示的最大人数(#换头大王、#老资历 等）。' },
  {
    field: 'reverseHistoryThreshold',
    label: '身份卡片倒序显示',
    component: 'InputNumber',
    componentProps: { min: 0, max: 999 },
    bottomHelpMessage: '要渲染的记录数超过此值时，将倒序显示，最新记录在前，方便查看。0 表示始终倒序，999 可视为始终正序。'
  },



  { component: 'Divider', label: '实时检测与推送' },
  { field: 'monitorCD', label: labels.monitorCD, component: 'InputNumber', componentProps: { min: 5, max: 86400 }, bottomHelpMessage: '对同一成员实时检测的间隔，单位秒。\n默认会全量判断在任何群发言了的任何群员的身份信息是否发生更新、并静默保存新身份资料，除非配置了黑白名单。' },
  { field: 'maxNotifyRenderLength', label: labels.maxNotifyRenderLength, component: 'InputNumber', componentProps: { min: 1, max: 200 }, bottomHelpMessage: '群员发言时本检测到身份信息更新后，触发的实时推送图片中包含的历史条数。默认2条即为新身份和上一身份。' },
  {
    field: 'notifyGroups',
    label: labels.notifyGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: `请选择要实时推送身份变更的群` },
    bottomHelpMessage: `
      这些群里有人改名换头像后发言，机器人会捕获更新、并在群里推送历史身份卡片。
      \n一、此配置只是用于控制是否进行推送，即便不配置，bot依然会以默认10分钟的cd来判断在任何群发言了的任何群员的身份信息是否发生更新、并静默保存新身份资料。如不需要更新请配置黑白名单；
      \n二、对每个人的检测默认有10分钟间隔所以会有变更信息后即便发言也不立刻推送的可能；
      \n三、如果对该群配置了定时自动更新全员信息，那么如果该用户改名换头像后保持静默直到bot自动更新了其新身份后才发言，自然也不会触发推送。
      `
  },

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
    bottomHelpMessage: `黑名单中的用户，插件将始终不更新其在任何群中的信息。`
  },
  {
    field: 'groupWhitelist',
    label: labels.groupWhitelist,
    component: 'GSelectGroup',
    componentProps: { placeholder: `选择白名单群` },
    bottomHelpMessage: `配置后，定时更新和群员发言实时检测将只在这些群生效。配置此项将导致【群黑名单不再生效】。`
  },
  {
    field: 'groupBlacklist',
    label: labels.groupBlacklist,
    component: 'GSelectGroup',
    componentProps: { placeholder: `选择黑名单群` },
    bottomHelpMessage: `黑名单中的群，插件始终不更新其任何群员的信息。仅在【群白名单为空】时，群黑名单才生效。注意：主人依旧可以使用 更新群员信息 或 静默更新信息 来手动更新群员（黑名单用户除外）的信息。`
  },
  {
    field: 'divingGroups',
    label: labels.divingGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: `请选择潜水群` },
    bottomHelpMessage: `在这些群中，依然可正常记录与更新群员的信息，但无法触发本插件的任何文本或图片响应，以此避免暴露Bot身份。\n主人在潜水群发送“更新群员信息”会转为执行“静默更新信息”。`
  },


  { component: 'SOFT_GROUP_BEGIN', label: '进阶配置' },
  { component: 'Divider', label: '自动更新与定时任务' },
  { field: 'updateSchedule', label: labels.updateSchedule, component: 'Input', bottomHelpMessage: '定时更新 Cron 表达式，例如 0 30 3 * * * 表示每天凌晨 03:30执行一次。保存后重启 Yunzai 使配置和调度器生效。' },
  {
    field: 'autoUpdateGroups',
    label: labels.autoUpdateGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: `请选择要启用自动更新的群` },
    bottomHelpMessage: `插件会在上方Cron指定的时间，自动更新这些群的全部群员的信息`
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
          field: 'groupIds',
          label: '互通群',
          component: 'GSelectGroup',
          componentProps: { multiple: true, placeholder: '选择同一互通组内的群' }
        }
      ]
    },
    bottomHelpMessage: `什么时候需要配置互通组：对于同一组织体系下的多个群，其群员会有一定重复。如当“我们”都重复加了某组织的1群和2群，此时“你”在这两个群的身份都对“我”可见，那么在查询“你”的身份时，Bot同时提供“你”在另一个群的身份则有助于“我”了解“你”是谁。
      \n各组可交叉。`
  },

  // { component: 'Divider', label: '成员身份记录查询' },
  // {
  //   field: 'whoRecordActions', label: '记录查询工具', component: 'GButtons',
  //   componentProps: {
  //     buttons: [
  //       { label: '统计概览', type: 'primary', action: 'statistics', args: [5000, false], tooltip: { title: '扫描最多 5000 条 Who 成员索引，统计群和记录数', placement: 'top' } },
  //       { label: '刷新统计', action: 'statistics', args: [5000, true], tooltip: { title: '忽略 30 秒缓存后重新统计', placement: 'top' } }
  //     ]
  //   },
  //   bottomHelpMessage: '点击后会在页面右上角显示简要结果。完整记录查询请使用下方接口（群号、QQ号）。'
  // },
  // { field: 'whoRecordGroupId', label: '查询群号', component: 'InputNumber', componentProps: { min: 1, precision: 0 }, bottomHelpMessage: '填写群号后，可读取该群成员列表' },
  // { field: 'whoRecordUserId', label: '查询 QQ号', component: 'InputNumber', componentProps: { min: 1, precision: 0 }, bottomHelpMessage: '配合群号读取此成员最近的身份变更记录。' },
  // {
  //   field: 'whoRecordQueryActions', label: '按号查询', component: 'GButtons',
  //   componentProps: {
  //     buttons: [
  //       { label: '查询该群成员', action: 'members', args: ['#{whoRecordGroupId}', 1, 30] },
  //       { label: '查询该成员历史', type: 'primary', action: 'memberHistory', args: ['#{whoRecordGroupId}', '#{whoRecordUserId}', 50] },
  //       { label: '黑名单成员预览', action: 'blacklistPreview', args: [] }
  //     ]
  //   },
  //   bottomHelpMessage: '查询结果列表默认每页 30 人，单人历史默认最近 50 条。'
  // },

];