import type { CustomGroup, IconRef, Item, ItemGroup, ItemSort, SortDirection, Status, Tag, ViewFilter } from './types';
import { byPos } from './util';

export const SORT_OPTIONS: { value: ItemSort; label: string }[] = [
  { value: 'custom', label: 'Custom order' },
  { value: 'title', label: 'Title' },
  { value: 'created', label: 'Created date' },
  { value: 'status', label: 'Status' },
];

export const GROUP_OPTIONS: { value: ItemGroup; label: string }[] = [
  { value: 'none', label: 'No sections' },
  { value: 'custom', label: 'Custom groups' },
  { value: 'status', label: 'Status' },
  { value: 'tag', label: 'Tag' },
];

export interface Arrangement {
  sort: ItemSort;
  sortDirection: SortDirection;
  group: ItemGroup;
}

/** Old views and invalid local preferences fall back to the original outline order. */
export function arrangementFor(value: unknown): Arrangement {
  const fields = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sort = SORT_OPTIONS.find((o) => o.value === fields.sort)?.value ?? 'custom';
  return {
    sort,
    sortDirection: sort !== 'custom' && fields.sortDirection === 'desc' ? 'desc' : 'asc',
    group: GROUP_OPTIONS.find((o) => o.value === fields.group)?.value ?? 'none',
  };
}

export interface GroupLabel {
  key: string;
  label: string;
  icon: IconRef | null;
  color: string | null;
}

export interface ItemSection {
  group: GroupLabel | null;
  items: Item[];
}

export interface ArrangementCatalog {
  statuses: Status[];
  tags: Tag[];
  customGroups?: CustomGroup[];
  tagLabel?: (id: string) => string;
}

const titleCompare = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }).compare;

/** Tag sections use the first tag in the configured tag order, so items never duplicate. */
export function groupForItem(item: Item, group: ItemGroup, catalog: ArrangementCatalog): GroupLabel | null {
  if (group === 'none') return null;
  if (group === 'custom') {
    const named = catalog.customGroups?.find((entry) => entry.id === item.customGroup);
    return named
      ? { key: named.id, label: named.name, icon: null, color: named.color ?? null }
      : { key: 'none', label: 'Ungrouped', icon: null, color: null };
  }
  if (group === 'status') {
    const status = catalog.statuses.find((s) => s.id === item.status);
    return status
      ? { key: status.id, label: status.name, icon: status.icon, color: status.color }
      : { key: 'none', label: 'No status', icon: null, color: null };
  }
  const tag = catalog.tags.find((t) => item.tags.includes(t.id));
  return tag
    ? { key: tag.id, label: catalog.tagLabel?.(tag.id) ?? tag.name, icon: tag.icon, color: tag.color }
    : { key: 'none', label: 'No tag', icon: null, color: null };
}

/** Arrange one sibling list; callers walk children separately so nesting remains intact. */
export function arrangeItems(items: readonly Item[], arrangement: Arrangement, catalog: ArrangementCatalog, includeEmptyCustom = false): ItemSection[] {
  const statusIndex = new Map(catalog.statuses.map((s, i) => [s.id, i]));
  const compare = (a: Item, b: Item) => {
    const pinned = Number(b.pinned === true) - Number(a.pinned === true);
    if (pinned) return pinned;
    let order = 0;
    switch (arrangement.sort) {
      case 'title': order = titleCompare(a.title, b.title); break;
      case 'created': order = a.created - b.created; break;
      case 'status': order = (statusIndex.get(a.status ?? '') ?? catalog.statuses.length) -
        (statusIndex.get(b.status ?? '') ?? catalog.statuses.length); break;
      case 'custom': return byPos(a, b);
    }
    return (arrangement.sortDirection === 'desc' ? -order : order) || byPos(a, b);
  };
  if (arrangement.group === 'none') return [{ group: null, items: [...items].sort(compare) }];
  const buckets = new Map<string, ItemSection>();
  for (const item of items) {
    const group = groupForItem(item, arrangement.group, catalog)!;
    let section = buckets.get(group.key);
    if (!section) buckets.set(group.key, section = { group, items: [] });
    section.items.push(item);
  }
  if (arrangement.group === 'custom' && includeEmptyCustom) {
    for (const named of catalog.customGroups ?? []) {
      if (!buckets.has(named.id)) buckets.set(named.id, {
        group: { key: named.id, label: named.name, icon: null, color: named.color ?? null }, items: [],
      });
    }
  }
  const order = arrangement.group === 'status' ? catalog.statuses : arrangement.group === 'custom' ? catalog.customGroups ?? [] : catalog.tags;
  const groupIndex = new Map(order.map((entry, i) => [entry.id, i]));
  return [...buckets.values()]
    .sort((a, b) => (groupIndex.get(a.group!.key) ?? order.length) - (groupIndex.get(b.group!.key) ?? order.length))
    .map((section) => ({ ...section, items: section.items.sort(compare) }));
}

export function arrangementDescription(value: Partial<ViewFilter>): string {
  const { sort, sortDirection, group } = arrangementFor(value);
  const bits: string[] = [];
  if (sort !== 'custom') {
    const name = SORT_OPTIONS.find((o) => o.value === sort)!.label.toLowerCase();
    bits.push(`sorted by ${name}${sortDirection === 'desc' ? ' (descending)' : ''}`);
  }
  if (group !== 'none') bits.push(group === 'custom' ? 'custom groups' : `grouped by ${group}`);
  return bits.join(' · ');
}
