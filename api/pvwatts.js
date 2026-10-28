// Numeric inputs forwarded to PVWatts, each validated against the API's accepted range
const NUMERIC = {
  system_capacity: [0.05, 500000],
  azimuth:         [0, 359.999],
  tilt:            [0, 90],
  losses:          [-5, 99],
  lat:             [-90, 90],
  lon:             [-180, 180],
  dc_ac_ratio:     [0.01, 10],
};
const ARRAY_TYPES = ['0', '1', '2', '3', '4'];

const fail = (res, status, msg) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ errors: [msg] });
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(res, 405, 'Method not allowed');
  }
  // Only serve this app's own pages — keeps other sites from spending the NREL quota via browsers.
  // (Non-browser clients can omit these headers; pair with a Vercel firewall rate limit.)
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return fail(res, 403, 'Forbidden');
  const origin = req.headers.origin;
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch (_) {}
    if (host !== req.headers.host) return fail(res, 403, 'Forbidden');
  }

  const key = process.env.NREL_API_KEY;
  if (!key) {
    console.error('NREL_API_KEY not set');
    return fail(res, 500, 'PVWatts is not configured on the server');
  }

  const params = new URLSearchParams({ api_key: key, timeframe: 'hourly', module_type: '0' });
  for (const [name, [min, max]] of Object.entries(NUMERIC)) {
    const raw = req.query[name];
    if (raw == null || raw === '') {
      if (name === 'dc_ac_ratio') continue; // optional — PVWatts defaults to 1.2
      return fail(res, 400, `${name} is required`);
    }
    const v = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isFinite(v) || v < min || v > max) return fail(res, 400, `${name} must be between ${min} and ${max}`);
    params.set(name, String(v));
  }
  const arrayType = String(req.query.array_type ?? '1');
  if (!ARRAY_TYPES.includes(arrayType)) return fail(res, 400, 'array_type must be 0–4');
  params.set('array_type', arrayType);

  try {
    const upstream = await fetch(`https://developer.nlr.gov/api/pvwatts/v8.json?${params}`,
      { signal: AbortSignal.timeout(15000) });
    const isJson = (upstream.headers.get('content-type') || '').includes('json');
    const data = isJson ? await upstream.json() : null;
    if (!data) {
      console.error('PVWatts non-JSON response:', upstream.status);
      return fail(res, 502, `PVWatts service error (HTTP ${upstream.status})`);
    }
    const errors = data.errors || [];
    if (!upstream.ok || errors.length) {
      console.error('PVWatts error:', upstream.status, errors);
      return fail(res, upstream.ok ? 400 : upstream.status, errors[0] || `PVWatts error (HTTP ${upstream.status})`);
    }

    // Cache successful results only — same location/params = same TMY result
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    // The client only uses hourly AC and station info; drop the other ~8 hourly series
    res.status(200).json({
      outputs: { ac: data.outputs?.ac, ac_annual: data.outputs?.ac_annual },
      station_info: data.station_info,
      warnings: data.warnings,
      errors: [],
    });
  } catch (err) {
    console.error('PVWatts proxy error:', err.message);
    return fail(res, err.name === 'TimeoutError' ? 504 : 502, 'Could not reach the PVWatts service');
  }
};
