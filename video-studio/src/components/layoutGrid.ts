import { theme } from './theme';

/**
 * Shared entity-layout math for architecture/investigation diagrams. Before
 * this existed, ArchitectureDiagramV2's autoLayout() and
 * InvestigationScene's own row-centering were two independent
 * reimplementations of "center a row of fixed-width boxes" — neither shrank
 * or wrapped as entity count grew, so denser specs just ran nodes off the
 * 1920px canvas. This is the one place that math lives now, and it scales
 * box size down (never below a readable floor) as more entities need to
 * share the frame, per the "diagrams must be large, ~60-75% of content area"
 * mobile-readability requirement — comprehension over empty space.
 */

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

export interface LaidOutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Lay out `count` boxes on a single centered row (wrapping to a second row
 * past `maxPerRow`), sized so the row fills as much of the safe content
 * width as it can without shrinking below a readable floor. `top`/`bottom`
 * bound the vertical safe area this layout may use (default: full-frame safe
 * margins).
 */
export function layoutRow(
  count: number,
  opts: { top?: number; bottom?: number; maxPerRow?: number } = {},
): LaidOutBox[] {
  if (count <= 0) return [];
  const top = opts.top ?? theme.spacing.safeMarginY;
  const bottom = opts.bottom ?? CANVAS_HEIGHT - theme.spacing.safeMarginY;
  const maxPerRow = opts.maxPerRow ?? 6;

  const rows = Math.ceil(count / maxPerRow);
  const perRow = Math.ceil(count / rows);
  const safeWidth = CANVAS_WIDTH - theme.spacing.safeMarginX * 2;
  const gap = theme.spacing.gap.lg;

  // Box width fills the safe width for however many boxes share a row, down
  // to a floor that keeps a label legible, up to a ceiling so a single node
  // doesn't become absurdly large.
  const idealWidth = (safeWidth - gap * (perRow - 1)) / perRow;
  const width = Math.max(160, Math.min(320, idealWidth));
  const height = Math.max(90, Math.min(150, width * 0.56));

  const availableHeight = bottom - top;
  const rowGap = theme.spacing.gap.lg;
  const rowHeight = rows > 1 ? (availableHeight - rowGap * (rows - 1)) / rows : availableHeight;
  const centerY = top + rowHeight / 2;

  const boxes: LaidOutBox[] = [];
  let remaining = count;
  for (let row = 0; row < rows; row++) {
    const inThisRow = Math.min(perRow, remaining);
    remaining -= inThisRow;
    const totalRowWidth = inThisRow * width + (inThisRow - 1) * gap;
    const startX = CANVAS_WIDTH / 2 - totalRowWidth / 2 + width / 2;
    const y = rows > 1 ? centerY + row * (rowHeight + rowGap) : centerY;
    for (let i = 0; i < inThisRow; i++) {
      boxes.push({ x: startX + i * (width + gap), y, width, height });
    }
  }
  return boxes;
}

/** Clamp a box's center so its full bounding box stays inside the safe frame — the render-time backstop the investigation found missing (the service-side selfcheck only checks the center point, not the box edges). */
export function clampToSafeFrame(box: LaidOutBox): LaidOutBox {
  const minX = theme.spacing.safeMarginX + box.width / 2;
  const maxX = CANVAS_WIDTH - theme.spacing.safeMarginX - box.width / 2;
  const minY = theme.spacing.safeMarginY + box.height / 2;
  const maxY = CANVAS_HEIGHT - theme.spacing.safeMarginY - box.height / 2;
  return {
    ...box,
    x: Math.min(maxX, Math.max(minX, box.x)),
    y: Math.min(maxY, Math.max(minY, box.y)),
  };
}
