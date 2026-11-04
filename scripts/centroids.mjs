// Writes src/domain/centroids.json: where each country's nodes sit on the ops wall's globe, keyed by ISO 3166
// alpha-2 code. Positions are the centroid of each country's largest polygon in Natural Earth 1:50m
// (world-atlas), so overseas territories do not pull a country into the sea; small places missing from the
// map, such as Hong Kong at 1:110m, are covered because 1:50m includes them. Run: npm run centroids.
import { readFileSync, writeFileSync } from 'node:fs'
import { geoArea, geoCentroid } from 'd3-geo'
import { feature } from 'topojson-client'

const world = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'))
const codes = JSON.parse(readFileSync('node_modules/i18n-iso-countries/codes.json', 'utf8'))
const alpha2 = new Map(codes.map(([a2, , numeric]) => [numeric, a2]))
const result = {}
for (const f of feature(world, world.objects.countries).features) {
  const code = alpha2.get(String(f.id))
  if (!code || !f.geometry) continue
  const polygons =
    f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
      : [f.geometry]
  // A ring wound the other way reads as the rest of the sphere; its true area is the complement.
  const area = (p) => Math.min(geoArea(p), 4 * Math.PI - geoArea(p))
  const largest = polygons.reduce((a, b) => (area(b) > area(a) ? b : a))
  // Some codes name more than one feature (Australia and the Ashmore and Cartier Islands); the larger wins.
  if (result[code] && result[code].area >= area(largest)) continue
  const [lon, lat] = geoCentroid(largest)
  result[code] = { area: area(largest), at: [Math.round(lon * 10) / 10, Math.round(lat * 10) / 10] }
}
const sorted = Object.fromEntries(
  Object.entries(result)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, { at }]) => [code, at]),
)
writeFileSync('src/domain/centroids.json', JSON.stringify(sorted) + '\n')
console.log(`已写入 ${Object.keys(sorted).length} 个国家与地区的位置`)
