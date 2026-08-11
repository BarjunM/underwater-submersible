const HEAVY_ASSET_CACHE = 'public, max-age=3600, stale-while-revalidate=86400'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        /*
         * The baked feature edges are written to disk already gzipped by
         * scripts/build-edges.mjs — 1.80 MB of quantised coordinates down to
         * 0.72 MB — so the response has to declare that encoding for the
         * browser to inflate it.
         *
         * Compressing it at build time rather than leaving it to the server:
         * Next serves application/octet-stream uncompressed, and whether any
         * particular CDN in front of it compresses is not something the size
         * of the download should depend on.
         */
        source: '/models/rov-edges.bin',
        headers: [
          { key: 'Content-Encoding', value: 'gzip' },
          { key: 'Content-Type', value: 'application/octet-stream' },
          { key: 'Cache-Control', value: HEAVY_ASSET_CACHE },
        ],
      },
      {
        /*
         * The models get the same treatment, and need it more.
         *
         * Meshopt deliberately leaves its output easy for a general-purpose
         * compressor to squeeze — that is most of why it competes with Draco
         * on the wire despite decoding several times faster. Served raw it
         * throws that away: the outer file is 1.70 MB uncompressed and 1.09 MB
         * gzipped. scripts/convert-model.mjs writes them already compressed,
         * so the encoding has to be declared here.
         */
        source: '/models/:file(rov-outer|rov-inner).glb',
        headers: [
          { key: 'Content-Encoding', value: 'gzip' },
          { key: 'Content-Type', value: 'model/gltf-binary' },
          { key: 'Cache-Control', value: HEAVY_ASSET_CACHE },
        ],
      },
      {
        /*
         * The models and the plates. Vercel serves everything in
         * public/ with `max-age=0, must-revalidate`, which costs a round trip
         * per asset on every visit — for a 2.8 MB model that is the difference
         * between the machine appearing at once and appearing after a stall.
         *
         * Not `immutable`: these live at fixed URLs, so a re-converted model
         * would never reach anyone who had already loaded the old one. An hour
         * of hard cache with a day of background revalidation keeps repeat
         * visits instant and still lets a new export propagate on its own.
         */
        source: '/:dir(models|figures)/:file*',
        headers: [{ key: 'Cache-Control', value: HEAVY_ASSET_CACHE }],
      },
    ]
  },
}

export default nextConfig
