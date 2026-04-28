/**
 * Captures the live WebGL galaxy canvas, composites a branded watermark, and
 * triggers a PNG download. Pure client-side — no server roundtrip.
 *
 * Resolution: whatever the live canvas is currently drawing at. On retina
 * displays this is typically 2x the visible size (e.g. 2560x1440 logical
 * → 5120x2880 actual pixels = effectively 5K). On standard displays ~1080p+.
 */

type ExportOptions = {
  canvas: HTMLCanvasElement;
  userLabel: string;
};

const TODAY_LABEL = (): string => {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const FILENAME_DATE = (): string => {
  // Stable YYYY-MM-DD for filenames.
  return new Date().toISOString().split("T")[0];
};

export async function exportGalaxyImage({
  canvas,
  userLabel,
}: ExportOptions): Promise<void> {
  // Read pixels straight from the WebGL canvas. Requires the renderer to
  // have been created with preserveDrawingBuffer: true.
  const webglDataUrl = canvas.toDataURL("image/png");

  // Hydrate as an Image so we can composite onto a 2D canvas.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Failed to load galaxy frame."));
    i.src = webglDataUrl;
  });

  if (img.width === 0 || img.height === 0) {
    throw new Error(
      "Galaxy canvas is empty — try again once the scene has rendered.",
    );
  }

  const out = document.createElement("canvas");
  out.width = img.width;
  out.height = img.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Couldn't allocate a 2D drawing context.");

  // Underlying galaxy frame
  ctx.drawImage(img, 0, 0);

  // Subtle bottom gradient so the watermark is always legible against any
  // bright nebula bloom underneath.
  const gradH = Math.round(img.height * 0.18);
  const grad = ctx.createLinearGradient(0, img.height - gradH, 0, img.height);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, img.height - gradH, img.width, gradH);

  // ---- Watermark ----------------------------------------------------------
  const padding = Math.round(img.width * 0.025);
  const titleSize = Math.round(img.width * 0.02);
  const labelSize = Math.round(img.width * 0.011);

  // "Aurora" wordmark with the cyan→violet→pink gradient that matches the UI.
  const titleGrad = ctx.createLinearGradient(
    padding,
    0,
    padding + titleSize * 4.5,
    0,
  );
  titleGrad.addColorStop(0, "#67E8F9");
  titleGrad.addColorStop(0.5, "#A855F7");
  titleGrad.addColorStop(1, "#F472B6");

  ctx.textBaseline = "alphabetic";
  ctx.font = `500 ${titleSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = titleGrad;
  ctx.fillText("Aurora", padding, img.height - padding - labelSize - 6);

  // User label below — quieter, monospaced.
  ctx.font = `400 ${labelSize}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillStyle = "rgba(230, 232, 239, 0.7)";
  ctx.fillText(
    `dream galaxy — ${userLabel}`,
    padding,
    img.height - padding,
  );

  // Date in the bottom-right corner.
  const dateText = TODAY_LABEL();
  ctx.font = `400 ${labelSize}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillStyle = "rgba(230, 232, 239, 0.5)";
  const dateWidth = ctx.measureText(dateText).width;
  ctx.fillText(dateText, img.width - padding - dateWidth, img.height - padding);

  // ---- Download -----------------------------------------------------------
  const finalUrl = out.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = finalUrl;
  link.download = `aurora-galaxy-${FILENAME_DATE()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
