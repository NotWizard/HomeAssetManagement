import type { CategoryNode } from '../../types';

export type CategoryPickerValue = {
  type: 'asset' | 'liability';
  l1Id: number;
  l2Id: number;
  l3Id: number;
};

export type ResolvedPath = {
  type: 'asset' | 'liability';
  l1Name: string;
  l2Name: string;
  l3Name: string;
};

export type FlatSearchResult = {
  type: 'asset' | 'liability';
  l1Id: number;
  l2Id: number;
  l3Id: number;
  l1Name: string;
  l2Name: string;
  l3Name: string;
  matchedSegment: 'l1' | 'l2' | 'l3';
};

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

export function buildFlatSearchResults(
  tree: CategoryNode[],
  searchTerm: string,
  type: 'asset' | 'liability'
): FlatSearchResult[] {
  const term = normalize(searchTerm);
  if (term.length === 0) return [];

  const results: FlatSearchResult[] = [];
  for (const l1 of tree) {
    const l1Match = normalize(l1.name).includes(term);
    for (const l2 of l1.children) {
      const l2Match = normalize(l2.name).includes(term);
      for (const l3 of l2.children) {
        const l3Match = normalize(l3.name).includes(term);
        if (!l1Match && !l2Match && !l3Match) continue;
        const matchedSegment: 'l1' | 'l2' | 'l3' = l3Match ? 'l3' : l2Match ? 'l2' : 'l1';
        results.push({
          type,
          l1Id: l1.id,
          l2Id: l2.id,
          l3Id: l3.id,
          l1Name: l1.name,
          l2Name: l2.name,
          l3Name: l3.name,
          matchedSegment,
        });
      }
    }
  }
  return results;
}

export function shouldAutoPenetrate(l2Node: CategoryNode): boolean {
  return l2Node.children.length === 1;
}

export function resolvePathFromValue(
  value: CategoryPickerValue | null,
  assetTree: CategoryNode[],
  liabilityTree: CategoryNode[]
): ResolvedPath | null {
  if (!value) return null;
  const tree = value.type === 'asset' ? assetTree : liabilityTree;
  const l1 = tree.find((n) => n.id === value.l1Id);
  if (!l1) return null;
  const l2 = l1.children.find((n) => n.id === value.l2Id);
  if (!l2) return null;
  const l3 = l2.children.find((n) => n.id === value.l3Id);
  if (!l3) return null;
  return {
    type: value.type,
    l1Name: l1.name,
    l2Name: l2.name,
    l3Name: l3.name,
  };
}
