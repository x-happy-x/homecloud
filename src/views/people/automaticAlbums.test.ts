import {describe, expect, it} from 'vitest';
import type {Group, KinPerson} from '../../types/api';
import {automaticPeopleAlbums} from './automaticAlbums';

const person = (id: string, relatives: Partial<NonNullable<KinPerson['relatives']>> = {}): KinPerson => ({
  id, name: id, relatives: {parents: [], siblings: [], children: [], spouses: [], ...relatives},
});
const ref = (id: string) => ({id, name: id});
const group = (id: string): Group => ({
  key: `person:${id}`, title: id, name: id, bigfam_id: id, kind: 'person', count: 1,
  photos: 1, covers: [], avatar_face: null, avatar_pinned: false, avatar: '', albums: [], hidden: false,
});

describe('automaticPeopleAlbums', () => {
  it('separates close, second-degree and distant blood relatives', () => {
    const kin: KinPerson[] = [
      {...person('me', {parents: [ref('parent')], siblings: [ref('sibling')], children: [ref('child')]}), isSelf: true},
      person('parent', {children: [ref('me'), ref('sibling')], siblings: [ref('aunt')], parents: [ref('grandparent')]}),
      person('sibling', {parents: [ref('parent')], siblings: [ref('me')], children: [ref('nephew')]}),
      person('child', {parents: [ref('me')]}),
      person('aunt', {siblings: [ref('parent')], children: [ref('cousin')]}),
      person('nephew', {parents: [ref('sibling')]}),
      person('cousin', {parents: [ref('aunt')]}),
      person('grandparent', {children: [ref('parent')]}),
      person('spouse'),
    ];
    kin[0].relatives!.spouses = [ref('spouse')];
    const albums = automaticPeopleAlbums(kin.map(item => group(item.id)), kin);
    expect(albums[0].member_keys).toEqual(expect.arrayContaining([
      'person:me', 'person:parent', 'person:sibling', 'person:child',
    ]));
    expect(albums[1].member_keys).toEqual(expect.arrayContaining(['person:aunt', 'person:nephew', 'person:cousin']));
    expect(albums[2].member_keys).toContain('person:grandparent');
    expect(albums.flatMap(album => album.member_keys)).not.toContain('person:spouse');
    expect(albums[1].member_keys).not.toContain('person:me');
    expect(albums[2].member_keys).not.toContain('person:me');
  });
});
