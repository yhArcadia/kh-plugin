import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configDir = path.join(pluginRoot, 'config');
const defaultConfigPath = path.join(configDir, 'default_config.yaml');
const userConfigPath = path.join(configDir, 'config.yaml');
const legacyDataRoot = path.join(process.cwd(), 'data', 'who_are_you_plugin');  //兼容旧版插件数据目录，将旧版配置从yunzai/data迁移至插件目录下
const legacyConfigDir = path.join(legacyDataRoot, 'config');
const legacyDefaultConfigPath = path.join(legacyConfigDir, 'default_config.yaml');
const legacyUserConfigPath = path.join(legacyConfigDir, 'config.yaml');

export const systemConfig = Object.freeze({
  avatarFetchTimeout: 5000,
  dataFolderName: 'who_are_you_plugin',
  redisPrefix: 'Yunzai:plugin:who_are_you',
  lockKeyOperation: ':lock:operation',
  lockTTL: 3600
});

const NOTIFY_RULE_KEYS = ['avatar', 'nickname', 'title', 'card', 'role'];

function normalizeNotifyRule(rule) {
  if (!rule || typeof rule !== 'object') rule = {};
  const out = {};
  for (const key of NOTIFY_RULE_KEYS) {
    out[key] = rule[key] !== false;
  }
  return out;
}

function normalizeNotifyRules(value) {
  if (!value || typeof value !== 'object') {
    return { default: normalizeNotifyRule(null), groups: {} };
  }
  const def = normalizeNotifyRule(value.default);
  const rawGroups = value.groups;
  const groups = {};
  if (rawGroups && typeof rawGroups === 'object' && !Array.isArray(rawGroups)) {
    for (const [gid, rule] of Object.entries(rawGroups)) {
      const num = Number(gid);
      if (Number.isFinite(num) && num > 0) {
        groups[num] = normalizeNotifyRule(rule);
      }
    }
  }
  return { default: def, groups };
}

/** 正常运行时 default_config.yaml 是用户配置默认值的唯一来源。 */
export const defaultConfig = Object.freeze({
  linkedGroups: [],
  maxSaveLength: 100,
  maxRenderLength: 10,
  reverseHistoryThreshold: 999,
  autoUpdateGroups: [],
  updateSchedule: '0 30 3 * * *',
  notifyGroups: [],
  maxNotifyRenderLength: 2,
  monitorCD: 600,
  rankLimit: 20,
  groupWhitelist: [],
  groupBlacklist: [],
  userBlacklist: [],
  divingGroups: [],
  notifyRules: Object.freeze({
    default: Object.freeze({ avatar: true, nickname: true, title: true, card: true, role: true }),
    groups: Object.freeze({})
  })
});

const configFields = Object.freeze(Object.keys(defaultConfig));
const numericFields = new Set(['maxSaveLength', 'maxRenderLength', 'reverseHistoryThreshold', 'maxNotifyRenderLength', 'monitorCD', 'rankLimit']);
const arrayFields = new Set(['linkedGroups', 'autoUpdateGroups', 'notifyGroups', 'groupWhitelist', 'groupBlacklist', 'userBlacklist', 'divingGroups']);
const header = `# =======================================
# 请将需要自定义的配置项从 default_config.yaml 复制到本文件并填写值。未在这里定义的配置将采用default_config.yaml的默认值。
# 修改后需重启生效。
# 如需反馈问题或建议可加群134086404
# =======================================
`;

function ensurePaths() { fs.mkdirSync(configDir, { recursive: true }); }

function migrateLegacyConfigIfNeeded() {
  if (fs.existsSync(userConfigPath) || !fs.existsSync(legacyUserConfigPath)) return false;
  fs.copyFileSync(legacyUserConfigPath, userConfigPath);
  if (!fs.existsSync(defaultConfigPath) && fs.existsSync(legacyDefaultConfigPath)) fs.copyFileSync(legacyDefaultConfigPath, defaultConfigPath);
  return true;
}

function parseYaml(file, label) {
  try { return YAML.parse(fs.readFileSync(file, 'utf8')) || {}; }
  catch (error) { throw new Error(`${label} YAML 格式错误：${error.message}`); }
}

function normalizeLinkedGroups(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => Array.isArray(item) ? item : (item?.groupIds ?? item?.groups ?? item))
    .map(group => Array.isArray(group) ? group : String(group ?? '').split(/[，,\s]+/))
    .map(group => [...new Set(group.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))])
    .filter(group => group.length > 0);
}

function normalize(raw = {}, fallbacks = defaultConfig) {
  const out = {};
  for (const field of configFields) {
    const fallback = fallbacks[field] ?? defaultConfig[field];
    let value = raw[field] ?? fallback;
    if (numericFields.has(field)) {
      value = Math.max(0, Math.floor(Number(value) || 0));
      if (field === 'maxSaveLength') value = Math.max(1, value);
      if (field === 'rankLimit') value = Math.min(500, Math.max(1, value));
    }
    if (arrayFields.has(field)) {
      if (!Array.isArray(value)) value = [];
      value = field === 'linkedGroups'
        ? normalizeLinkedGroups(value)
        : [...new Set(value.map(Number).filter(Number.isFinite))];
    }
    if (field === 'updateSchedule') value = String(value || fallback).trim();
    if (field === 'notifyRules') value = normalizeNotifyRules(value);
    out[field] = value;
  }
  return out;
}

function equalValue(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function writeUserOverrides(overrides) {
  const body = Object.keys(overrides).length ? YAML.stringify(overrides, null, { lineWidth: 0 }) : '';
  const cleaned = body.replace(/^(\s+)"(\d+)":/gm, '$1$2:');
  fs.writeFileSync(userConfigPath, `${header}${cleaned}`, 'utf8');
}

export function loadDefaultConfig() {
  ensurePaths();
  if (!fs.existsSync(defaultConfigPath)) fs.writeFileSync(defaultConfigPath, YAML.stringify(defaultConfig), 'utf8');
  return normalize(parseYaml(defaultConfigPath, '默认配置'), defaultConfig);
}

export function loadUserOverrides() {
  ensurePaths();
  migrateLegacyConfigIfNeeded();
  if (!fs.existsSync(userConfigPath)) writeUserOverrides({});
  const raw = parseYaml(userConfigPath, '用户配置');
  return Object.fromEntries(configFields.filter(field => raw[field] !== undefined).map(field => [field, raw[field]]));
}

export function loadUserConfig() {
  const base = loadDefaultConfig();
  return normalize({ ...base, ...loadUserOverrides() }, base);
}

export function loadConfig() { return { ...systemConfig, ...loadUserConfig() }; }

// 将内部 number[][] 转为锅巴 GSubForm/GSelectGroup 所需的对象行。
export function linkedGroupsToGuoba(value) {
  return normalizeLinkedGroups(value).map(groupIds => ({ groupIds }));
}

// 仅在 Guoba 提交时接受其对象行；其余来源仍走旧的兼容规范化。
export function linkedGroupsFromGuoba(value) {
  if (!Array.isArray(value)) return value;
  return value.map(item => Array.isArray(item) ? item : (item?.groupIds ?? item?.groups ?? item));
}

// 将 notifyRules.groups (object) 转为锅巴 GSubForm 数组格式
export function notifyRulesGroupsToGuoba(notifyRules) {
  const groups = notifyRules?.groups;
  if (!groups || typeof groups !== 'object') return [];
  return Object.entries(groups).map(([gid, rule]) => ({
    groupId: Number(gid),
    ...normalizeNotifyRule(rule)
  }));
}

// 将锅巴 GSubForm 数组格式转回 notifyRules.groups (object)
export function notifyRulesGroupsFromGuoba(arr) {
  if (!Array.isArray(arr)) return {};
  const groups = {};
  for (const item of arr) {
    const gid = Number(item?.groupId);
    if (Number.isFinite(gid) && gid > 0) {
      groups[gid] = normalizeNotifyRule(item);
    }
  }
  return groups;
}

// 写入局部用户覆盖；Guoba 的 linkedGroups 对象行在这里转换回兼容的 number[][]。
export function saveConfig(input = {}) {
  const base = loadDefaultConfig();
  const previous = loadUserOverrides();
  const safeInput = Object.fromEntries(configFields.filter(field => input[field] !== undefined).map(field => [field, input[field]]));
  if (safeInput.linkedGroups !== undefined) safeInput.linkedGroups = linkedGroupsFromGuoba(safeInput.linkedGroups);
  if (input.notifyRulesDefault !== undefined || input.notifyRulesGroups !== undefined) {
    safeInput.notifyRules = {
      default: normalizeNotifyRule(input.notifyRulesDefault ?? previous.notifyRules?.default ?? base.notifyRules.default),
      groups: notifyRulesGroupsFromGuoba(input.notifyRulesGroups ?? previous.notifyRules?.groups ?? base.notifyRules.groups)
    };
  }
  const effective = normalize({ ...base, ...previous, ...safeInput }, base);
  const overrides = Object.fromEntries(configFields
    .filter(field => !equalValue(effective[field], base[field]))
    .map(field => [field, effective[field]]));
  writeUserOverrides(overrides);
  return effective;
}

export const configPaths = Object.freeze({
  pluginRoot, legacyDataRoot, configDir, defaultConfigPath, userConfigPath,
  legacyConfigDir, legacyDefaultConfigPath, legacyUserConfigPath
});