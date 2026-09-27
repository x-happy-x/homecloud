import {describe, expect, test} from 'vitest';
import type {Highlight} from '../../services/endpoints/highlights';
import {
  cardLabel, explainReasons, featuredHighlight, highlightSections, isFeatureTile, sortHighlights, stripHighlights,
} from './highlights';

const group = (key: string, kind: string, start: string, score = 0.5): Highlight => ({
  id: 1, key, kind, title: key, subtitle: '', period_start: start, period_end: start, score,
  photo_count: 5, cover_path: null, generated_at: '', meta: {},
});

describe('порядок подборок', () => {
  test('«в этот день» наверху, дальше свежие периоды', () => {
    const sorted = sortHighlights([
      group('month:2019-02', 'month', '2019-02-01T10:00:00'),
      group('on-this-day:09-17:2018', 'on-this-day', '2018-09-17T10:00:00'),
      group('year:2020', 'year', '2020-01-02T10:00:00'),
    ]);
    expect(sorted.map(item => item.key)).toEqual(['on-this-day:09-17:2018', 'year:2020', 'month:2019-02']);
  });
});

describe('объяснение выбора', () => {
  test('серия и люди упоминаются, только когда есть', () => {
    const base = {
      base: 0.8, visual: 0.9, technical: 0.7, personal: 0, time_source: 'exif', gain: 0.6,
      redundancy: 0, bucket_penalty: 0, nearest: null, pick: 2, event: 'event:1', series: 0,
    };
    expect(explainReasons(base)).toBe('Оценка 80: вид 90, техника 70\nВыбран 2-м · время из EXIF');
    const rich = explainReasons({...base, personal: 0.6, series: 4, visual: null});
    expect(rich).toContain('вид —');
    expect(rich).toContain('Люди в кадре: 60');
    expect(rich).toContain('Лучший из 5 похожих кадров');
  });
});

describe('главная подборка и ленты', () => {
  const list = [
    group('month:2020-04', 'month', '2020-04-01T10:00:00'),
    group('event:a', 'event', '2020-03-01T10:00:00'),
    group('year:2019', 'year', '2019-01-01T10:00:00'),
    group('event:b', 'event', '2019-12-19T10:00:00'),
  ];

  test('без «в этот день» главной становится самое свежее событие', () => {
    expect(featuredHighlight(sortHighlights(list))?.key).toBe('event:a');
    const today = group('on-this-day:09-17:2018', 'on-this-day', '2018-09-17T10:00:00');
    expect(featuredHighlight(sortHighlights([...list, today]))?.key).toBe(today.key);
    expect(featuredHighlight([])).toBeNull();
  });

  test('ленты идут по видам в постоянном порядке, пустых нет', () => {
    const sections = highlightSections(sortHighlights(list));
    expect(sections.map(section => section.kind)).toEqual(['event', 'month', 'year']);
    expect(sections[0].groups.map(item => item.key)).toEqual(['event:a', 'event:b']);
  });

  test('крупные плитки — только в подборке от пяти снимков', () => {
    expect([0, 1, 7, 14].map(index => isFeatureTile(index, 20))).toEqual([true, false, true, true]);
    expect(isFeatureTile(0, 4)).toBe(false);
  });
});

describe('темы, места и поездки', () => {
  const themed = [
    group('month:2023-05', 'month', '2023-05-01T10:00:00'),
    {...group('theme:cats:2023', 'theme', '2023-01-01T10:00:00'), photo_count: 20},
    {...group('theme:cats', 'theme', '2019-01-01T10:00:00'), photo_count: 12},
    {...group('theme:sea', 'theme', '2018-01-01T10:00:00'), photo_count: 30},
    {...group('trip:20220802-100000', 'trip', '2022-08-02T10:00:00'), subtitle: 'Египет'},
    group('event:x', 'event', '2023-04-01T10:00:00'),
    {...group('place:1', 'place', '2017-01-01T10:00:00'), subtitle: 'Россия'},
  ];

  test('темы за всё время крупные вперёд, по годам — после', () => {
    const sections = highlightSections(sortHighlights(themed));
    expect(sections.map(section => section.kind)).toEqual(['theme', 'trip', 'event', 'place', 'month']);
    expect(sections[0].groups.map(item => item.key)).toEqual(['theme:sea', 'theme:cats', 'theme:cats:2023']);
  });

  test('лента на главной — разные виды, без тем по годам', () => {
    const strip = stripHighlights(sortHighlights(themed), 5);
    expect(strip[0].kind).toBe('trip');
    expect(strip.map(item => item.key)).toContain('theme:sea');
    expect(strip.map(item => item.key)).not.toContain('theme:cats:2023');
    expect(new Set(strip).size).toBe(strip.length);
  });

  test('у поездки и места над названием — страна', () => {
    expect(cardLabel(themed[4])).toBe('Египет');
    expect(cardLabel(themed[6])).toBe('Россия');
    expect(cardLabel(themed[2])).toBe('Тема');
  });
});
