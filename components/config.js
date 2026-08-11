import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configDir = path.join(pluginRoot, 'config');
const defaultConfigPath = path.join(configDir, 'default_config.yaml');
const userConfigPath = path.join(configDir, 'config.yaml');
const legacyDataRoot = path.join(process.cwd(), 'data', 'who_are_you_plugin');
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

/** 正常运行时 default_config.yaml 是用户配置默认值的唯一来源。 */
export const defaultConfig = Object.freeze({
  linkedGroups: [],
  maxSaveLength: 100,
  maxRenderLength: 10,
  autoUpdateGroups: [],
  updateSchedule: '0 30 3 * * *',
  notifyGroups: [],
  maxNotifyRenderLength: 2,
  monitorCD: 600,
  rankLimit: 20,
  groupWhitelist: [],
  groupBlacklist: [],
  userBlacklist: [],
  divingGroups: []
});

const configFields = Object.freeze(Object.keys(defaultConfig));
const numericFields = new Set(['maxSaveLength', 'maxRenderLength', 'maxNotifyRenderLength', 'monitorCD', 'rankLimit']);
const arrayFields = new Set(['linkedGroups', 'autoUpdateGroups', 'notifyGroups', 'groupWhitelist', 'groupBlacklist', 'userBlacklist', 'divingGroups']);
const header = '# WhoAreYou 用户配置。仅填写需要覆盖 default_config.yaml 的项目。\n';

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
    out[field] = value;
  }
  return out;
}

function equalValue(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function writeUserOverrides(overrides) {
  const body = Object.keys(overrides).length ? YAML.stringify(overrides) : '';
  fs.writeFileSync(userConfigPath, `${header}${body}`, 'utf8');
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

// 写入局部用户覆盖；Guoba 的 linkedGroups 对象行在这里转换回兼容的 number[][]。
export function saveConfig(input = {}) {
  const base = loadDefaultConfig();
  const previous = loadUserOverrides();
  const safeInput = Object.fromEntries(configFields.filter(field => input[field] !== undefined).map(field => [field, input[field]]));
  if (safeInput.linkedGroups !== undefined) safeInput.linkedGroups = linkedGroupsFromGuoba(safeInput.linkedGroups);
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
