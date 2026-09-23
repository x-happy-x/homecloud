import type {Group, KinPerson, PeopleAlbum} from '../../types/api';

const SYSTEM_ALBUMS = [
  {id: -1, title: 'Семья', description: 'Родители, братья, сёстры и дети'},
  {id: -2, title: 'Родственники', description: 'Дяди, тёти, племянники, племянницы и двоюродные'},
  {id: -3, title: 'Дальние родственники', description: 'Остальные кровные родственники'},
] as const;

const ids = (people: Array<{id: string}> | undefined) => new Set((people ?? []).map(person => person.id));

/** Системные альбомы строятся по кровным связям текущего пользователя BiGFaM. */
export function automaticPeopleAlbums(groups: Group[], kin: KinPerson[]): PeopleAlbum[] {
  const self = kin.find(person => person.isSelf);
  const byId = new Map(kin.map(person => [person.id, person]));
  const family = new Set<string>();
  const relatives = new Set<string>();
  const distant = new Set<string>();

  if (self) {
    family.add(self.id);
    const parents = ids(self.relatives?.parents);
    const siblings = ids(self.relatives?.siblings);
    const children = ids(self.relatives?.children);
    for (const id of [...parents, ...siblings, ...children]) family.add(id);

    const unclesAndAunts = new Set<string>();
    for (const parentId of parents) {
      for (const id of ids(byId.get(parentId)?.relatives?.siblings)) unclesAndAunts.add(id);
    }
    for (const id of unclesAndAunts) relatives.add(id);
    for (const siblingId of siblings) {
      for (const id of ids(byId.get(siblingId)?.relatives?.children)) relatives.add(id);
    }
    for (const relativeId of unclesAndAunts) {
      for (const id of ids(byId.get(relativeId)?.relatives?.children)) relatives.add(id);
    }

    // Компонента кровного графа. Супругов не добавляем: связь проходит только
    // через родителей, детей и явно вычисленных братьев/сестёр.
    const queue = [self.id];
    const seen = new Set(queue);
    while (queue.length) {
      const person = byId.get(queue.shift()!);
      const next = [
        ...ids(person?.relatives?.parents),
        ...ids(person?.relatives?.children),
        ...ids(person?.relatives?.siblings),
      ];
      for (const id of next) {
        if (!seen.has(id)) { seen.add(id); queue.push(id); }
      }
    }
    for (const id of seen) distant.add(id);
  }

  if (self) {
    relatives.delete(self.id);
    distant.delete(self.id);
  }
  for (const id of family) { relatives.delete(id); distant.delete(id); }
  for (const id of relatives) distant.delete(id);

  const groupsByPerson = new Map<string, string[]>();
  for (const group of groups) {
    if (!group.bigfam_id || group.kind !== 'person') continue;
    const values = groupsByPerson.get(group.bigfam_id) ?? [];
    values.push(group.key);
    groupsByPerson.set(group.bigfam_id, values);
  }
  const memberKeys = (members: Set<string>) => [...members].flatMap(id => groupsByPerson.get(id) ?? []);
  const memberships = [memberKeys(family), memberKeys(relatives), memberKeys(distant)];

  return SYSTEM_ALBUMS.map((album, index) => ({
    ...album,
    parent_id: 0,
    depth: 0,
    trail: album.title,
    groups: memberships[index].length,
    total: memberships[index].length,
    member_keys: memberships[index],
    hidden: false,
    effectively_hidden: false,
    children: [],
    automatic: true,
  }));
}
