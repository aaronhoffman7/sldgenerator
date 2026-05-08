const ALLOWED = [
  'system_capacity','azimuth','tilt','array_type',
  'module_type','losses','lat','lon','timeframe','dc_ac_ratio',
];

module.exports = async function handler(req, res) {
  try {
    const key = process.env.NREL_API_KEY;
    if (!key) {
      console.error('NREL_API_KEY not set');
      return res.status(500).json({ errors: ['NREL_API_KEY environment variable not set'] });
    }

    const params = new URLSearchParams({ api_key: key });
    ALLOWED.forEach(k => { if (req.query[k] != null) params.set(k, req.query[k]); });

    console.log('PVWatts request:', Object.fromEntries(
      [...params.entries()].map(([k,v]) => [k, k === 'api_key' ? '***' : v])
    ));

    const upstream = await fetch(`https://developer.nlr.gov/api/pvwatts/v8.json?${params}`);
    const data = await upstream.json();

    console.log('PVWatts response status:', upstream.status, 'errors:', data.errors ?? 'none');

    // Cache identical requests for 24 h at the edge — same location/params = same TMY result
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('PVWatts proxy error:', err.message);
    res.status(502).json({ errors: [err.message] });
  }
};
