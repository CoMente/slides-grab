import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTemplateSlideMetadataComment,
  checkLayoutDensity,
  selectTemplateLayout,
} from '../../src/template-layout.js';

const TEMPLATE_PACK = {
  version: 1,
  name: 'Layout Pack',
  layouts: [
    {
      layoutId: 'cover-hero',
      layoutKind: 'cover',
      fields: [
        { role: 'title', maxChars: 48 },
        { role: 'subtitle', maxChars: 72 },
      ],
    },
    {
      layoutId: 'bullets-3',
      layoutKind: 'content',
      fields: [
        { role: 'title', maxChars: 64 },
        { role: 'bullets', listLimits: { maxItems: 3, maxCharsPerItem: 42 } },
      ],
    },
    {
      layoutId: 'chart-exhibit',
      layoutKind: 'chart',
      fields: [
        { role: 'title', maxChars: 64 },
        { role: 'chart', requirements: 'Use one chart slot.' },
      ],
    },
  ],
};

test('selectTemplateLayout maps outline slides to the best template layout', () => {
  const cover = selectTemplateLayout({ title: 'Quarterly Strategy', body: 'Executive summary' }, TEMPLATE_PACK);
  assert.equal(cover.layoutId, 'cover-hero');
  assert.equal(cover.layoutKind, 'cover');

  const content = selectTemplateLayout({ title: 'Proof points', bullets: ['A', 'B', 'C'] }, TEMPLATE_PACK);
  assert.equal(content.layoutId, 'bullets-3');

  const chart = selectTemplateLayout({ title: 'Revenue trend', notes: 'Use a line chart with real values.' }, TEMPLATE_PACK);
  assert.equal(chart.layoutId, 'chart-exhibit');
});

test('checkLayoutDensity reports field and list overflows with actionable warnings', () => {
  const layout = TEMPLATE_PACK.layouts[1];
  const warnings = checkLayoutDensity({
    title: 'A title that is intentionally short enough',
    bullets: [
      'This bullet is too long for the imported template schema limit and should be summarized',
      'Second bullet',
      'Third bullet',
      'Fourth bullet should trigger max item warnings',
    ],
  }, layout);

  assert.ok(warnings.some((warning) => warning.code === 'template-list-overflow' && warning.role === 'bullets'));
  assert.ok(warnings.some((warning) => warning.code === 'template-field-overflow' && warning.role === 'bullets'));
});

test('checkLayoutDensity applies maxChars to array-valued custom roles', () => {
  const warnings = checkLayoutDensity({
    body: ['One concise paragraph', 'Second paragraph pushes the combined body beyond the schema limit'],
  }, {
    layoutId: 'body-stack',
    layoutKind: 'content',
    fields: [{ role: 'body', maxChars: 40 }],
  });

  assert.ok(warnings.some((warning) => warning.code === 'template-field-overflow' && warning.role === 'body'));
});

test('buildTemplateSlideMetadataComment records selected layout for downstream tools', () => {
  const comment = buildTemplateSlideMetadataComment({
    layoutId: 'cover-hero',
    layoutKind: 'cover',
    source: 'template-pack',
  });

  assert.match(comment, /^<!-- slides-grab-template: /);
  assert.match(comment, /"layoutId":"cover-hero"/);
  assert.match(comment, /"layoutKind":"cover"/);
});
