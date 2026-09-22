import type { BoardDocument, BoardElement, BoardLinkEndpoint } from './board-types';

export type PublicBoardElement =
  | {
      elementId: string;
      type: 'text';
      x: number; y: number; width: number; height: number; z: number;
      text: string;
    }
  | {
      elementId: string;
      type: 'image';
      x: number; y: number; width: number; height: number; z: number;
      assetPath: string;
    }
  | {
      elementId: string;
      type: 'token';
      x: number; y: number; width: number; height: number; z: number;
      name: string;
      assetPath?: string;
    }
  | {
      elementId: string;
      type: 'card';
      x: number; y: number; width: number; height: number; z: number;
      cardKind: 'note' | 'excerpt';
      sourceTitle: string;
      excerpt?: string;
    }
  | {
      elementId: string;
      type: 'link';
      z: number;
      from: BoardLinkEndpoint;
      to: BoardLinkEndpoint;
      arrow: 'none' | 'end';
    };

export interface PublicPreparedBoard {
  boardId: string;
  elements: PublicBoardElement[];
}

function linkEndpointVisible(endpoint: BoardLinkEndpoint, visibleIds: Set<string>): boolean {
  return endpoint.kind === 'point' || visibleIds.has(endpoint.elementId);
}

export function projectBoardElementForPlayers(element: BoardElement): PublicBoardElement {
  if (element.type === 'link') {
    return { elementId: element.elementId, type: 'link', z: element.z, from: element.from, to: element.to, arrow: element.arrow };
  }
  const geometry = {
    elementId: element.elementId,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    z: element.z
  };
  if (element.type === 'text') return { ...geometry, type: 'text', text: element.text };
  if (element.type === 'image') return { ...geometry, type: 'image', assetPath: element.assetPath };
  if (element.type === 'token') return { ...geometry, type: 'token', name: element.name, ...(element.assetPath ? { assetPath: element.assetPath } : {}) };
  return {
    ...geometry,
    type: 'card',
    cardKind: element.cardKind,
    sourceTitle: element.sourceTitle,
    ...(element.cardKind === 'excerpt' ? { excerpt: element.excerpt } : {})
  };
}

export function projectPreparedBoardForPlayers(document: BoardDocument): PublicPreparedBoard {
  const visible = document.elements.filter(element => element.visibleByDefault === true);
  const visibleIds = new Set(visible.filter(element => element.type !== 'link').map(element => element.elementId));
  return {
    boardId: document.boardId,
    elements: visible
      .filter(element => element.type !== 'link' || (linkEndpointVisible(element.from, visibleIds) && linkEndpointVisible(element.to, visibleIds)))
      .map(projectBoardElementForPlayers)
  };
}
