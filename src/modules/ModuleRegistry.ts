import type { FeatureModule } from './FeatureModule.js';
import { documentModule } from './document/index.js';
import { taskModule } from './task/index.js';
import { calendarModule } from './calendar/index.js';
import { memberModule } from './member/index.js';

const ALL_MODULES: FeatureModule[] = [
  documentModule,
  taskModule,
  calendarModule,
  memberModule,
];

/**
 * 模块隐式依赖表
 * key 模块存在时，自动引入 value 中的依赖模块（无需用户手动配置）
 */
const IMPLICIT_DEPS: Record<string, string[]> = {
  task: ['member'],
  calendar: ['member'],
};

/** 仅 user 认证支持的模块（tenant 模式下不加载） */
const USER_ONLY_MODULES = new Set<string>(['task', 'calendar', 'member']);

/**
 * 功能模块注册中心
 * 根据配置的 enabledModules 过滤出需要激活的模块，并自动补全隐式依赖
 */
export class ModuleRegistry {
  static readonly moduleMap = new Map<string, FeatureModule>(ALL_MODULES.map(m => [m.id, m]));

  /**
   * 根据配置的模块 ID 列表返回对应的模块实例
   * 会自动补全隐式依赖（如启用 task/calendar 时自动带入 member）
   * 仅 user 认证时加载 task、calendar、member；tenant 模式下自动排除
   * @param enabledIds 已启用的模块 ID，传入 ['all'] 则返回全部模块
   * @param authType 认证类型，'tenant' 时 task/calendar/member 不加载
   */
  static getEnabledModules(enabledIds: string[], authType: 'tenant' | 'user' = 'tenant'): FeatureModule[] {
    if (enabledIds.includes('all')) {
      return authType === 'user' ? ALL_MODULES : ALL_MODULES.filter(m => !USER_ONLY_MODULES.has(m.id));
    }

    const resolved = new Set<string>(enabledIds);
    for (const id of enabledIds) {
      for (const dep of IMPLICIT_DEPS[id] ?? []) {
        resolved.add(dep);
      }
    }

    if (authType === 'tenant') {
      for (const id of USER_ONLY_MODULES) resolved.delete(id);
    }

    return ALL_MODULES.filter(m => resolved.has(m.id));
  }

  /** 返回所有可用模块的 ID 列表 */
  static getAllModuleIds(): string[] {
    return Array.from(ModuleRegistry.moduleMap.keys());
  }

  /** 返回所有可用模块 */
  static getAllModules(): FeatureModule[] {
    return [...ALL_MODULES];
  }
}
