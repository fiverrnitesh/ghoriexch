import type { GameDefinition, GamePlugin } from '../types/game-definition.js';

export class GameRegistry {
  private plugins = new Map<string, GamePlugin>();

  register(plugin: GamePlugin): void {
    const slug = plugin.definition.meta.slug;
    if (this.plugins.has(slug)) {
      throw new Error(`Game plugin already registered: ${slug}`);
    }
    this.plugins.set(slug, plugin);
  }

  unregister(slug: string): boolean {
    return this.plugins.delete(slug);
  }

  get(slug: string): GameDefinition | undefined {
    return this.plugins.get(slug)?.definition;
  }

  getPlugin(slug: string): GamePlugin | undefined {
    return this.plugins.get(slug);
  }

  list(): GameDefinition[] {
    return Array.from(this.plugins.values()).map((p) => p.definition);
  }

  has(slug: string): boolean {
    return this.plugins.has(slug);
  }

  async initializeAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.initialize?.();
    }
  }

  async shutdownAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.shutdown?.();
    }
  }
}

export const gameRegistry = new GameRegistry();
