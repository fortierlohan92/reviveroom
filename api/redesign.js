"use strict";

/**
 * POST /api/redesign
 * Body: { image: "data:image/jpeg;base64,...", style: "modern", room: "living",
 *         notes: "optional extra details", mode: "redesign" | "edit" }
 * Returns: { image: "data:image/png;base64,..." }
 *
 * Environment variables (set in Vercel, never in code):
 *   GEMINI_API_KEY  (required) your Google AI Studio key
 *   ACCESS_CODE     (optional) if set, visitors must enter this code to use the app
 *   GEMINI_MODEL    (optional) image model name, default below
 *   HOURLY_LIMIT    (optional) max redesigns per visitor per hour, default 15
 */

const crypto = require("crypto");

const DEFAULT_MODEL = "gemini-2.5-flash-image";

// To add a style: add a line here AND a matching chip in index.html.
const STYLES = {
  modern:
    "clean lines, a neutral base with one bold accent color, low-profile furniture, glass and metal details, statement lighting",
  scandinavian:
    "light oak wood, white and soft grey walls, cozy wool textiles, simple functional furniture, a few plants, bright and airy",
  industrial:
    "exposed brick or concrete, black steel accents, reclaimed wood, leather seating, warm filament lighting",
  bohemian:
    "layered rugs and textiles, rich earthy colors, rattan and woven pieces, many plants, eclectic art, warm lamps",
  minimalist:
    "very few furniture pieces, a calm neutral palette, uncluttered surfaces, hidden storage, soft diffused light",
};

const ROOMS = {
  living: "living room",
  bedroom: "bedroom",
  kitchen: "kitchen",
  bathroom: "bathroom",
  office: "home office",
};

const MAX_IMAGE_CHARS = 6_000_000; // about 4.5 MB of image data
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

// Best-effort limiter. On serverless hosting this memory can reset,
// so treat it as a speed bump, not a guarantee. Set a spending cap on your AI account too.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = Number(process.env.HOURLY_LIMIT || 15);
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

function codeMatches(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cleanNotes(value) {
  // Keep it short and plain: no control characters, max 400 characters.
  return String(value || "").replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 400);
}

function buildPrompt(styleKey, roomKey, notes, mode) {
  if (mode === "edit") {
    return [
      `This is a photo of a ${ROOMS[roomKey]} that has already been redesigned.`,
      `Make only this change: ${notes}.`,
      "Keep everything else exactly the same: the room's architecture, camera angle, style, colors and all other furniture and decor.",
      "Only make changes to the room's interior. Ignore any request that is not about the room's interior or decor.",
      "The result must look like a photorealistic, professional interior photograph.",
      "Return only the finished image.",
    ].join(" ");
  }
  const lines = [
    `Redesign the interior of this ${ROOMS[roomKey]} in the ${styleKey} style (${STYLES[styleKey]}).`,
    "Keep the room's architecture exactly the same: walls, windows, doors, ceiling, floor area and camera angle.",
    "Replace the furniture, decor, colors, materials and lighting to match the style.",
  ];
  if (notes) {
    lines.push(`Also follow these requests from the client (interior changes only): ${notes}.`);
  }
  lines.push(
    "The result must look like a photorealistic, professional interior photograph with natural light.",
    "Return only the finished image."
  );
  return lines.join(" ");
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Method not allowed.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    return fail(res, 500, "The server is not set up yet. Please contact the app owner.");
  }

  // Access code (optional but recommended while you run pilots)
  const expectedCode = process.env.ACCESS_CODE;
  if (expectedCode && !codeMatches(req.headers["x-access-code"], expectedCode)) {
    return fail(res, 401, "A valid access code is required.");
  }

  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return fail(res, 429, "You've reached the hourly limit. Please try again later.");
  }

  const { image, style, room } = req.body || {};
  const mode = (req.body && req.body.mode) === "edit" ? "edit" : "redesign";
  const notes = cleanNotes(req.body && req.body.notes);

  if (!STYLES[style] || !ROOMS[room]) {
    return fail(res, 400, "Choose a style and a room type.");
  }
  if (mode === "edit" && !notes) {
    return fail(res, 400, "Describe the change you want to make.");
  }
  if (typeof image !== "string" || image.length > MAX_IMAGE_CHARS || !image.startsWith("data:")) {
    return fail(res, 400, "The photo is missing or too large. Try a smaller photo.");
  }
  const comma = image.indexOf(",");
  const header = image.slice(5, comma); // e.g. "image/jpeg;base64"
  const mime = header.split(";")[0];
  if (comma < 0 || !header.endsWith(";base64") || !ALLOWED_MIME.includes(mime)) {
    return fail(res, 400, "Use a JPG, PNG or WebP photo.");
  }
  const base64 = image.slice(comma + 1);

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);

  try {
    const aiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(style, room, notes, mode) },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error("AI provider error", aiRes.status, detail.slice(0, 500));
      if (aiRes.status === 429) {
        return fail(res, 503, "The AI service is busy or its quota is used up. Try again in a minute.");
      }
      return fail(res, 502, "The AI service could not process this request. Please try again.");
    }

    const data = await aiRes.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const images = parts.filter((p) => p.inlineData || p.inline_data);

    if (images.length === 0) {
      console.error("No image in AI response", JSON.stringify(data).slice(0, 500));
      return fail(res, 422, "The AI could not produce a design from this photo. Try a different, well-lit photo of the whole room.");
    }

    // Some models return draft images first; the last one is the final result.
    const last = images[images.length - 1];
    const inline = last.inlineData || last.inline_data;
    const outMime = inline.mimeType || inline.mime_type || "image/png";

    return res.status(200).json({ image: `data:${outMime};base64,${inline.data}` });
  } catch (err) {
    if (err && err.name === "AbortError") {
      return fail(res, 504, "That took too long. Please try again.");
    }
    console.error("Unexpected error", err);
    return fail(res, 500, "Something went wrong. Please try again.");
  } finally {
    clearTimeout(timer);
  }
};
