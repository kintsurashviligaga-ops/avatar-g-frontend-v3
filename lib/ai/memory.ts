export interface ShortTermMemoryEntry { key: string; value: string; createdAt: number; }
export interface MidTermMemoryEntry { id: string; context: string; createdAt: number; lastUsedAt: number; }
export interface LongTermMemoryEntry { id: string; type: 'preference' | 'persona' | 'style' | 'goal'; payload: Record<string, unknown>; createdAt: number; updatedAt: number; }

class MemoryEngine {
  private shortTerm: ShortTermMemoryEntry[] = [];
  private midTerm: MidTermMemoryEntry[] = [];
  private longTerm: LongTermMemoryEntry[] = [];

  addShortTerm(item: ShortTermMemoryEntry) {
    this.shortTerm.push(item);
    if (this.shortTerm.length > 50) this.shortTerm.shift();
  }

  addMidTerm(item: MidTermMemoryEntry) {
    this.midTerm = [...this.midTerm.filter((x) => x.id !== item.id), item];
  }

  addLongTerm(item: LongTermMemoryEntry) {
    this.longTerm = [...this.longTerm.filter((x) => x.id !== item.id), item];
  }

  queryShortTerm() {
    return this.shortTerm;
  }

  queryMidTerm(query: string) {
    const normalized = query.toLowerCase();
    return this.midTerm.filter((item) => item.context.toLowerCase().includes(normalized));
  }

  getLongTerm() {
    return this.longTerm;
  }
}

export const memoryEngine = new MemoryEngine();
