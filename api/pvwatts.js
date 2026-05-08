const ALLOWED = [
  'system_capacity','azimuth','tilt','array_type',
  'module_type','losses','lat','lon','timeframe','dc_ac_ratio',
];

module.exports = async function handler(req, res) {
  const key = process.env.NREL_API_KEY;
  if (!key) {
    return res.status(500).json({ errors: ['NREL_API_KEY environment variable not set'] });
  }

  const params = new URLSearchParams({ api_key: key });
  ALLOWED.forEach(k => { if (req.query[k] != null) params.set(k, req.query[k]); });

  const upstream = await fetch(`https://developer.nrel.gov/api/pvwatts/v8.json?${params}`);
  const data = await upstream.json();

  // Cache identical requests for 24 h at the edge — same location/params = same TMY result
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.status(upstream.status).json(data);
};
