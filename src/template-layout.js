/**
 * Pure layout selection and content-density utilities for imported template packs.
 *
 * These helpers operate on normalized (camelCase) template pack shapes but also
 * tolerate the snake_case variants (`layout_id`, `layout_kind`, `max_chars`,
 * `list_limits`, ...) produced by raw `template-pack.json` files so they can be
 * used against both parsed packs and hand-authored fixtures.
 */

const CHART_HINT_RE = /\b(chart|line chart|bar chart|pie chart|scatter|graph|plot)\b/i;

const ROLE_SYNONYMS = {
  title: ['title', 'heading', 'headline'],
  subtitle: ['subtitle', 'body', 'tagline', 'lede'],
  bullets: ['bullets', 'items', 'points', 'list'],
  chart: ['chart', 'graph', 'plot', 'visualization'],
  image: ['image', 'picture', 'photo', 'figure'],
};

function readLayoutId(layout) {
  if (!layout || typeof layout !== 'object') return null;
  return layout.layoutId ?? layout.layout_id ?? layout.id ?? null;
}

function readLayoutKind(layout) {
  if (!layout || typeof layout !== 'object') return null;
  return layout.layoutKind ?? layout.layout_kind ?? layout.kind ?? null;
}

function readFields(layout) {
  if (!layout || typeof layout !== 'object') return [];
  if (Array.isArray(layout.fields)) return layout.fields;
  if (Array.isArray(layout.schemaFields)) return layout.schemaFields;
  if (Array.isArray(layout.schema_fields)) return layout.schema_fields;
  return [];
}

function readListLimits(field) {
  const limits = field?.listLimits ?? field?.list_limits;
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return {};
  return limits;
}

function readMaxChars(field) {
  const value = field?.maxChars ?? field?.max_chars;
  if (value === null || value === undefined) return null;
  return Number(value);
}

function asText(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(asText).join(' ');
  return String(value);
}

function normalizeOutline(outlineSlide) {
  const source = outlineSlide && typeof outlineSlide === 'object' && !Array.isArray(outlineSlide)
    ? outlineSlide
    : {};
  const outline = { ...source };
  if (outline.bullets !== undefined && outline.bullets !== null && !Array.isArray(outline.bullets)) {
    outline.bullets = [outline.bullets];
  }
  return outline;
}

function inferLayoutKindHint(outline) {
  if (Array.isArray(outline.bullets) && outline.bullets.length > 0) return 'content';
  if (outline.chart) return 'chart';
  const notes = asText(outline.notes);
  if (notes && CHART_HINT_RE.test(notes)) return 'chart';
  if (outline.image) return 'image';
  return 'cover';
}

function outlineHasRole(outline, role) {
  if (!role) return false;
  if (outline[role] !== undefined && outline[role] !== null) return true;
  const synonyms = ROLE_SYNONYMS[role];
  if (synonyms) {
    for (const synonym of synonyms) {
      if (synonym === role) continue;
      if (outline[synonym] !== undefined && outline[synonym] !== null) return true;
    }
  }
  return false;
}

function scoreLayout(outline, layout) {
  const fields = readFields(layout);
  const kind = readLayoutKind(layout);
  let score = 0;
  const reasons = [];

  for (const field of fields) {
    const role = field?.role;
    if (!role) continue;
    if (outlineHasRole(outline, role)) {
      score += 1;
      reasons.push(`field:${role}`);
    }
  }

  const kindHint = inferLayoutKindHint(outline);
  if (kind && kind === kindHint) {
    score += 2;
    reasons.push(`kind:${kind}`);
  }

  // Penalize layouts that require fields the outline cannot satisfy, so a layout
  // that demands a chart slot does not win for a text-only cover outline.
  let unmatched = 0;
  for (const field of fields) {
    const role = field?.role;
    if (role && !outlineHasRole(outline, role)) unmatched += 1;
  }
  score -= unmatched * 0.5;

  return { score, reasons };
}

/**
 * Select the best-matching template layout for an outline-like slide.
 *
 * @param {object} outlineSlide - Outline slide data with keys such as title,
 *   body, bullets, notes, chart, image.
 * @param {object} pack - A parsed template pack with a `layouts` array.
 * @returns {{ layoutId: string|null, layoutKind: string|null, score: number, reason: string }}
 */
export function selectTemplateLayout(outlineSlide, pack) {
  const layouts = pack?.layouts ?? [];
  const outline = normalizeOutline(outlineSlide);

  let best = null;
  for (let index = 0; index < layouts.length; index += 1) {
    const layout = layouts[index];
    const { score, reasons } = scoreLayout(outline, layout);
    if (!best || score > best.score) {
      best = { layout, score, reasons, index };
    }
  }

  if (!best) {
    return {
      layoutId: null,
      layoutKind: null,
      score: 0,
      reason: 'no template layouts available',
    };
  }

  return {
    layoutId: readLayoutId(best.layout),
    layoutKind: readLayoutKind(best.layout),
    score: best.score,
    reason: best.reasons.length ? best.reasons.join('; ') : 'best-matching layout',
  };
}

/**
 * Compare an outline slide's content against a selected template layout schema
 * and emit actionable density warnings (never criticals).
 *
 * @param {object} outlineSlide - Outline slide data keyed by field role.
 * @param {object} layout - A template pack layout with a `fields` array.
 * @returns {Array<{ code: string, role: string, message: string }>}
 */
export function checkLayoutDensity(outlineSlide, layout) {
  const warnings = [];
  if (!layout || typeof layout !== 'object') return warnings;

  const outline = normalizeOutline(outlineSlide);
  const fields = readFields(layout);

  for (const field of fields) {
    const role = field?.role;
    if (!role) continue;
    const value = outline[role];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      const limits = readListLimits(field);
      const maxItems = limits.maxItems ?? limits.max_items ?? null;
      if (maxItems !== null && maxItems !== undefined && value.length > maxItems) {
        warnings.push({
          code: 'template-list-overflow',
          role,
          message: `Layout field "${role}" has ${value.length} items, exceeding the maxItems limit of ${maxItems}. Summarize or split the list.`,
          limit: maxItems,
          actual: value.length,
        });
      }

      const maxCharsPerItem = limits.maxCharsPerItem ?? limits.max_chars_per_item ?? null;
      if (maxCharsPerItem !== null && maxCharsPerItem !== undefined) {
        const overflows = [];
        for (let index = 0; index < value.length; index += 1) {
          const text = asText(value[index]);
          if (text.length > maxCharsPerItem) {
            overflows.push({ index, length: text.length });
          }
        }
        if (overflows.length) {
          warnings.push({
            code: 'template-field-overflow',
            role,
            message: `Layout field "${role}" has ${overflows.length} item(s) exceeding the maxCharsPerItem limit of ${maxCharsPerItem}. Tighten the wording.`,
            limit: maxCharsPerItem,
            items: overflows,
          });
        }
      }

      const maxChars = readMaxChars(field);
      if (maxChars !== null && maxChars !== undefined) {
        const text = value.map(asText).join(' ');
        if (text.length > maxChars) {
          warnings.push({
            code: 'template-field-overflow',
            role,
            message: `Layout field "${role}" is ${text.length} characters, exceeding the maxChars limit of ${maxChars}. Shorten the text.`,
            limit: maxChars,
            actual: text.length,
          });
        }
      }
      continue;
    }

    const maxChars = readMaxChars(field);
    if (maxChars !== null && maxChars !== undefined) {
      const text = asText(value);
      if (text.length > maxChars) {
        warnings.push({
          code: 'template-field-overflow',
          role,
          message: `Layout field "${role}" is ${text.length} characters, exceeding the maxChars limit of ${maxChars}. Shorten the text.`,
          limit: maxChars,
          actual: text.length,
        });
      }
    }
  }

  return warnings;
}

/**
 * Build the `slides-grab-template` HTML metadata comment recording the selected
 * layout for downstream tools (validation, export, editor).
 *
 * @param {{ layoutId: string, layoutKind: string }} selection
 * @returns {string}
 */
export function buildTemplateSlideMetadataComment(selection) {
  const payload = {
    layoutId: selection?.layoutId ?? null,
    layoutKind: selection?.layoutKind ?? null,
  };
  return `<!-- slides-grab-template: ${JSON.stringify(payload)} -->`;
}
