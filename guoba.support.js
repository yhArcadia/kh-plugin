import { loadConfig, loadUserConfig, saveConfig, configPaths, linkedGroupsToGuoba } from './components/config.js';
import { scanHistoryKeys, getHistory } from './components/storage.js';


const STATS_CACHE_TTL_MS = 30_000;
const GROUPS_PAGE_SIZE = 50;
const MEMBERS_PAGE_SIZE = 30;

function resultOk(Result, data, message = '操作成功') {
  return Result?.ok ? Result.ok(data, message) : { ok: true, data, message };
}

function resultError(Result, message) {
  return Result?.error ? Result.error(message) : { ok: false, message };
}
let statsCache = { expiresAt: 0, value: null };

const labels = {
  linkedGroups: '互通群组',
  maxSaveLength: '单人保留记录上限',
  maxRenderLength: 'KH卡最大渲染记录条数',
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

const schemas = [

  { component: 'Divider', label: '基础设置' },
  { field: 'maxSaveLength', label: labels.maxSaveLength, component: 'InputNumber', componentProps: { min: 1, max: 200 }, bottomHelpMessage: '每个用户在单个群内最多保存的记录条数，超过这个值的最早记录将被丢弃。' },
  { field: 'maxRenderLength', label: labels.maxRenderLength, component: 'InputNumber', componentProps: { min: 1, max: 100 }, bottomHelpMessage: '普通开合卡显示最近几条；大写KH会绕过此限制从而渲染完整的全部记录。' },
  { field: 'rankLimit', label: labels.rankLimit, component: 'InputNumber', componentProps: { min: 1, max: 500 }, bottomHelpMessage: '各类排行榜显示的最大人数(#换头大王、#老资历 等）。' },



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



  { component: 'Divider', label: '自动更新与定时任务' },
  { field: 'updateSchedule', label: labels.updateSchedule, component: 'Input', bottomHelpMessage: '定时更新 Cron 表达式，例如 0 30 3 * * * 表示每天凌晨 03:30执行一次。保存后重启 Yunzai 使配置和调度器生效。' },
  {
    field: 'autoUpdateGroups',
    label: labels.autoUpdateGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: `请选择要启用自动更新的群` },
    bottomHelpMessage: `插件会在上方Cron指定的时间，自动更新这些群的全部群员的信息`
  },



  { component: 'Divider', label: '黑白名单：插件默认对全部群的全部成员生效，可修改下方三个名单来控制范围。' },
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



  { component: 'Divider', label: '范围与权限' },
  {
    field: 'divingGroups',
    label: labels.divingGroups,
    component: 'GSelectGroup',
    componentProps: { placeholder: `请选择潜水群` },
    bottomHelpMessage: `在这些群中，依然可正常记录与更新群员的信息，但无法触发本插件的任何文本或图片响应，以此避免暴露Bot身份。\n主人在潜水群发送“更新群员信息”会转为执行“静默更新信息”。`
  },
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

function redisClient() {
  if (!global.redis) throw new Error('Redis 尚未连接，无法读取 WhoAreYou 数据。');
  return global.redis;
}

function parseKey(key, prefix) {
  const rest = key.slice(`${prefix}:`.length).split(':');
  if (rest.length !== 2 || !/^\d+$/.test(rest[0]) || !/^\d+$/.test(rest[1])) return null;
  return { groupId: Number(rest[0]), userId: Number(rest[1]) };
}
async function normalizeActionArgs(args, keys) {
  if (Array.isArray(args)) return Object.fromEntries(keys.map((key, index) => [key, args[index]]));
  return args && typeof args === 'object' ? args : {};
}

async function statistics(input = {}) {
  const { maxKeys = 2000, refresh = false } = await normalizeActionArgs(input, ['maxKeys', 'refresh']);
  if (!refresh && statsCache.value && statsCache.expiresAt > Date.now()) return { ...statsCache.value, cached: true };
  const config = loadConfig();
  const keys = await scanHistoryKeys(redisClient(), config, null, { count: 250, maxKeys: Math.min(20000, Math.max(1, Number(maxKeys) || 5000)) });
  const groups = new Map();
  let recordCount = 0;
  for (const key of keys) {
    const parsed = parseKey(key, config.redisPrefix);
    if (!parsed) continue;
    const history = await getHistory(redisClient(), config, parsed.groupId, parsed.userId);
    recordCount += history.length;
    const item = groups.get(parsed.groupId) || { groupId: parsed.groupId, members: 0, records: 0, latestRecordTime: '' };
    item.members++;
    item.records += history.length;
    const latest = history.at(-1)?.recordTime || '';
    if (latest > item.latestRecordTime) item.latestRecordTime = latest;
    groups.set(parsed.groupId, item);
  }
  const result = { capped: keys.length >= maxKeys, scannedMemberKeys: keys.length, scannedRecords: recordCount, groups: [...groups.values()].sort((a, b) => b.records - a.records), dataPath: configPaths.legacyDataRoot, cached: false };
  statsCache = { value: result, expiresAt: Date.now() + STATS_CACHE_TTL_MS };
  return result;
}

async function members(input = {}) {
  let { groupId, page = 1, pageSize = 30 } = await normalizeActionArgs(input, ['groupId', 'page', 'pageSize']);
  const config = loadConfig();
  const gid = Number(groupId);
  if (!Number.isFinite(gid) || gid <= 0) throw new Error('groupId 必须是有效群号。');
  page = Math.max(1, Math.floor(Number(page) || 1));
  pageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 30)));
  const keys = await scanHistoryKeys(redisClient(), config, gid, { count: 250, maxKeys: 10000 });
  const slice = keys.sort().slice((page - 1) * pageSize, page * pageSize);
  const items = await Promise.all(slice.map(async key => {
    const parsed = parseKey(key, config.redisPrefix);
    const history = await getHistory(redisClient(), config, gid, parsed.userId);
    const latest = history.at(-1) || {};
    return { userId: parsed.userId, records: history.length, nickname: latest.nickname || '', card: latest.card || '', title: latest.title || '', recordTime: latest.recordTime || '', avatarChangedAt: latest.headtime || null };
  }));
  return { groupId: gid, page, pageSize, totalMembers: keys.length, capped: keys.length >= 10000, items };
}

async function memberHistory(input = {}) {
  let { groupId, userId, limit = 50 } = await normalizeActionArgs(input, ['groupId', 'userId', 'limit']);
  const config = loadConfig();
  const gid = Number(groupId), uid = Number(userId);
  if (!Number.isFinite(gid) || !Number.isFinite(uid) || gid <= 0 || uid <= 0) throw new Error('groupId 和 userId 必须为有效数字。');
  limit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  const history = await getHistory(redisClient(), config, gid, uid);
  return { groupId: gid, userId: uid, totalRecords: history.length, truncated: history.length > limit, records: history.slice(-limit) };
}

async function blacklistPreview() {
  const config = loadConfig();
  const wanted = new Set((config.userBlacklist || []).slice(0, 100).map(Number));
  const latestByUser = new Map();
  if (wanted.size) {
    const client = redisClient();
    const keys = await scanHistoryKeys(client, config, null, { count: 250, maxKeys: 20000 });
    for (const key of keys) {
      const parsed = parseKey(key, config.redisPrefix);
      if (!parsed || !wanted.has(parsed.userId)) continue;
      const candidate = (await getHistory(client, config, parsed.groupId, parsed.userId)).at(-1);
      const previous = latestByUser.get(parsed.userId);
      if (candidate && (!previous || String(candidate.recordTime || '') > String(previous.recordTime || ''))) latestByUser.set(parsed.userId, candidate);
    }
  }
  return [...wanted].map(userId => {
    const latest = latestByUser.get(userId);
    return { userId, name: latest?.card || latest?.nickname || '', avatar: `https://q1.qlogo.cn/g?b=qq&s=100&nk=${userId}` };
  });
}

function briefActionResult(action, data) {
  if (action === 'statistics') return `已统计 ${data.scannedMemberKeys} 个成员索引、${data.scannedRecords} 条身份记录，涉及 ${data.groups.length} 个群${data.capped ? '（达到扫描上限）' : ''}。`;
  if (action === 'members') return `群 ${data.groupId}：第 ${data.page} 页返回 ${data.items.length} 人，共扫描到 ${data.totalMembers} 名成员${data.capped ? '（达到扫描上限）' : ''}。`;
  if (action === 'memberHistory') return `群 ${data.groupId} 的 QQ ${data.userId}：共 ${data.totalRecords} 条记录，返回最近 ${data.records.length} 条${data.truncated ? '。' : '。'}`;
  if (action === 'blacklistPreview') return `已整理 ${data.length} 名黑名单成员的最新昵称/头像预览。`;
  return '操作成功。';
}

async function runAction(action, input, context = {}) {
  const Result = context?.Result;
  try {
    const data = await action(input);
    return resultOk(Result, data, briefActionResult(action.name, data));
  } catch (error) {
    return resultError(Result, error?.message || '操作失败。');
  }
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'who-are-you-plugin',
      title: 'who-are-you-plugin',
      author: '渔火Arcadia',
      authorLink: 'https://github.com/yhArcadia',
      link: 'https://github.com/yhArcadia/who-are-you-plugin',
      isV2: false,
      isV3: true,
      showInMenu: 'auto',
      description: '群成员头像昵称记录留档工具，有效制裁群友“改头换面”、秽土转生。(如链接打不开请把github换成gitee)'
    },
    configInfo: {
      schemas,
      getConfigData: () => ({
        ...loadUserConfig(),
        linkedGroups: linkedGroupsToGuoba(loadUserConfig().linkedGroups)
      }),
      setConfigData: async data => {
        const saved = saveConfig(data);
        statsCache = { expiresAt: 0, value: null };
        return { ...saved, linkedGroups: linkedGroupsToGuoba(saved.linkedGroups), notice: '配置已保存，重启Yunzai后全部配置生效。' };
      },
      actions: {
        statistics: (args, context) => runAction(statistics, args, context),
        members: (args, context) => runAction(members, args, context),
        memberHistory: (args, context) => runAction(memberHistory, args, context),
        blacklistPreview: (args, context) => runAction(blacklistPreview, args, context)
      }
    }
  };
}
