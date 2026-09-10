export type View = 'notes' | 'search' | 'graph' | 'compendium' | 'recent' | 'favorites' | 'settings';
export interface UiState { view: View; selectedFolder: string; favorites: string[]; recentNotes: string[]; expandedFolders: string[]; sidebarWidth: number; inspectorWidth: number; sidebarCollapsed: boolean; inspectorCollapsed: boolean; folderColors: Record<string, string> }
export const defaultUi = (): UiState => ({ view: 'notes', selectedFolder: '', favorites: [], recentNotes: [], expandedFolders: [], sidebarWidth: 248, inspectorWidth: 265, sidebarCollapsed: false, inspectorCollapsed: false, folderColors: {} });
export interface SavedTabs { tabs: { id: string; noteId: string; history: string[]; historyIndex: number }[]; activeTabId?: string }
export function draftWords(markdown: string): string[] {
  const visible = markdown.replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1').replace(/<[^>]*>/gu, ' ').replace(/[#*_`~>[\]{}|\\]/gu, ' ').replace(/^[ \t]*[-+=]+[ \t]*/gmu, '').replace(/[<>:"/|?*]/gu, '').trim();
  return visible.split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word));
}
export function draftTitle(markdown: string): string {
  return draftWords(markdown).slice(0, 3).join(' ').replace(/[.\s…]+$/u, '').replace(/[\u0000-\u001f]/gu, ''); // eslint-disable-line no-control-regex
}

