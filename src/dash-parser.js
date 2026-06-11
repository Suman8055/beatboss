// Port of DASHManifestParser.swift — uses browser's DOMParser for XML.

export class DASHParser {
  parse(xmlText, baseURL) {
    const dom = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (dom.querySelector('parsererror')) throw new Error('Invalid MPD XML');

    const mpd      = dom.querySelector('MPD');
    const duration = parseISO8601Duration(mpd?.getAttribute('mediaPresentationDuration') ?? '');
    const period   = dom.querySelector('Period');
    const adaptSet = period?.querySelector('AdaptationSet');
    const repr     = adaptSet?.querySelector('Representation');

    const segTemplate = repr?.querySelector('SegmentTemplate') ??
                        adaptSet?.querySelector('SegmentTemplate');
    if (!segTemplate) throw new Error('No SegmentTemplate found in MPD');

    const mediaTemplate  = segTemplate.getAttribute('media')         ?? '';
    const initTemplate   = segTemplate.getAttribute('initialization') ?? '';
    const timescale      = parseInt(segTemplate.getAttribute('timescale') ?? '1', 10);
    const startNumber    = parseInt(segTemplate.getAttribute('startNumber') ?? '1', 10);
    const segDuration    = parseInt(segTemplate.getAttribute('duration') ?? '0', 10);
    const representationId = repr?.getAttribute('id') ?? '1';
    const base = resolveBase(baseURL, period?.querySelector('BaseURL')?.textContent);

    let segmentURLs = [];
    let initURL     = '';

    if (initTemplate) {
      initURL = base + fill(initTemplate, { RepresentationID: representationId });
    }

    // SegmentTimeline
    const timeline = segTemplate.querySelector('SegmentTimeline');
    if (timeline) {
      segmentURLs = buildFromTimeline(timeline, mediaTemplate, representationId, startNumber, base);
    } else if (segDuration > 0 && duration > 0) {
      // Duration-based
      const totalSegments = Math.ceil((duration * timescale) / segDuration);
      for (let i = 0; i < totalSegments; i++) {
        const num  = startNumber + i;
        const time = i * segDuration;
        segmentURLs.push({
          url: base + fill(mediaTemplate, { Number: num, Time: time, RepresentationID: representationId }),
          startTime: time / timescale,
        });
      }
    }

    return { initURL, segmentURLs, duration };
  }
}

function buildFromTimeline(timeline, template, reprId, startNumber, base) {
  const segments = [];
  let number = startNumber;
  let t      = 0;
  for (const s of timeline.querySelectorAll('S')) {
    const sTime    = parseInt(s.getAttribute('t')  ?? '-1', 10);
    const sDur     = parseInt(s.getAttribute('d')  ?? '0', 10);
    const sRepeat  = parseInt(s.getAttribute('r')  ?? '0', 10);
    if (sTime >= 0) t = sTime;
    for (let r = 0; r <= sRepeat; r++) {
      segments.push({
        url: base + fill(template, { Number: number, Time: t, RepresentationID: reprId }),
        startTime: t,
      });
      t += sDur;
      number++;
    }
  }
  return segments;
}

function fill(template, vars) {
  return template
    .replace(/\$Number(?:%0(\d+)d)?\$/g, (_, pad) =>
      pad ? String(vars.Number ?? 0).padStart(parseInt(pad), '0') : String(vars.Number ?? 0))
    .replace(/\$Time\$/g,             String(vars.Time ?? 0))
    .replace(/\$RepresentationID\$/g, String(vars.RepresentationID ?? ''));
}

export function parseISO8601Duration(s) {
  if (!s) return 0;
  const m = s.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? 0) * 86400) +
         (parseInt(m[2] ?? 0) * 3600)  +
         (parseInt(m[3] ?? 0) * 60)    +
         parseFloat(m[4] ?? 0);
}

function resolveBase(baseURL, override) {
  if (override && override.startsWith('http')) return override;
  if (!baseURL) return '';
  try {
    const u = new URL(baseURL);
    return u.origin + u.pathname.substring(0, u.pathname.lastIndexOf('/') + 1);
  } catch { return ''; }
}
