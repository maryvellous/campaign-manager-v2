import { isBoardBoxElement, type BoardDocument, type BoardElement, type BoardLinkEndpoint } from './board-types';

type PublicBoxBase = {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
};

export type PublicBoardElement =
  | (PublicBoxBase & { type: 'text'; text: string })
  | (PublicBoxBase & { type: 'image'; assetPath: string })
  | (PublicBoxBase & { type: 'token'; name: string; assetPath?: string })
  | (PublicBoxBase & { type: 'note-card'; title: string })
  | (PublicBoxBase & { type: 'excerpt-card'; sourceTitle: string; excerpt: string })
  | { type: 'link'; elementId: string; z: number; from: BoardLinkEndpoint; to: BoardLinkEndpoint; arrow: 'none' | 'end' };

export interface PreparedPublicBoardSnapshot {
  boardId: string;
  elements: PublicBoardElement[];
}

const endpointAllowed = (endpoint: BoardLinkEndpoint, visibleIds: Set<string>) =>
  endpoint.kind === 'point' || visibleIds.has(endpoint.elementId);

function publicBoxBase(element: Extract<BoardElement, { x: number }>): PublicBoxBase {
  return {
    elementId: element.elementId,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    z: element.z
  };
}

export function preparedPublicSnapshot(document: BoardDocument): PreparedPublicBoardSnapshot {
  const visible = document.elements.filter(element => element.visibleByDefault === true);
  const visibleIds = new Set(visible.filter(isBoardBoxElement).map(element => element.elementId));
  const elements: PublicBoardElement[] = [];

  for (const element of visible) {
    if (element.type === 'link') {
      if (!endpointAllowed(element.from, visibleIds) || !endpointAllowed(element.to, visibleIds)) continue;
      elements.push({ type: 'link', elementId: element.elementId, z: element.z, from: element.from, to: element.to, arrow: element.arrow });
      continue;
    }
    const base = publicBoxBase(element);
    if (element.type === 'text') elements.push({ ...base, type: 'text', text: element.text });
    else if (element.type === 'image') elements.push({ ...base, type: 'image', assetPath: element.assetPath });
    else if (element.type === 'token') elements.push({ ...base, type: 'token', name: element.name, ...(element.assetPath ? { assetPath: element.assetPath } : {}) });
    else if (element.type === 'note-card') elements.push({ ...base, type: 'note-card', title: element.title });
    else elements.push({ ...base, type: 'excerpt-card', sourceTitle: element.sourceTitle, excerpt: element.excerpt });
  }

  return { boardId: document.boardId, elements };
}
